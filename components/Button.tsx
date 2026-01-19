import React, { useState, useRef ,useEffect} from 'react'; 
import { useNavigation } from '@react-navigation/native';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Image,
  GestureResponderEvent,
  ImageStyle,
  TextStyle,
  ViewStyle,
  PanResponder,
  Animated,
  Dimensions,
  Platform, StatusBar,
  ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

// BUTTON 1 
export interface Button1Props {
  text?: string;
  iconSource?: ImageSourcePropType;
  onPress?: (e: GestureResponderEvent) => void;
  containerStyle?: ViewStyle;
  backgroundColor?: string;
  width?: number | string;
  height?: number;
  border?: boolean;
  textStyle?: TextStyle;
  iconStyle?: ImageStyle;
  iconTintColor?: string;
}

export const Button1: React.FC<Button1Props> = ({
  text,
  iconSource,
  onPress,
  containerStyle,
  backgroundColor,
  width,
  height,
  border = false,
  textStyle,
  iconStyle,
  iconTintColor,
}) => {
  const isIcon = Boolean(iconSource); 
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles1.base,
        backgroundColor && { backgroundColor },
        width !== undefined ? ({ width } as ViewStyle) : undefined,
        height !== undefined ? ({ height } as ViewStyle) : undefined,
        border && isIcon && styles1.borderColor,
        containerStyle,
      ]}
    >
      {isIcon ? (
        <Image
          source={iconSource}
          resizeMode="contain"
          style={[
            styles1.icon,
            iconTintColor && { tintColor: iconTintColor },
            iconStyle,
          ]}
        />
      ) : (
        <Text style={[styles1.text, textStyle]}>{text}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles1 = StyleSheet.create({
  base: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '90%',
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  text: {
    fontFamily: fonts.family.medium,
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.medium,
    color: colors.secondary,
    paddingVertical:10.5,
  },
  icon: {
    width: 17.28,
    height: 17.28,
    marginHorizontal: 8.86,
    marginVertical: 6.36,
  },
 borderColor:{
   borderColor:colors.border,
   borderWidth:1
 }
});

/* -------------------- Button3  -------------------- */

export interface Button3Props {
  iconSource?: ImageSourcePropType;
  initialX?: number;
  initialY?: number;
  width?: number;
  height?: number;
  showBadge?: boolean;
  onPress?: () => void; // parent handles navigation / actions
  draggable?: boolean; // allow disabling drag if desired
}

const Button3: React.FC<Button3Props> = ({
  iconSource = require('../assets/icons/button3.png'),
  initialX,
  initialY,
  width = 60,
  height = 60,
  onPress,
  draggable = true,
}) => {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const marginRight = 20;

  // default initial position (if parent doesn't pass initialX/initialY)
  const defaultPosX = Math.max(8, screenWidth - (width+20) - marginRight);
  const defaultPosY = Math.max(8, screenHeight - (height+20) - 160);

  const initX = typeof initialX === 'number' ? initialX : defaultPosX;
  const initY = typeof initialY === 'number' ? initialY : defaultPosY;

  const pan = useRef(
    new Animated.ValueXY({
      x: initX,
      y: initY,
    })
  ).current;

  const [layoutReady, setLayoutReady] = useState(false);

  // safety limits for dragging (respect top safe area a bit)
  const androidStatusBarHeight =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  const topLimit = insets.top + (Platform.OS === 'android' ? androidStatusBarHeight + 8 : 8);
  const bottomLimit = screenHeight - height - Math.max(80, 56 - insets.bottom);

  // create panResponder only if draggable
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        draggable && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),

      onPanResponderMove: (_, gesture) => {
        if (!draggable) return;
        let newY = gesture.moveY - height / 2;
        if (newY < topLimit) newY = topLimit;
        if (newY > bottomLimit) newY = bottomLimit;

        pan.setValue({
          x: gesture.moveX - width / 2,
          y: newY,
        });
      },

      onPanResponderRelease: (_, gesture) => {
        if (!draggable) return;
        // snap X back to right edge (keeps UI tidy)
        const snapBackX = Math.max(8, screenWidth - width - marginRight);

        let finalY = gesture.moveY - height / 2;
        if (finalY < topLimit) finalY = topLimit;
        if (finalY > bottomLimit) finalY = bottomLimit;

        Animated.spring(pan, {
          toValue: { x: snapBackX, y: finalY },
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    // ensure initial position is applied once
    pan.setValue({ x: initX, y: initY });
    setLayoutReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = () => {
    if (onPress) onPress();
    // otherwise do nothing — parent controls navigation/actions
  };

  return (
    <Animated.View
      {...(draggable ? panResponder.panHandlers : {})}
      style={[
        {
          position: 'absolute',
          width,
          height,
        },
        pan.getLayout(),
      ]}
    >
      {/* touchable area */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      >
        <Image source={iconSource} style={{ width, height }} resizeMode="contain" />
      </TouchableOpacity>
    </Animated.View>
  );
};

export default Button3;