// screens/main/TermsScreen.tsx
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Header from '../../components/Header';
import colors from '../../styles/Colors';
import { GroupedContactList, contactList } from '../../components/Contact';
import CartBox from '../../components/CartBox';
import fonts from '../../styles/Fonts';
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

const TermsScreen = () => {
  const { width } = Dimensions.get('window');
  const navigation = useNavigation();
  const route = useRoute() as RouteProp<RouteParams['params'], 'params'>;

  //  accept multiple param name variants and provide fallbacks
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

  console.log('TermsScreen -> received params:', {
    userId: incomingUserId,
    langId: incomingLangId,
    branchId: incomingBranchId,
  });

  const lang = translations[(incomingLangId as string) || 'en'] ?? translations['en'];

  const [refreshing, setRefreshing] = useState(false);
  const [termsContent, setTermsContent] = useState<Content | null>(null);

  useEffect(() => {
    // Get terms content from API (id "3" or title "terms")
    const terms =
      contents.find(c => c.id === '3' || c.title === 'terms') || null;
    setTermsContent(terms);
  }, []);

  // 🔹 Refresh function
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

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
        center={{
          type: 'text',
          value: lang.terms_of_service ?? 'Terms of Service',
          color: colors.text,
        }}
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
          <CartBox borderWidth={0} backgroundColor={colors.secondary}>
            <Image
              source={require('../../assets/icons/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </CartBox>

          <View style={styles.termsContainer}>
            {termsContent ? (
              <Text style={styles.termDescription}>{termsContent.body}</Text>
            ) : (
              <Text style={styles.termDescription}>{lang.No_terms_available}</Text>
            )}
          </View>
        </View>

        {/*  Pass branchId and language to GroupedContactList (same as PrivacyScreen) */}
        <GroupedContactList
          data={contactList}
          lang={lang}
          branchId={incomingBranchId}
        />
      </ScrollView>
    </View>
  );
};

export default TermsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  scrollContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logoImage: {
    width: 143,
    height: 83,
    marginVertical: 20,
  },
  termsContainer: {
    width: '100%',
  },
  termDescription: {
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.s,
    lineHeight: 18,
    color: colors.subtext2,
  },
  heading: {
    width: '100%',
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.semibold as any,
    fontSize: fonts.size.l,
    lineHeight: 16,
    color: colors.text,
  },
});
