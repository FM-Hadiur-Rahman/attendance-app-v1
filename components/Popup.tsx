// components/common/Popup.tsx
import React, { useEffect } from 'react';
import {
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
  useWindowDimensions
} from 'react-native';
import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

export interface PopupProps {
  visible: boolean;
  onClose: () => void;
  overlayBackgroundColor?: string;
  overlayStyle?: ViewStyle;
  popupStyle?: ViewStyle;
  popupBorderColor?: string; // new prop to change border color easily
  title?: string;
  titleStyle?: TextStyle;
  message?: string;
  messageStyle?: TextStyle;
  optionBoxes?: Array<{
    id: string;
    imageSource: ImageSourcePropType;
    heading: string;
    subtitle: string;
  }>;
  selectedBoxId?: string;
  onSelectBox?: (id: string) => void;
  boxStyle?: ViewStyle;
  selectedBoxStyle?: ViewStyle;
  boxImageStyle?: ViewStyle;
  boxHeadingStyle?: TextStyle;
  boxSubtitleStyle?: TextStyle;
  spacingBetweenBoxes?: number;
  spacingAboveBoxes?: number;
  children?: React.ReactNode;
  dismissOnOverlayPress?: boolean;
  useKeyboardAvoidingView?: boolean;
  useSafeArea?: boolean;
}

const Popup: React.FC<PopupProps> = ({
  visible,
  onClose,
  // default overlay: #2196F3 at 20% opacity
  overlayBackgroundColor = colors.popup_overlayBackgroundColor,
  overlayStyle,
  popupStyle,
  popupBorderColor = colors.popupBorderColor, // default border color
  title,
  titleStyle,
  message,
  messageStyle,
  optionBoxes,
  selectedBoxId,
  onSelectBox,
  boxStyle,
  selectedBoxStyle,
  boxImageStyle,
  boxHeadingStyle,
  boxSubtitleStyle,
  spacingBetweenBoxes = 12,
  spacingAboveBoxes = 20,
  children,
  // default: clicking outside DOES NOT dismiss (caller can override)
  dismissOnOverlayPress = false,
  useKeyboardAvoidingView = false,
  useSafeArea = false,
}) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;

  useEffect(() => {
    // auto-close only if visible and no children (same behavior as before)
    if (visible && !children) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => { clearTimeout(timer); };
    }
  }, [visible, children, onClose]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlayContainer,
          { backgroundColor: overlayBackgroundColor },
          overlayStyle,
        ]}
      >
        {dismissOnOverlayPress ? (
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        ) : null}

        {useKeyboardAvoidingView ? (
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', android: 'height' })}
            style={styles.centeredContainer}
          >
            {renderPopupBox()}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.centeredContainer}>
            {renderPopupBox()}
          </View>
        )}
      </View>
    </Modal>
  );

  function renderPopupBox() {
    const box = (
      <View
        // default width 90% center-aligned, can still be overridden by popupStyle
        style={[
          styles.popupBoxDefault,
          { borderColor: popupBorderColor },
          popupStyle,
        ]}
      >
        {title ? (
          <Text
            // default heading style: center, #2196F3, weight 400, size 14, marginBottom 8
            style={[styles.titleDefault, titleStyle]}
          >
            {title}
          </Text>
        ) : null}

        {message && !optionBoxes ? (
          <Text
            // default message style: size 12, weight 400, #757575
            style={[styles.messageDefault, messageStyle]}
          >
            {message}
          </Text>
        ) : null}

        {Array.isArray(optionBoxes) && optionBoxes.length > 0 ? (
          <View style={{ marginTop: spacingAboveBoxes }}>
            {optionBoxes.map((item) => {
              const isSelected = selectedBoxId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  onPress={() => onSelectBox?.(item.id)}
                  style={[
                    styles.optionBoxDefault,
                    { width: isTablet ? '90%' : '100%' },
                    boxStyle,
                    isSelected ? [styles.optionBoxSelectedDefault, selectedBoxStyle] : null,
                  ]}
                >
                  <View style={styles.optionBoxContent}>
                    <Image
                      source={item.imageSource}
                      style={[styles.optionBoxImageDefault]}
                    />
                    <View style={styles.optionBoxTextContainer}>
                      <Text style={[styles.optionBoxHeadingDefault, boxHeadingStyle]}>
                        {item.heading}
                      </Text>
                      <Text style={[styles.optionBoxSubtitleDefault, boxSubtitleStyle]}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {children}
      </View>
    );

    return useSafeArea ? (
      <SafeAreaView style={styles.safeAreaContainer}>{box}</SafeAreaView>
    ) : (
      box
    );
  }
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 0, // caller wanted marginleft/right 0
  },
  popupBoxDefault: {
    backgroundColor: colors.secondary, // inside popup white
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.popupBorderColor, // default (overridden by popupBorderColor prop)
    paddingVertical: 20,
    paddingHorizontal: 20,
    // width 90% center align
    width: '90%',
    marginLeft: 0,
    marginRight: 0,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  titleDefault: {
    fontSize: fonts.size.m,
fontWeight: fonts.weight.regular,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageDefault: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
    textAlign: 'center',
    marginBottom: 12,
  },
  safeAreaContainer: {
    width: '100%',
    alignItems: 'center',
  },
  optionBoxDefault: {
    height: 70,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.secondary,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
    justifyContent: 'center',
  },
  optionBoxSelectedDefault: {
    borderColor: colors.primary,
  },
  optionBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: '100%',
  },
  optionBoxImageDefault: {
    width: 46,
    height: 46,
    resizeMode: 'cover',
    marginRight: 8,
  },
  optionBoxTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  optionBoxHeadingDefault: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
    marginBottom: 6,
  },
  optionBoxSubtitleDefault: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
  },
});

export default Popup;
