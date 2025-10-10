import React from 'react';
import {
  GestureResponderEvent,
  Image,
  ImageStyle,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  DimensionValue,
} from 'react-native';

import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

const HEADER_HEIGHT = 59; 

// Interfaces
interface BaseContent {
  visible?: boolean;
  containerStyle?: ViewStyle;
  marginLeft?: number;
  marginRight?: number;
}

interface ImageContent extends BaseContent {
  type: 'image';
  url: string | ReturnType<typeof require>;
  width?: number;
  height?: number;
  imageStyle?: ImageStyle;
  onPress?: (e: GestureResponderEvent) => void;
}

interface TextContent extends BaseContent {
  type: 'text';
  value: string;
  color?: string;
}

interface TextBlockContent extends BaseContent {
  type: 'textblock';
  title: string;
  subtitle: string;
  titleStyle?: TextStyle;
}

type ContentItem = ImageContent | TextContent | TextBlockContent;

interface HeaderProps {
  left?: ContentItem | ContentItem[];
  center?: ContentItem | ContentItem[];
  right?: ContentItem | ContentItem[];

  headerStyle?: ViewStyle;
  width?: number | string;
  backgroundColor?: string;
  position?: 'absolute' | 'relative';
  top?: number;
  bottom?: number;
  leftPosition?: number;
  rightPosition?: number;
  marginLeft?: number;
  marginRight?: number;
}

const DEFAULT_IMAGE_SIZE = 24;
const DEFAULT_TEXT_MAX_WIDTH = 190;
const DEFAULT_SUBTITLE_MAX_WIDTH = 160;

const Header: React.FC<HeaderProps> = ({
  left,
  center,
  right,
  headerStyle = {},
  width = '100%',
  backgroundColor = colors.secondary,
  position = 'relative',
  top,
  bottom,
  leftPosition,
  rightPosition,
  marginLeft,
  marginRight,
}) => {
  const normalizeContentArray = (content?: ContentItem | ContentItem[]): ContentItem[] =>
    content ? (Array.isArray(content) ? content : [content]) : [];

  const renderContent = (content: ContentItem, index: number) => {
    if (content.visible === false) return null;

    const wrapperStyle = [
      styles.contentWrapper,
      content.containerStyle,
      content.marginLeft !== undefined ? { marginLeft: content.marginLeft } : {},
      content.marginRight !== undefined ? { marginRight: content.marginRight } : {},
    ] as any;

    const Wrapper = (content as any).onPress ? TouchableOpacity : View;

    switch (content.type) {
      case 'image': {
        const imageSource = typeof content.url === 'string' ? { uri: content.url } : content.url;
        const imageStyle = [
          styles.image,
          {
            width: content.width ?? DEFAULT_IMAGE_SIZE,
            height: content.height ?? DEFAULT_IMAGE_SIZE,
          },
          content.imageStyle,
        ] as ImageStyle;

        return (
          <Wrapper
            key={`image-${index}`}
            onPress={(content as ImageContent).onPress}
            style={wrapperStyle}
            activeOpacity={0.7}
          >
            <View style={styles.imageContainer}>
              <Image source={imageSource} style={imageStyle} resizeMode="contain" />
            </View>
          </Wrapper>
        );
      }

      case 'text': {
        return (
          <View key={`text-${index}`} style={wrapperStyle}>
            <Text
              style={[styles.text, { color: (content as TextContent).color ?? colors.text }]}
              numberOfLines={1}
            >
              {(content as TextContent).value}
            </Text>
          </View>
        );
      }

      case 'textblock': {
        const tb = content as TextBlockContent;
        return (
          <View key={`textblock-${index}`} style={[styles.textBlockWrapper, wrapperStyle]}>
            <Text style={[styles.textBlockTitle, tb.titleStyle]} numberOfLines={1}>
              {tb.title}
            </Text>
            <Text style={styles.textBlockSubtitle} numberOfLines={1}>
              {tb.subtitle}
            </Text>
          </View>
        );
      }

      default:
        return null;
    }
  };

  const leftContents = normalizeContentArray(left).filter(c => c.visible !== false);
  const centerContents = normalizeContentArray(center).filter(c => c.visible !== false);
  const rightContents = normalizeContentArray(right).filter(c => c.visible !== false);

  // dynamic container props (minimal inline styles — necessary because these props are dynamic)
  const containerDynamicStyle = {
    width: width as DimensionValue,
    height: HEADER_HEIGHT,
    backgroundColor,
    position,
    top,
    bottom,
    left: leftPosition,
    right: rightPosition,
    marginLeft,
    marginRight,
  } as ViewStyle;

  return (
    <View style={[styles.headerContainer, containerDynamicStyle, headerStyle]}>
      <View style={[styles.sideContainer, leftContents.length === 0 && styles.emptySide]}>
        {leftContents.map(renderContent)}
      </View>

      <View style={[styles.centerContainer, centerContents.length === 0 && styles.emptyCenter]}>
        {centerContents.map(renderContent)}
      </View>

      <View style={[styles.sideContainerRight, rightContents.length === 0 && styles.emptySide]}>
        {rightContents.map(renderContent)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth:1,
    borderBottomColor: colors.cartbox_border,
  },
  sideContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 40,
  },
  sideContainerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
    minWidth: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySide: {
    width: 0,
  },
  emptyCenter: {
    flex: 0,
  },
  contentWrapper: {
    paddingHorizontal: 4,
  },
  text: {
    fontSize: fonts.size.xl, // 20
    fontFamily: fonts.family.medium,
    color: colors.text,
    maxWidth: DEFAULT_TEXT_MAX_WIDTH,
  },
  textBlockWrapper: {
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  textBlockTitle: {
    fontSize: fonts.size.s, // 12
    color: colors.subtext,
    fontFamily: fonts.family.regular,
  },
  textBlockSubtitle: {
    fontSize: fonts.size.m, // 14
    color: colors.text,
    fontFamily: fonts.family.medium,
    maxWidth: DEFAULT_SUBTITLE_MAX_WIDTH,
  },
  imageContainer: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: DEFAULT_IMAGE_SIZE,
    height: DEFAULT_IMAGE_SIZE,
  },
});

export default Header;
