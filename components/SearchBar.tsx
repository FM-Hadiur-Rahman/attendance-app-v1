// components/common/SearchBar.tsx
import React, { forwardRef, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Image,
  TextStyle,
  ViewStyle,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

interface SearchBarProps {
  value?: string;
  placeholder?: string;
  onChangeText?: (text: string) => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  iconSource?: any;
  iconStyle?: ViewStyle;
  placeholderColor?: string;
  textColor?: string;
  borderColor?: string;
  borderRadius?: number;
  onSubmitEditing?: () => void;
}

const SearchBar = forwardRef<TextInput, SearchBarProps>(
  (
    {
      value,
      placeholder = 'Search by name or ID',
      onChangeText,
      containerStyle,
      inputStyle,
      iconSource = require('../assets/icons/search_b.png'),
      placeholderColor = colors.subtext3,
      textColor = colors.text,
      borderColor = colors.primary,
      borderRadius = 12,
      onSubmitEditing,
    },
    ref
  ) => {
    const { width } = useWindowDimensions();
    const isTablet = width >= 600;
    const innerPadding = isTablet ? 16 : 12;
    const inputRef = ref || useRef<TextInput>(null);

    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View
          style={[
            styles.container,
            {
              borderColor: borderColor,
              borderRadius: borderRadius,
            },
            containerStyle,
          ]}
        >
          <View style={styles.innerRow}>
            {iconSource && (
              <Image
                source={iconSource}
                style={[styles.icon]}
              />
            )}
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                { color: textColor },
                inputStyle,
              ]}
              value={value}
              placeholder={placeholder}
              placeholderTextColor={placeholderColor}
              onChangeText={onChangeText}
              returnKeyType="search"
              onSubmitEditing={onSubmitEditing}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.secondary,
    borderWidth: 1,
    justifyContent: 'center',
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
    marginLeft: 12,
  },
  icon: {
    width: 16,
    height: 16,
    marginRight: 4,
    resizeMode: 'contain',
  },
  input: {
    flex: 1,
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any, 
    paddingVertical: 0,
  },
});

export default SearchBar;
