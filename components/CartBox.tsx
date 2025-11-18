import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ViewStyle,
    StyleProp,
    TouchableOpacity,
    GestureResponderEvent,
} from 'react-native';
import colors from '../styles/Colors';

type CartBoxProps = {
    width?: number | string;
    height?: number | string;
    borderRadius?: number;
    borderWidth?: number;
    borderColor?: string;
    backgroundColor?: string;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingVertical?: number;
    paddingHorizontal?: number;
    alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
    justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
    children?: React.ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
    onPress?: (event: GestureResponderEvent) => void;
    activeOpacity?: number;
};

const CartBox: React.FC<CartBoxProps> = ({
    width = '100%',
    height,
    borderRadius = 16,
    borderWidth = 0,
    borderColor = colors.cartbox_border,
    backgroundColor = colors.background,
    marginTop = 0,
    marginBottom = 0,
    marginLeft = 0,
    marginRight = 0,
    paddingTop = 0,
    paddingBottom = 0,
    paddingLeft = 0,
    paddingRight = 0,
    paddingVertical = 0,
    paddingHorizontal = 0,
    children,
    containerStyle,
    alignItems = 'center',
    justifyContent = 'center',
    onPress,
    activeOpacity = 0.8,
}) => {
    const boxStyle: StyleProp<ViewStyle> = {
        width: width as any, 
        height: height as any, 
        borderRadius,
        borderWidth,
        borderColor,
        backgroundColor,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        paddingVertical,
        paddingHorizontal,
        alignItems,
        justifyContent,
    };

    const renderChildren = () => {
        if (typeof children === 'string' || typeof children === 'number') {
            return <Text>{children}</Text>;
        }
        return children;
    };

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={activeOpacity}
                style={[boxStyle, containerStyle]}
            >
                {renderChildren()}
            </TouchableOpacity>
        );
    }

    return <View style={[boxStyle, containerStyle]}>{renderChildren()}</View>;
};

export default CartBox;
