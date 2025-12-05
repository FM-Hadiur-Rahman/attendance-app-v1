import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import Header from '../../components/Header';
import CartBox from '../../components/CartBox';
import { GroupedContactList, contactList } from '../../components/Contact';
import { Content, contents } from '../../api/Content';

import colors from '../../styles/Colors';
import fonts from '../../styles/Fonts';
const translations = require('../../assets/translations.json');

type RootStackParamList = {
  TermsScreen: {
    userId: string;
    langId: string;
    branchId: string;
  };
};

const TermsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'TermsScreen'>>();

  const incomingUserId = route.params.userId ?? undefined;
  const incomingLangId = route.params.langId ?? 'en';
  const incomingBranchId = route.params.branchId ?? undefined;

  console.log('TermsScreen -> received params:', {
    userId: incomingUserId,
    langId: incomingLangId,
    branchId: incomingBranchId,
  });

  const lang = translations[incomingLangId as keyof typeof translations] || translations['en'];

  const [refreshing, setRefreshing] = useState(false);
  const [termsContent, setTermsContent] = useState<Content | null>(null);

  useEffect(() => {
    // Get terms content from API (id "3" or title "terms")
    const terms =
      contents.find(c => c.id === '3' || c.title === 'terms') || null;
    setTermsContent(terms);
  }, []);

  // Refresh function
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); }, 1500);
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
              <Text style={styles.termDescription}>No terms available</Text>
            )}
          </View>
        </View>

        {/*  Pass branchId and language to GroupedContactList*/}
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
    fontWeight: fonts.weight.regular,
    fontSize: fonts.size.s,
    lineHeight: 18,
    color: colors.subtext2,
  },
});
