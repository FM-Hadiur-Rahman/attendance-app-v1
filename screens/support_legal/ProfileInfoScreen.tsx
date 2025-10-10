import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, RefreshControl } from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";
import CartBox from "../../../components/CartBox";
import { User, users } from "../../../api/User";
import transilations from "../../../assets/translations.json"
import { useNavigation, useRoute } from "@react-navigation/core";

type ProfileInfoScreenProps = {
  userId?: string;
  langId?: string;           // ✅ received from ProfileScreen
  setLangId?: (lang: string) => void;
};


const ProfileInfoScreen: React.FC<ProfileInfoScreenProps> = () => {
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const route = useRoute<any>();
const { userId, langId, setLangId } = route.params || {};

  const user = users.find(u => u.id === userId);

  const currentLang = langId || "en";
  const lang = transilations[currentLang];





  const onRefresh = useCallback(() => {
    setRefreshing(true);

    setTimeout(() => {
      // re-fetch user whenever userId changes
      setRefreshing(false);
    }, 1500);
  }, [userId]);

  // Get user with ID "U001"

  // If user not found, show empty screen or placeholder
  if (!user) {
    return (
      <View style={styles.container}>
        <Header
          backgroundColor={colors.secondary}
          position="relative"
          left={{
            type: "image",
            url: require("../../../assets/icons/arrow_back_o.png"),
            width: 24,
            height: 24,
            onPress: () => navigation.goBack(),
          }}
          center={{ type: "text", value: lang.profile_information, color: colors.text }}
        />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.subtext }}>User not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: "image",
          url: require("../../../assets/icons/arrow_back_o.png"),
          width: 24,
          height: 24,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: "text", value: lang.profile_information, color: colors.text }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Business Details */}
        <CartBox paddingTop={13} paddingRight={10} paddingLeft={10} marginBottom={12} alignItems="flex-start" justifyContent="flex-start" height={161}>
          <Text style={styles.sectionTitle}>{lang.businessDetails}</Text>

          {/* Business Name */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12, marginBottom: 12 }}>
            <Image source={require("../../../assets/icons/b.name.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.businessName}</Text>
              <Text style={styles.value}>WholeSales app</Text>
            </View>
          </View>

          {/* Business Type */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12 }}>
            <Image source={require("../../../assets/icons/b.type.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.businessType}</Text>
              <Text style={styles.value}>WholeSales</Text>
            </View>
          </View>
        </CartBox>

        {/* Owner Information */}
        <CartBox paddingTop={13} paddingRight={10} paddingLeft={10} marginBottom={12} alignItems="flex-start" justifyContent="flex-start" height={221}>
          <Text style={styles.sectionTitle}>{lang.ownerInformation}</Text>

          {/* Salutation */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12, marginBottom: 12 }}>
            <Image source={require("../../../assets/icons/salutation.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.salutation}</Text>
              <Text style={styles.value}>{user.salutation}</Text>
            </View>
          </View>

          {/* Full Name */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12, marginBottom: 12 }}>
            <Image source={require("../../../assets/icons/fullname.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.fullName}</Text>
              <Text style={styles.value}>{user.firstname} {user.lastname}</Text>
            </View>
          </View>

          {/* Phone Number */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12 }}>
            <Image source={require("../../../assets/icons/phone.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.phoneNumber}</Text>
              <Text style={styles.value}>{user.phone}</Text>
            </View>
          </View>
        </CartBox>

        {/* Account Credentials */}
        <CartBox paddingTop={13} paddingRight={10} paddingLeft={10} marginBottom={16} alignItems="flex-start" justifyContent="flex-start" height={161}>
          <Text style={styles.sectionTitle}>{lang.accountCredentials}</Text>

          {/* Username */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12, marginBottom: 12 }}>
            <Image source={require("../../../assets/icons/username.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.username}</Text>
              <Text style={styles.value}>{user.username}</Text>
            </View>
          </View>

          {/* Email */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12 }}>
            <Image source={require("../../../assets/icons/email.png")} style={styles.icon} />
            <View>
              <Text style={styles.label}>{lang.email}</Text>
              <Text style={styles.value}>{user.email}</Text>
            </View>
          </View>
        </CartBox>
      </ScrollView>
    </View>
  );
};

export default ProfileInfoScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    marginTop: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    color: colors.subtext,
    fontFamily: fonts.family.medium,
  },
  label: {
    fontSize: fonts.size.m,
    color: colors.text,
    fontFamily: fonts.family.regular,
    marginBottom: 4,
  },
  value: {
    fontSize: fonts.size.s,
    color: colors.subtext,
    fontFamily: fonts.family.regular,
  },
  icon: {
    width: 20,
    height: 20,
    marginRight: 8,
    marginTop: 2,
    resizeMode: "contain",
  },
});



