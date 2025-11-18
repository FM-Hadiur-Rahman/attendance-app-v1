import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Image } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Header from '../../components/Header';
import colors from '../../styles/Colors';
import { GroupedContactList } from '../../components/Contact';
import CartBox from '../../components/CartBox';
import fonts from '../../styles/Fonts';
import transilations from "../../assets/translations.json"
import { contents } from "../../api/Content";

type AboutScreenProps = {
  userId?: string;
  langId?: string;           // received from ProfileScreen
  setLangId?: (lang: string) => void;
};

type RouteParams = {
  params: {
    userId?: string;
    UserId?: string;
    langId?: string;
    LangId?: string;
    branchId?: string;
    BranchId?: string;
    [k: string]: any;
  };
};
const translations = require('../../assets/translations.json');


const AboutScreen: React.FC<AboutScreenProps> = () => {
  const navigation = useNavigation();

  const route = useRoute() as RouteProp<RouteParams['params'], 'params'>;

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

  console.log('AboutScreen-> received params:', {
    userId: incomingUserId,
    langId: incomingLangId,
    branchId: incomingBranchId,
  });
  const lang = translations[(incomingLangId as string) || 'en'] ?? translations['en'];

  const [refreshing, setRefreshing] = useState(false);
  const aboutUsContent = contents.find((c) => c.id === "1");


  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
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
        center={{ type: 'text', value: lang.about_us, color: colors.text }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]} 
            progressBackgroundColor={colors.secondary} 
            tintColor={colors.primary} 
          />
        }
      >
        <CartBox
          borderWidth={0}
          backgroundColor={colors.secondary}

        >
          <Image
            source={require('../../assets/icons/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </CartBox>
        <View style={styles.termsContainer}>
          {aboutUsContent ? (
            <Text style={styles.termDescription}>{aboutUsContent.body}</Text>
          ) : (
            <Text style={styles.termDescription}>{lang.No_content_found}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default AboutScreen;

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
  termBlock: {
    marginBottom: 12,
  },
  termDescription: {
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.s,
    lineHeight: 18,
    color: colors.subtext2,
  },

});