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


type AboutScreenProps = {
  userId?: string;
  langId?: string;           // received from ProfileScreen
  setLangId?: (lang: string) => void;
};


const AboutScreen: React.FC<AboutScreenProps> = () => {

  const navigation = useNavigation();
  const route = useRoute<any>();
  const { userId, langId, setLangId } = route.params || {};

  const [refreshing, setRefreshing] = useState(false);
  const currentLang = langId || "en";
  const lang = translations[currentLang as keyof typeof translations] || translations["en"];
  const aboutUsContent = contents.find((c) => c.id === "1");


  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // simulate reload (e.g., API call, reload terms, etc.)
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
            colors={[colors.primary]} // 🔹 spinner (Android)
            progressBackgroundColor={colors.secondary} // 🔹 background behind spinner
            tintColor={colors.primary} // 🔹 spinner (iOS)
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
            <Text style={styles.termDescription}>No content found</Text>
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