import React, { forwardRef } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

interface InputBoxProps extends TextInputProps {
  setValue?: (value: string) => void;
  label?: string;
  leftIcon?: any;
  leftIcon2?: any;
  rightIcon?: any;
  onLeftIconPress?: () => void;
  onLeftIcon2Press?: () => void;
  onRightIconPress?: () => void;
  onPress?: () => void;
  inputStyle?: TextStyle;
  leftIconStyle?: any;
  leftIcon2Style?: any;
  rightIconStyle?: any;
  borderColor?: string;
  errorMessage?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768;

const InputBox = forwardRef<TextInput, InputBoxProps>(
  (
    {
      style,
      placeholder,
      secureTextEntry,
      keyboardType,
      value,
      setValue,
      multiline,
      label,
      leftIcon,
      leftIcon2,
      rightIcon,
      leftIconStyle,
      leftIcon2Style,
      rightIconStyle,
      onLeftIconPress,
      onLeftIcon2Press,
      onRightIconPress,
      onPress,
      borderColor = colors.primary,
      editable = true,
      errorMessage,
      inputStyle,
      ...rest
    },
    ref
  ) => {
    // Use red border if error exists
    const currentBorderColor = errorMessage ? colors.error_text : borderColor;

    return (
      <View style={styles.wrapper}>
        <TouchableOpacity
          activeOpacity={onPress ? 0.8 : 1}
          onPress={onPress}
          disabled={!onPress}
        >
          <View style={[styles.container, { borderColor: currentBorderColor }]}> 
            {/* Label (inside input container, first line) */}
            {label ? (
              <Text style={styles.label}>{label}</Text>
            ) : null}

            <View style={styles.inputRow}>
              {/* left icon optional (kept for flexibility) */}
              {leftIcon ? (
                <TouchableOpacity onPress={onLeftIconPress} style={[styles.iconTouch, leftIconStyle]}>
                  <Image source={leftIcon} style={[styles.icon, leftIconStyle]} />
                </TouchableOpacity>
              ) : null}
              {leftIcon2 ? (
                <TouchableOpacity onPress={onLeftIcon2Press} style={[styles.iconTouch, leftIcon2Style]}>
                  <Image source={leftIcon2} style={[styles.icon, leftIcon2Style]} />
                </TouchableOpacity>
              ) : null}

              <TextInput
                ref={ref}
                placeholder={placeholder}
                placeholderTextColor={colors.subtext3}
                secureTextEntry={secureTextEntry}
                keyboardType={keyboardType}
                onChangeText={setValue}
                multiline={multiline}
                value={value}
                style={[
                  styles.input,
                  style,
                  inputStyle,
                  multiline ? styles.multilineInput : undefined,
                ]}
                textAlignVertical={multiline ? 'top' : 'center'}
                editable={editable && !onPress ? true : false}
                pointerEvents={onPress ? 'none' : 'auto'}
                {...rest}
              />

              {rightIcon ? (
                <TouchableOpacity onPress={onRightIconPress} style={[styles.iconTouch, rightIconStyle]}>
                  <Image source={rightIcon} style={[styles.icon, rightIconStyle]} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrapper: { marginBottom: 20 },
  container: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.secondary,
  },
  label: {
    color: colors.primary,
    fontSize: fonts.size.xs,
    fontFamily: Platform.select({ ios: fonts.family.regular, android: fonts.family.regular }),
    fontWeight: fonts.weight.regular as any,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: fonts.size.m,
    color: colors.text,
    padding: 0,
    margin: 0,
    // no fixed height — lets paddingVertical control the size
    fontFamily: fonts.family.regular,
  },
  multilineInput: {
    paddingTop: 6,
    paddingBottom: 6,
    textAlignVertical: 'top',
  },
  iconTouch: {
    padding: 0,
  },
  icon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    //tintColor: colors.subtext3,
    marginLeft: 0,
    marginRight: 0,
  },
  error: { color: colors.error_text, fontSize: fonts.size.s, marginTop: 4, marginLeft: 4 },
});

export default InputBox;
