// PrivacyPolicy.tsx
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Header from '../../components/Header';
import CartBox from '../../components/CartBox';
import { contactList, GroupedContactList } from '../../components/Contact';
import colors from '../../styles/Colors';
import { contents, Content } from '../../api/Content';

type RouteParams = {
  params: {
    orderId?: string;
    userId?: string;
    UserId?: string;
    langId?: 'en' | 'de' | string;
    LangId?: string;
    branchId?: string;
    BranchId?: string;
    [k: string]: any;
  };
};
const translations = require('../../assets/translations.json');

const PrivacyScreen = () => {
  const { width } = Dimensions.get('window');
  const navigation = useNavigation();
  const route = useRoute() as RouteProp<RouteParams['params'], 'params'>;

  // accept multiple param name variants and provide fallbacks
  const incomingUserId =
    route.params?.userId ??
    route.params?.UserId ??
    route.params?.id ??
    null;

  const incomingLangId =
    route.params?.langId ??
    route.params?.LangId ??
    route.params?.language ??
    'en';

  const incomingBranchId =
    route.params?.branchId ??
    route.params?.BranchId ??
    route.params?.branch ??
    null;

  console.log('PrivacyScreen -> received params:', {
    userId: incomingUserId,
    langId: incomingLangId,
    branchId: incomingBranchId,
  });


  const lang = translations[(incomingLangId as string) || 'en'] ?? translations['en'];

  const [refreshing, setRefreshing] = useState(false);
  const [privacyContent, setPrivacyContent] = useState<Content | null>(null);

  useEffect(() => {
    // Get privacy content from API
    const privacy = contents.find(c => c.title === 'privacy') || null;
    setPrivacyContent(privacy);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Split the body into sections using regex to detect numbering like "1. ", "2. ", etc.
  const parseBody = (body: string) => {
    // Split by double newlines (assuming each section separated by 2 line breaks)
    const sections = body.trim().split(/\n\n+/);
    return sections.map(section => {
      const [subheading, ...rest] = section.split('\n'); // first line = subheading
      return {
        subheading: subheading.trim(),
        description: rest.join('\n').trim(),
      };
    });
  };

  const terms = privacyContent ? parseBody(privacyContent.body) : [];

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: 'image',
          url: require('../../assets/icons/back_b.png'),
          width: 24,
          height: 24,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: 'text', value: lang.privacy_policy?? 'Privacy policy', color: colors.text }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.secondary}
          />
        }
      >
        <View style={styles.scrollContainer}>
          <View style={styles.contentGroup}>
            <Image
              source={require('../../assets/icons/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />

            <Text style={styles.heading}>Privacy Policy – Wholesale App</Text>

            {terms.map((term, index) => (
              <CartBox
                key={index}
                width="100%"
                backgroundColor={colors.secondary}
                marginBottom={index === terms.length - 1 ? 0 : 12}
                containerStyle={styles.termGroup}
              >
                <Text style={styles.subheading}>{term.subheading}</Text>
                <Text style={styles.description}>{term.description}</Text>
              </CartBox>
            ))}
          </View>
        </View>
        <GroupedContactList data={contactList} lang={lang} branchId={incomingBranchId} />
      </ScrollView>
    </View>
  );
};

export default PrivacyScreen;


const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
    backgroundColor: colors.secondary,
  },
  scrollContainer: {
    alignItems: 'center',
  },
  contentGroup: {
    width: '90%',
    alignItems: 'center',
  },
  logoImage: {
    width: 143,
    height: 83,
    marginTop: 20,
    marginBottom: 20,
  },
  heading: {
    width: '100%',
    fontFamily: 'Montserrat',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 16,
    color: colors.text,
    marginBottom: 20,
  },
  termGroup: {
    alignItems: 'flex-start',
    width: '100%',
  },
  subheading: {
    fontFamily: 'Montserrat',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 14,
    color: colors.text,
    marginBottom: 4,
  },
  description: {
    fontFamily: 'Montserrat',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 14,
    color: colors.subtext2,
  },
});
