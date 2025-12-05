// components/CustomToast.tsx
import React from 'react';
import {
  Image,
  ImageSourcePropType,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import Toast, { BaseToastProps } from 'react-native-toast-message';
import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

type ToastType = 'success' | 'warning' | 'error';

const toastStyles: Record<
  ToastType,
  {
    bg: string;
    textColor: string;
    borderColor?: string;
    icon?: ImageSourcePropType; // optional icon require() or uri
    fontWeight?: TextStyle['fontWeight'];
    fontSize?: number;
  }
> = {
  success: {
    bg: colors.secondary,
    textColor: colors.primary,
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.l,
  },
  warning: {
    bg: colors.secondary,
    textColor: colors.sub_background2,
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.l,
  },
  error: {
    bg: colors.secondary,
    textColor: colors.error_toast_bg,
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.l,
  },
};

const CustomToast = ({
  text1,
  type,
}: BaseToastProps & { type: ToastType }) => {
  const { width } = useWindowDimensions();

  const style = (toastStyles)[type] ?? toastStyles.success;

  // responsive values
  const isTablet = width > 600;
  const containerWidth = width * 0.9;
  const iconSize = isTablet ? 30 : 20;
  const fontSize = style.fontSize ?? (isTablet ? fonts.size.l : fonts.size.m);
  const padding = isTablet ? 14 : 12;

  // Make both success AND error use the stronger shadow
  const strongShadow = type === 'success' || type === 'error';

  return (
    <View
      style={[
        styles.toastContainer,
        {
          backgroundColor: style.bg,
          width: containerWidth,
          padding,
          borderColor: style.borderColor ?? 'transparent',
          borderWidth: style.borderColor ? 1 : 0,

          // shadow settings: now success AND error use the stronger shadow
          shadowColor: strongShadow ? colors.text : colors.text,
          shadowOpacity: strongShadow ? 0.25 : 0.15,
          shadowRadius: strongShadow ? 4 : 6,
          shadowOffset: { width: 0, height: strongShadow ? 4 : 3 },
          elevation: strongShadow ? 4 : 6,
        },
      ]}
    >
      {/* optional icon (render only if provided in toastStyles) */}
      {style.icon ? (
        <Image
          source={style.icon}
          style={{ width: iconSize, height: iconSize, marginRight: 12 }}
          resizeMode="contain"
        />
      ) : null}

      <Text
        style={[
          styles.toastText,
          {
            color: style.textColor,
            fontSize,
            fontFamily: fonts.family.medium,
            fontWeight: style.fontWeight ?? fonts.weight.medium,
            textAlign: 'center',
          },
        ]}
        numberOfLines={3}
      >
        {text1}
      </Text>
    </View>
  );
};

export const toastConfig = {
  success: (props: BaseToastProps) => <CustomToast {...props} type="success" />,
  warning: (props: BaseToastProps) => <CustomToast {...props} type="warning" />,
  error: (props: BaseToastProps) => <CustomToast {...props} type="error" />,
};

// Helper functions — now use bottomOffset for bottom-positioned toasts
const defaultBottomOffset = Platform.OS === 'android' ? 70 : 70;

export const showSuccessToast = (text: string, duration: number = 3000) =>
  Toast.show({
    type: 'success',
    text1: text,
    position: 'bottom',
    bottomOffset: defaultBottomOffset, 
    visibilityTime: duration,
    autoHide: true,
  });

export const showWarningToast = (text: string, duration: number = 3000) =>
  Toast.show({
    type: 'warning',
    text1: text,
    position: 'bottom',
    bottomOffset: defaultBottomOffset, 
    visibilityTime: duration,
    autoHide: true,
  });

export const showErrorToast = (text: string, duration: number = 3000) =>
  Toast.show({
    type: 'error',
    text1: text,
    position: 'bottom',
    bottomOffset: defaultBottomOffset, 
    visibilityTime: duration,
    autoHide: true,
  });

const styles = StyleSheet.create({
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 10,
  },
  toastText: {
    flex: 1,
    flexWrap: 'wrap',
  },
});

export default Toast;
