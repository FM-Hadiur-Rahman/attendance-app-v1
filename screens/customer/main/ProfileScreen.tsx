// screens/main/ProfileScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { RefreshControl } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import CartBox from "../../../components/CartBox";
import Popup from "../../../components/Popup";
import { Button1 } from "../../../components/Button";
import InputBox from "../../../components/InputBox";
import translations from "../../../assets/translations.json"
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";

import { getProfile, ProfileUser } from "../../../api/profile";
import { logout as apiLogout } from "../../../api/auth/authService";
import { clearAllAuthData } from "../../../api/auth/authToken";
import { getBranchId } from "../../../api/profile";

export default function ProfileScreen(props: any) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // support both prop-based injection (from Footer_C) and route params
  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const setLangIdProp = props?.setLangId; // optional callback from parent (Footer_C)
  const [branchId, setBranchId] = useState<string | null>(null);
  // fallback to route params (some places use `id`, others `userId`)
  const routeUserId = route.params?.userId ?? route.params?.id;
  const userId = propUserId || routeUserId;

  // initial language from prop or route param (route param name might be langId)
  const routeLangId = route.params?.langId ?? route.params?.language;
  const initialLang = propLangId || routeLangId || "en";

  const [selectedLanguage, setSelectedLanguage] = useState(initialLang);
  const [tempLanguage, setTempLanguage] = useState(selectedLanguage);

  useEffect(() => {
    if (propLangId && propLangId !== selectedLanguage) {
      setSelectedLanguage(propLangId);
      setTempLanguage(propLangId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propLangId]);

  const lang = translations[selectedLanguage];

  const [modalVisible, setModalVisible] = useState(false);
  const [profileImage, setProfileImage] = useState<string>(""); // no change to UI
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [logoutPopupVisible, setLogoutPopupVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [fullName, setFullName] = useState(""); // will be loaded from API

  // user object loaded from API
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const languages = [
    {
      code: "de",
      name: "Deutsch",
      subtitle: "German",
      flag: require("../../../assets/icons/de.png"),
    },
    {
      code: "en",
      name: "English",
      subtitle: "English (UK)",
      flag: require("../../../assets/icons/en.png"),
    },
  ];

  const sections = [
    {
      name: lang.personal_information,
      title: "General",
      items: [
        { label: "Fullname", labelname: lang.fullName, icon: require("../../../assets/icons/p_profile_b.png"), screen: null },
        { label: "Email", labelname: lang.email, icon: require("../../../assets/icons/p_email_b.png"), screen: null },
      ],
    },
    {
      name: lang.preferences,
      title: "Preferences",
      items: [
        { label: "Language", labelname: lang.language, icon: require("../../../assets/icons/p_language_b.png"), screen: null } // modal
      ],
    },
    {
      name: lang.support_and_legal,
      title: "Support & Legal",
      items: [
        { label: "Help center", labelname: lang.help_center, icon: require("../../../assets/icons/p_helpcenter_b.png"), screen: "HelpCenterScreen" },
        { label: "About us", labelname: lang.about_us, icon: require("../../../assets/icons/p_aboutus_b.png"), screen: "AboutScreen" },
        { label: "Privacy policy", labelname: lang.privacy_policy, icon: require("../../../assets/icons/p_privacy_b.png"), screen: "PrivacyScreen" },
        { label: "Terms of service", labelname: lang.terms_of_service, icon: require("../../../assets/icons/p_terms_b.png"), screen: "TermsScreen" },
      ],
    },
  ];

  // ---------- API Integration ----------
  const loadProfile = async (showErrors = true) => {
    try {
      setLoadingProfile(true);
      const profile = await getProfile();
      setUser(profile);
      setFullName(profile.fullname ?? "");
      const profileBranchId =
        typeof profile.branch === "string"
          ? profile.branch
          : profile.branch?._id ?? null;

      if (profileBranchId) {
        setBranchId(String(profileBranchId));
        console.log("ProfileScreen: branchId from profile =", profileBranchId);
      } else {
        const stored = await getBranchId();
        if (stored) {
          setBranchId(stored);
          console.log("ProfileScreen: branchId from storage =", stored);
        } else {
          console.log("ProfileScreen: no branchId found");
        }
      }
      // If your API returns an image field, setProfileImage(profile.image) here
    } catch (err: any) {
      console.error('loadProfile error', err);
      if (showErrors) {
        Alert.alert('Profile load failed', err?.toString?.() ?? 'Could not load profile');
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    // fetch profile on mount
    loadProfile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  // open device camera
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Camera access is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
      setModalVisible(false);
    }
  };

  // open gallery
  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Gallery access is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri); //  set chosen image
      setModalVisible(false);
    }
  };

  const handleLogout = async () => {
    try {
      // try informing backend and clearing local storage via AuthService
      await apiLogout();
    } catch (err) {
      console.warn("Backend logout failed (ignored):", err);
      // ensure tokens are removed locally even if backend fails
      await clearAllAuthData();
    } finally {
      // final guard: ensure local data is cleared
      await clearAllAuthData();

      // navigate to login screen
      navigation.reset({
        index: 0,
        routes: [{ name: "LoginScreen", params: { langId: selectedLanguage } }],
      });
    }
  };


  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.profile, color: colors.text }}
      />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}

          />
        }
      >
        {/* Profile Section */}
        <CartBox
          alignItems="center"
          backgroundColor={colors.secondary}
          borderRadius={0}
        >
          <View style={styles.profileContainer}>
            <View style={styles.profileImageContainer}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <Image
                  source={require("../../../assets/icons/profile_gray.png")}
                  style={styles.profileImage}
                />
              )}
              <TouchableOpacity
                style={styles.editIconContainer}
                onPress={() => setModalVisible(true)}
              >
                <Image
                  source={require("../../../assets/icons/p_edit.png")}
                  style={styles.editIcon}
                />
              </TouchableOpacity>
            </View>
          </View>
        </CartBox>

        <View style={styles.body}>
          {/* Sections */}
          {sections.map((section, index) => (

            <CartBox
              key={index}
              borderRadius={16}
              marginBottom={12}
              alignItems="flex-start"
              justifyContent="center"
              paddingLeft={20}
              paddingRight={20}
              paddingTop={13}
            // paddingBottom={12}
            >
              <Text style={styles.sectionTitle}>{section.name}</Text>
              {section.items.map((item, i) => (
                <CartBox
                  key={i}
                  onPress={() => {
                    if (item.label === "Language") {
                      setLanguageModalVisible(true);
                      return;
                    }

                    const payload = {
                      id: userId,
                      langId: selectedLanguage,
                      branchId: branchId,
                    };

                    if (item.screen) {
                      console.log(`ProfileScreen: navigating -> ${item.screen}`, payload);
                      navigation.navigate(item.screen, payload);
                      return;
                    }

                    console.log("ProfileScreen: item pressed (no screen):", item.label, payload);
                  }}

                  alignItems="flex-start"
                  borderRadius={0}
                  paddingTop={12}
                  paddingBottom={12}

                >
                  <View style={styles.itemLeft}>
                    <Image source={item.icon} style={styles.itemIcon} />
                    <View style={{ justifyContent: 'flex-start' }}>
                      <Text style={styles.itemText}>{item.labelname}</Text>
                      {/* --- Show the value only for the Personal Information section --- */}
                      {section.name === lang.personal_information && (
                        <Text style={styles.labelValue}>
                          {item.label === "Fullname" && fullName}
                          {item.label === "Position" && user?.position}
                          {item.label === "Email" && user?.email}
                          {item.label === "Phone number" && user?.phone}
                        </Text>
                      )}
                    </View>
                  </View>

                </CartBox>
              ))}
            </CartBox>
          ))}

          {/* Logout */}
          <CartBox
            onPress={() => setLogoutPopupVisible(true)} // show popup
            paddingLeft={20}
            paddingTop={12}
            paddingBottom={12}
            marginTop={20}
            marginBottom={30}
            alignItems="flex-start"
          >
            <View style={styles.logout}>
              <Image
                source={require("../../../assets/icons/p_logout.png")}
                style={styles.logoutIcon}
              />
              <Text style={styles.logoutText}>{lang.logout}</Text>
            </View>
          </CartBox>

        </View>
      </ScrollView>

      {/* Bottom Sheet Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.edit_profile}</Text>

            <CartBox
              paddingLeft={20}
              paddingTop={10}
              paddingBottom={10}
              alignItems="flex-start"
              borderRadius={12}
              borderWidth={1}
              borderColor={colors.border}
              backgroundColor={colors.secondary}
              marginBottom={12}
              onPress={openCamera}
            >
              <View style={styles.logout}>
                <Image
                  source={require("../../../assets/icons/p_camera.png")}
                  style={styles.logoutIcon}
                />
                <Text style={styles.modalButtonText}>{lang.camera}</Text>
              </View>
            </CartBox>

            <CartBox
              paddingLeft={20}
              paddingTop={10}
              paddingBottom={10}
              alignItems="flex-start"
              borderRadius={12}
              borderWidth={1}
              borderColor={colors.border}
              backgroundColor={colors.secondary}
              onPress={openGallery}
            >
              <View style={styles.logout}>
                <Image
                  source={require("../../../assets/icons/p_gallery.png")}
                  style={styles.logoutIcon}
                />
                <Text style={styles.modalButtonText}>{lang.gallery}</Text>
              </View>
            </CartBox>
          </View>
        </Pressable>
      </Modal>
      {/* Language Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={languageModalVisible}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLanguageModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.select_language}</Text>

            {languages.map((langOpt) => (
              <CartBox
                key={langOpt.code}
                alignItems="flex-start"
                height={56}
                paddingLeft={20}
                paddingRight={20}
                paddingTop={10}
                paddingBottom={10}
                borderRadius={12}
                borderWidth={1}
                backgroundColor={colors.secondary}
                borderColor={tempLanguage === langOpt.code ? colors.primary : colors.border}
                marginBottom={12}
                onPress={() => setTempLanguage(langOpt.code)}
              >
                <View style={styles.languageBox}>
                  <Image
                    source={langOpt.flag}
                    style={styles.logoutIcon}
                  />
                  <View style={styles.lang}>
                    <Text style={styles.modalButtonText}>{langOpt.name}</Text>
                    <Text style={styles.languageSubtitle}>{langOpt.subtitle}</Text>
                  </View>
                </View>
              </CartBox>
            ))}

            <Button1
              text={lang.select}
              width={"100%"}
              onPress={() => {
                setSelectedLanguage(tempLanguage); // update actual language
                // inform parent (Footer_C) if available
                if (typeof setLangIdProp === "function") {
                  setLangIdProp(tempLanguage);
                }
                setLanguageModalVisible(false);
                console.log("Language selected:", tempLanguage);
              }}
              containerStyle={{ alignSelf: "center", marginTop: 56 }}
            />

          </View>
        </Pressable>
      </Modal>

      <Popup
        visible={logoutPopupVisible}
        onClose={() => setLogoutPopupVisible(false)}
        popupBorderColor={colors.error_text}
        dismissOnOverlayPress={false}
        title="Logout?"
        titleStyle={{ color: colors.error_text }}
      >
        <Text style={styles.popupsubtext}>
          Confirm the logging out by clicking "yes."
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
          <Button1
            text={lang.yes}
            onPress={handleLogout}
            backgroundColor={colors.primary}
            width={'48%'}
            textStyle={{ color: colors.secondary }}
          />
          <Button1
            text={lang.no}
            onPress={() => setLogoutPopupVisible(false)}
            backgroundColor={colors.error_text}
            width={'48%'}
            textStyle={{ color: colors.secondary }}
          />
        </View>
      </Popup>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  scrollContainer: { paddingBottom: 50 },
  body: { paddingHorizontal: 20, marginTop: 20 },
  profileContainer: {
    alignItems: 'center',
    marginTop: 20
  },
  profileImageContainer: {
    width: 80,
    height: 80, borderRadius: 60, resizeMode: "contain",
    justifyContent: 'center', alignItems: 'center'
  },
  profileImage: {
    width: 80, height: 80, borderRadius: 60
  },
  editIconContainer: { position: "absolute", bottom: 8, right: 0, },
  editIcon: { width: 20, height: 20, resizeMode: "contain" },
  sectionTitle: {
    fontSize: fonts.size.s, fontWeight: fonts.weight.regular as any, color: colors.subtext,
    marginBottom: 14,
  },
  itemLeft: { flexDirection: "row" },
  itemIcon: { width: 17, height: 17, resizeMode: "contain", marginRight: 8 },
  itemText: { fontSize: fonts.size.m, color: colors.text, fontWeight: fonts.weight.medium as any, fontFamily: fonts.family.regular, },
  logout: { flexDirection: "row", },
  logoutIcon: { width: 17, height: 17, marginRight: 8, resizeMode: "contain" },
  logoutText: { fontSize: fonts.size.m, color: colors.logout_text, fontWeight: fonts.weight.medium as any },
  modalOverlay: { flex: 1, justifyContent: "flex-end", },
  modalContainer: {
    backgroundColor: colors.secondary, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHandle: { width: 40, height: 6, backgroundColor: colors.modal_line, borderRadius: 10, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: fonts.size.l, fontWeight: fonts.weight.medium as any, textAlign: "center", marginBottom: 19 },
  modalButton: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalButtonText: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text, textAlign: "center", fontFamily: fonts.family.regular, },
  languageBox: { flexDirection: "row", alignItems: 'center' },
  lang: { alignItems: "flex-start" },
  languageSubtitle: {
    fontSize: fonts.size.s,
    color: colors.subtext,
    fontWeight: fonts.weight.regular as any,
    marginTop: 4,
    fontFamily: fonts.family.regular,
    lineHeight: 17
  },
  labelValue: {
    marginTop: 5,
    color: colors.subtext,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    lineHeight: 16,
  },
  popupsubtext: {
    color: colors.subtext,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    marginBottom: 30,
    alignSelf: 'center'
  },

});
