import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Header from '../../components/Header';
import colors from '../../styles/Colors';
import { GroupedContactList } from '../../components/Contact';
import CartBox from '../../components/CartBox';
import fonts from '../../styles/Fonts';
import translations from "../../assets/translations.json"
import { contents } from "../../api/Content"; // import API


type TermsScreenProps = {
  userId?: string;
  langId?: string;           // ✅ received from ProfileScreen
  setLangId?: (lang: string) => void;
};


const TermsScreen: React.FC<TermsScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
    const { userId, langId, setLangId } = route.params || {};

   const currentLang = langId || "en";
  const lang = translations[currentLang]
  
  console.log('TermsScreen -> received params:', { userId, langId });

    
    const termsContent = contents.find((c) => c.id === "3");

  // 🔹 State for refresh
  const [refreshing, setRefreshing] = useState(false);

  // 🔹 Refresh function
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
        center={{ type: 'text', value: lang.terms_of_service, color: colors.text }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]} // 🔹 spinner color (Android)
            tintColor={colors.primary}// 🔹 spinner color (iOS)
            progressBackgroundColor={colors.secondary}
          />
        }
      >
        <CartBox
          borderWidth={0}
          backgroundColor ={colors.secondary}
        >
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

        <GroupedContactList />
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
    paddingBottom: 20,
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
  termTitle: {
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.semibold as any,
    fontSize: fonts.size.s,
    lineHeight: 18,
    color: colors.text,
    marginBottom: 4,
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
    marginBottom: 20,
  },
});
