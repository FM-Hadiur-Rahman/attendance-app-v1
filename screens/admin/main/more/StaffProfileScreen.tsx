// screens/StaffProfileScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  Linking,
  Keyboard,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import InputBox from "../../../../components/InputBox";
import { Button1 } from "../../../../components/Button";
import colors from "../../../../styles/Colors";
import fonts from "../../../../styles/Fonts";
import Header from "../../../../components/Header";
import CartBox from "../../../../components/CartBox";
import * as ImagePicker from "expo-image-picker";
import translations from "../../../../assets/translations.json";
import { useNavigation, useRoute } from "@react-navigation/native";
import Popup from "../../../../components/Popup";
import {
  getUserById,
  updateUser,
  deleteUser,
  ProfileUser,
  getUserAttendanceSummary,
} from "../../../../api/profile";
import Toast, {
  showErrorToast,
  showSuccessToast,
  toastConfig,
} from "../../../../components/Toast";
// add near other imports
import { countryList } from "../../../../components/Code";
import { exportMonthlyAttendanceXLSX } from "../../../../components/AttendanceXLSX";
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // Optional, but recommended for safe areas

export const getUserWorkSummaryLocal = (userId: string) => {
  // Kept for compatibility if you have local mock data — but we now prefer server API.
  return { totalDays: 0, totalTime: "0h 0m" };
};

interface StaffProfileScreenprops {
  id?: string;
  userId?: string;
  langId?: string;
  setLangId?: (lang: string) => void;
}

const StaffProfileScreen: React.FC<StaffProfileScreenprops> = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { id, userId: navUserId, langId } = route.params || {};
  const currentLang = langId || "en";
  const lang = translations[currentLang as keyof typeof translations] || translations["en"];

  const insets = useSafeAreaInsets(); // If using safe-area-context; else use { top: 0 }

  console.log("Route Params =>", route.params);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [positionModalVisible, setPositionModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const [positionInput, setPositionInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

  const getPhoneRuleForSelected = () => {
    const codeDigits = (selectedCountry?.code || "").replace(/\D/g, "");
    return PHONE_RULES[codeDigits] || DEFAULT_PHONE_RULE;
  };
  const formatPhoneForDisplay = (digitsOnly: string) => {
    if (!digitsOnly) return "";
    return digitsOnly.replace(/(.{3})/g, "$1 ").trim();
  };

  // on change for phone field (UI input)
  const onPhoneChange = (val: string) => {
    const rule = getPhoneRuleForSelected();

    let raw = val.replace(/\D/g, "");
    const hasLeadingZero = raw.startsWith("0");
    const maxAllowedForDisplay = rule.max + (hasLeadingZero ? 1 : 0);
    raw = raw.slice(0, maxAllowedForDisplay);
    let normalized = raw.startsWith("0") ? raw.slice(1) : raw;
    normalized = normalized.slice(0, rule.max);

    setPhone(formatPhoneForDisplay(raw));
    setPhoneRaw(normalized);

    // live validation
    if (!normalized || normalized.length === 0) {
      setErrors((prev) => ({ ...prev, phone: lang.phone_required }));
      return;
    }
    if (normalized.length < rule.min) {
      if (rule.min === rule.max) {
        setErrors((prev) => ({
          ...prev,
          phone: `${lang.Please_complete_all} ${rule.max} ${lang.digits}`,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          phone: `${lang.Enter_at_least} ${rule.min} ${lang.digits}`,
        }));
      }
      return;
    }
    setErrors((prev) => ({ ...prev, phone: "" }));
  };
  const setFieldTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const validateField = (field: string) => {
    let error = "";
    switch (field) {
      case "phone":
        {
          const normalized = phoneRaw || "";
          const phoneRule = getPhoneRuleForSelected();
          if (!normalized) error = lang.phone_required;
          else if (normalized.length < phoneRule.min)
            error = `${lang.Enter_at_least} ${phoneRule.min} ${lang.digits}`;
          else if (normalized.length > phoneRule.max)
            error = `${lang.Maximum} ${phoneRule.max} ${lang.digits}`;
        }
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
    return error === "";
  };

  const validateAllStep1 = () => {
    const fields = ["phone"];
    const newTouched: any = {};
    fields.forEach((f) => (newTouched[f] = true));
    setTouched((prev) => ({ ...prev, ...newTouched }));

    const results = fields.map((f) => validateField(f));
    return results.every(Boolean);
  };

  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);
  const [totalDays, setTotalDays] = useState(0);
  const [totalTime, setTotalTime] = useState("0h 0m");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [deletePopupVisible, setDeletePopupVisible] = useState(false);

  // helper to get canonical id from ProfileUser (support id or _id)
  const getUserIdFromProfile = (u?: ProfileUser | null) => {
    if (!u) return "";
    return (u as any).id ?? (u as any)._id ?? "";
  };
  const formatHHMMSimple = (hhmm?: string, fallbackMinutes?: number) => {
    if (hhmm && /^\d{1,2}:\d{2}$/.test(hhmm)) {
      const [hh, mm] = hhmm.split(":").map(Number);
      return `${hh}h ${mm}m`;
    }
    if (typeof fallbackMinutes === "number") {
      const h = Math.floor(fallbackMinutes / 60);
      const m = fallbackMinutes % 60;
      return `${h}h ${m}m`;
    }
    return "0h 0m";
  };

  // fetch attendance summary from server and set totalDays/totalTime
  const fetchAttendanceSummary = async (staffId: string) => {
    try {
      const summary = await getUserAttendanceSummary(staffId);
      if (!summary) {
        // fallback
        setTotalDays(0);
        setTotalTime("0h 0m");
        return;
      }
      // user wanted total_sessions -> totalDays
      const sessions =
        typeof summary.total_sessions === "number" ? summary.total_sessions : 0;
      setTotalDays(sessions);

      // total working hours: prefer formatted_time then total_minutes
      if (summary.formatted_time) {
        setTotalTime(formatHHMMSimple(summary.formatted_time));
      } else if (typeof summary.total_minutes === "number") {
        setTotalTime(formatHHMMSimple(undefined, summary.total_minutes));
      } else {
        setTotalTime("0h 0m");
      }
    } catch (err) {
      console.error("fetchAttendanceSummary failed:", err);
      // don't break UI — fallback to zeros
      setTotalDays(0);
      setTotalTime("0h 0m");
    }
  };

  // fetch user by id and attendance summary
  const fetchStaff = useCallback(async (staffId?: string) => {
    if (!staffId) {
      console.warn("StaffProfileScreen: no staff id provided");
      return;
    }
    setLoading(true);
    try {
      const user = await getUserById(staffId);
      setCurrentUser(user);

      setPositionInput(user?.position ?? "");
      setEmailInput(user?.email ?? "");

      const parsed = parsePhoneForInput(user?.phone);

      // find full country object if possible
      const matchedCountry = countryList.find((c) => c.code === parsed.code);
      if (matchedCountry) {
        setSelectedCountry(matchedCountry);
      } else {
        // keep previous flag but update numeric code
        setSelectedCountry((prev) => ({ ...prev, code: parsed.code }));
      }

      // show only local number in text input
      setPhone(parsed.local ?? "");

      if ((user as any)?.profileImage)
        setProfileImage((user as any).profileImage);

      // fetch attendance summary from API
      const uid = getUserIdFromProfile(user);
      if (uid) await fetchAttendanceSummary(uid);
      else {
        setTotalDays(0);
        setTotalTime("0h 0m");
      }
    } catch (err) {
      console.error("Failed to fetch staff:", err);
      Alert.alert("Failed to load staff", String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    if (id) {
      fetchStaff(id);
    } else {
      console.warn("StaffProfileScreen mounted without id param");
    }
  }, [id, fetchStaff]);

  // pull-to-refresh
  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      await fetchStaff(id);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  // replace your existing savephonevalidation with this
  const savephonevalidation = async (): Promise<boolean> => {
    // hide keyboard
    Keyboard.dismiss();

    // mark field touched and validate
    const ok = validateAllStep1();
    if (!ok) {
      console.warn("phone: validation failed", {
        errors,
        phone,
        phoneRaw,
      });
      return false;
    }

    // After validateAllStep1 we still check current errors state (live validation)
    if (errors.phone) {
      console.warn("phone: has errors ->", errors.phone);
      return false;
    }

    // final sanity: phoneRaw must exist and be within rule
    const normalized = (phoneRaw || "").replace(/\D/g, "");
    const rule = getPhoneRuleForSelected();
    if (
      !normalized ||
      normalized.length < rule.min ||
      normalized.length > rule.max
    ) {
      console.warn("phone: normalized length invalid", { normalized, rule });
      setErrors((prev) => ({
        ...prev,
        phone: `${lang.Enter_at_least || "Enter at least"} ${rule.min} ${
          lang.digits || "digits"
        }`,
      }));
      return false;
    }

    return true;
  };

  // generic save helper that calls updateUser and merges result
  const saveField = async (payload: Partial<ProfileUser>) => {
    if (!id) {
      Alert.alert("Missing staff id", "Cannot update: missing staff id.");
      return null;
    }
    setSaving(true);
    try {
      const updated = await updateUser(id, payload);
      // merge/replace local state with updated user (server response)
      setCurrentUser((prev) => ({ ...(prev ?? {}), ...(updated as any) }));
      // success toast if available
      try {
        showSuccessToast?.("Saved");
      } catch {
        // ignore if not present
      }
      return updated;
    } catch (err: any) {
      console.error("Failed to save user field:", err);
      Alert.alert("Save failed", String(err?.message ?? err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  // handlers for each modal Save
  const handleSavePosition = async () => {
    const updated = positionInput.trim();
    if (!updated) {
      Alert.alert("Validation", "Position cannot be empty");
      return;
    }

    try {
      setSaving(true);
      const res = await saveField({ position: updated });
      if (res) {
        // ensure local state updated (saveField merges server response)
        setPositionModalVisible(false);
        try {
          showSuccessToast?.(lang.positionUpdated);
        } catch {}
      }
    } catch (err: any) {
      console.error("Failed to save position:", err);
      Alert.alert("Save failed", String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    const updated = emailInput.trim().toLowerCase();
    if (!updated) {
      Alert.alert("Validation", "Email cannot be empty");
      return;
    }
    if (!updated.includes("@")) {
      Alert.alert("Validation", "Enter a valid email");
      return;
    }

    try {
      setSaving(true);
      const res = await saveField({ email: updated });
      if (res) {
        setEmailModalVisible(false);
        try {
          showSuccessToast?.(lang.emailUpdated);
        } catch {}
      }
    } catch (err: any) {
      console.error("Failed to save email:", err);
      Alert.alert("Save failed", String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) {
      Alert.alert("Error", "No staff id provided to delete.");
      return;
    }

    try {
      setDeleting(true);
      await deleteUser(id);

      // show toast for deletion
      try {
        showSuccessToast?.("Staff deleted");
      } catch {}

      // get logged-in admin id fallback
      let currentUserId = route.params?.userId;
      if (!currentUserId) {
        try {
          currentUserId = await AsyncStorage.getItem("userId");
        } catch (e) {
          console.warn("Couldn't fetch userId from storage:", e);
        }
      }

      const lang = route.params?.langId ?? "de";

      // navigate back to Footer_A opening StaffRecord tab and pass props
      (navigation as any).navigate("Footer_A", {
        selectedTab: "StaffRecord",
        userId: currentUserId,
        langId: lang,
        refresh: true,
        toastMessage: "Staff Deleted",
      });
    } catch (err: any) {
      console.error("Delete failed:", err);
      Alert.alert("Delete failed", String(err?.message ?? err));
    } finally {
      setDeleting(false);
      setDeletePopupVisible(false);
    }
  };

  const PHONE_RULES: Record<
    string,
    { min: number; max: number; example?: string }
  > = {
    "94": { min: 9, max: 9, example: "7XXXXXXXX" },
    "49": { min: 7, max: 11, example: "variable (up to 11)" },
    "33": { min: 9, max: 9, example: "9 digits after +33" },
    "44": { min: 10, max: 10, example: "10 digits after +44" },
    "966": { min: 9, max: 9, example: "9 digits after +966" },
    "7": { min: 10, max: 10, example: "10 digits after +7" },
    "90": { min: 10, max: 10, example: "10 digits after +90" },
  };
  const DEFAULT_PHONE_RULE = { min: 7, max: 17 };

  const [selectedCountry, setSelectedCountry] = useState({
    id: 1,
    name: "Deutsch",
    code: "49",
    flag: require("../../../../assets/icons/de.png"), // 🇩🇪 default German
  });

  const parsePhoneForInput = (phone?: string) => {
    if (!phone) return { code: selectedCountry.code, local: "" };

    let str = phone.trim();
    const hasPlus = str.startsWith("+");
    let digits = str.replace(/\D/g, "");
    if (hasPlus) {
    }

    const sorted = [...countryList].sort(
      (a, b) => b.code.length - a.code.length
    );
    for (const c of sorted) {
      if (digits.startsWith(c.code)) {
        return { code: c.code, local: digits.slice(c.code.length) };
      }
    }
    if (hasPlus) {
      return { code: selectedCountry.code, local: digits };
    }
    return { code: selectedCountry.code, local: digits };
  };

  const handleSavePhone = async () => {
    // validate first
    const valid = await savephonevalidation();
    if (!valid) return;

    setSaving(true);
    try {
      // normalized digits (from phoneRaw which onPhoneChange sets)
      let normalized = (phoneRaw || "").replace(/\D/g, "");
      if (!normalized) {
        Alert.alert(
          "Validation",
          lang.phone_required || "Phone cannot be empty"
        );
        return;
      }
      // strip leading trunk zeros
      normalized = normalized.replace(/^0+/, "");

      const cc = selectedCountry.code?.toString().replace(/\D/g, "") || "";
      if (!cc) {
        Alert.alert("Validation", "Country code missing");
        return;
      }

      const phoneWithCode = `${cc}${normalized}`; // stored without '+' as requested

      const res = await saveField({ phone: phoneWithCode });
      if (res) {
        // update local user state immediately (saveField already merges server response but ensure)
        setCurrentUser(
          (prev) => ({ ...(prev ?? {}), phone: phoneWithCode } as any)
        );

        // show a clear toast for phone update
        try {
          showSuccessToast?.(lang.phoneUpdated);
        } catch {
          // ignore if toast helper missing
        }

        setPhoneModalVisible(false);
      }
    } catch (err: any) {
      console.error("Failed saving phone:", err);
      Alert.alert("Save failed", String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  // Camera & gallery functions (kept as you had them)
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
      const uri = result.assets[0].uri;
      setProfileImage(uri);
      // Optionally upload this image to server if you have endpoint.
      // For now, just save the profileImage field to local state (not part of ProfileUser)
      setModalVisible(false);
    }
  };

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
      const uri = result.assets[0].uri;
      setProfileImage(uri);
      // Save the profile image URI to local state only (not part of ProfileUser)
      setModalVisible(false);
    }
  };

  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: "image",
          url: require("../../../../assets/icons/back_b.png"),
          width: 24,
          height: 24,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: "text", value: lang.staffProfile, color: colors.text }}
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 20,
          backgroundColor: colors.secondary,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <CartBox
          alignItems="center"
          backgroundColor={colors.secondary}
          borderRadius={0}
        >
          <View style={styles.profileContainer}>
            <View style={styles.profileImageContainer}>
              <View style={styles.profileImageContainer1}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.image} />
                ) : (
                  <Image
                    source={require("../../../../assets/icons/profile_gray.png")}
                    style={styles.image}
                  />
                )}
              </View>
              <TouchableOpacity
                style={styles.editIconContainer}
                onPress={() => setModalVisible(true)}
              >
                <Image
                  source={require("../../../../assets/icons/p_edit.png")}
                  style={styles.editIcon}
                />
              </TouchableOpacity>
            </View>
          </View>
        </CartBox>

        <View style={styles.statsContainer}>
          <CartBox containerStyle={styles.statBox}>
            <Text style={styles.statLabel}>{lang.totalDays}</Text>
            <Text style={styles.statValue}>{totalDays}</Text>
          </CartBox>

          <CartBox
            paddingVertical={16}
            paddingHorizontal={10}
            backgroundColor={colors.background}
            borderRadius={16}
            containerStyle={styles.statBox}
          >
            <Text style={styles.statLabel}>{lang.totalWorkingHours}</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {totalTime}
            </Text>
          </CartBox>
        </View>

        <CartBox
          width="90%"
          backgroundColor={colors.background}
          borderRadius={16}
          paddingVertical={20}
          paddingHorizontal={20}
          containerStyle={{
            alignSelf: "center",
            marginBottom: 12,
            height: "auto",
          }}
          alignItems="flex-start"
          justifyContent="flex-start"
          paddingBottom={12}
        >
          <Text style={styles.sectionTitle}>{lang.personalInformation}</Text>

          <View style={{ marginBottom: 12, paddingHorizontal: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image
                source={require("../../../../assets/icons/p_profile_b.png")}
                style={styles.icon}
              />
              <Text style={styles.infoLabel}>{lang.fullname}</Text>
            </View>
            <Text
              style={styles.infoValue}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentUser?.fullname}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setPositionModalVisible(true)}
            style={{ marginBottom: 12, paddingHorizontal: 12 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image
                source={require("../../../../assets/icons/p_position_b.png")}
                style={styles.icon}
              />
              <Text style={styles.infoLabel}>{lang.position}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={styles.infoValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {currentUser?.position}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setEmailModalVisible(true)}
            style={{ marginBottom: 12, paddingHorizontal: 12 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image
                source={require("../../../../assets/icons/p_email_b.png")}
                style={styles.icon}
              />
              <Text style={styles.infoLabel}>{lang.email}</Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Text
                style={styles.infoValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {currentUser?.email}
              </Text>

              <TouchableOpacity
                style={styles.actionButton}
                activeOpacity={0.7}
                onPress={() => {
                  const toEmail = currentUser?.email ?? "";
                  const subject = encodeURIComponent("");
                  const body = encodeURIComponent("");
                  if (!toEmail) return;
                  Linking.openURL(
                    `mailto:${toEmail}?subject=${subject}&body=${body}`
                  ).catch((err) =>
                    console.log("Failed to open email app:", err)
                  );
                }}
              >
                <Text style={styles.actionButtonText}>{lang.mail}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setPhoneModalVisible(true)}
            style={{ marginBottom: 0, paddingHorizontal: 12 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image
                source={require("../../../../assets/icons/p_phone_b.png")}
                style={styles.icon}
              />
              <Text style={styles.infoLabel}>{lang.phoneNumber}</Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Text style={styles.infoValue}>{currentUser?.phone}</Text>
              <TouchableOpacity
                style={styles.actionButton}
                activeOpacity={0.7}
                onPress={() => {
                  if (!currentUser?.phone) return;
                  const phoneNumber = (currentUser.phone as string).replace(
                    /\s+/g,
                    ""
                  );
                  Linking.openURL(`tel:${phoneNumber}`).catch((err) =>
                    console.log("Failed to open dialer:", err)
                  );
                }}
              >
                <Text style={styles.actionButtonText}>{lang.call}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </CartBox>

        <CartBox
          width="90%"
          backgroundColor={colors.background}
          borderRadius={16}
          paddingVertical={20}
          paddingHorizontal={20}
          containerStyle={{
            alignSelf: "center",
            marginBottom: 12,
            height: 159,
          }}
          alignItems="flex-start"
          justifyContent="flex-start"
        >
          <Text style={styles.sectionTitle}>{lang.loginAccountDetails}</Text>

          <View style={{ marginBottom: 12, paddingHorizontal: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image
                source={require("../../../../assets/icons/p_profile_b.png")}
                style={styles.icon}
              />
              <Text style={styles.infoLabel}>{lang.username}</Text>
            </View>
            <Text
              style={styles.infoValue}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {(currentUser as any)?.username ?? (currentUser as any)?.userName}
            </Text>
          </View>

          <View style={{ marginBottom: 0, paddingHorizontal: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image
                source={require("../../../../assets/icons/lock_b.png")}
                style={styles.icon}
              />
              <Text style={styles.infoLabel}>{lang.password}</Text>
            </View>
            <Text style={styles.infoValue}>
              {"*".repeat((currentUser as any)?.password?.length || 5)}
            </Text>
          </View>
        </CartBox>
        <View style={{ paddingHorizontal: 20 }}>
          <CartBox
            backgroundColor={colors.background}
            borderRadius={10}
            paddingTop={12}
            paddingBottom={12}
            paddingLeft={20}
            paddingRight={20}
            alignItems="flex-start"
            onPress={() => setDeletePopupVisible(true)}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image
                source={require("../../../../assets/icons/delete.png")}
                style={styles.deleteicon}
              />
              <Text style={styles.deleteLabel}>{lang.deleteStaff}</Text>
            </View>
          </CartBox>
        </View>
      </ScrollView>

      {/* Position Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={positionModalVisible}
        onRequestClose={() => setPositionModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPositionModalVisible(false)}
        />
        <View style={[styles.modalContainer, { marginTop: insets.top }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{lang.position}</Text>
          <InputBox
            label="Position"
            value={positionInput}
            setValue={setPositionInput}
            placeholder="Enter position"
          />
          <Button1
            text={lang.save}
            width="100%"
            onPress={handleSavePosition}
          />
        </View>
      </Modal>

      {/* Email Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={emailModalVisible}
        onRequestClose={() => setEmailModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEmailModalVisible(false)}
        />
        <View style={[styles.modalContainer, { marginTop: insets.top }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{lang.email}</Text>
          <InputBox
            label="Email"
            value={emailInput}
            setValue={(text) => {
              const formatted = text.toLowerCase();
              setEmailInput(formatted);
              if (!formatted.includes("@"))
                setEmailError("Enter a valid email");
              else setEmailError("");
            }}
            placeholder="Enter email"
            errorMessage={emailError}
          />
          <Button1
            text={lang.save}
            width="100%"
            onPress={handleSaveEmail}
          />
        </View>
      </Modal>

      {/* Phone Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={phoneModalVisible}
        onRequestClose={() => setPhoneModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPhoneModalVisible(false)}
        />
        <View style={[styles.modalContainer, { marginTop: insets.top }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{lang.phoneNumber}</Text>
          {/* <InputBox label="Phone" placeholder="123 456 789" value={phoneInput} setValue={(text) => setPhoneInput(text.replace(/[^0-9]/g, ""))} /> */}
          <InputBox
            label="Phone"
            placeholder="123 456 789"
            value={phone} // <-- use phoneInput state
            setValue={(text: string) => onPhoneChange(text)}
            errorMessage={touched.phone ? errors.phone : ""}
            leftIcon={selectedCountry.flag}
            leftIcon2={require("../../../../assets/icons/down_b.png")}
            onLeftIcon2Press={() =>
              (navigation as any).navigate("Code", {
                initialSelectedId: selectedCountry.id,
                onSelect: (item: any) => {
                  setSelectedCountry(item);
                  const newRule =
                    PHONE_RULES[(item.code || "").replace(/\D/g, "")] ||
                    DEFAULT_PHONE_RULE;

                  let currentRaw = (phone || "").replace(/\D/g, "");
                  const hasLeadingZero = currentRaw.startsWith("0");
                  const maxDisplay = newRule.max + (hasLeadingZero ? 1 : 0);
                  currentRaw = currentRaw.slice(0, maxDisplay);

                  let normalized = currentRaw.startsWith("0")
                    ? currentRaw.slice(1)
                    : currentRaw;
                  normalized = normalized.slice(0, newRule.max);

                  setPhone(formatPhoneForDisplay(currentRaw));
                  setPhoneRaw(normalized);

                  if (!normalized || normalized.length === 0) {
                    setErrors((prev) => ({
                      ...prev,
                      phone: lang.phone_required,
                    }));
                  } else if (normalized.length < newRule.min) {
                    if (newRule.min === newRule.max) {
                      setErrors((prev) => ({
                        ...prev,
                        phone: `Please complete all ${newRule.max} digits`,
                      }));
                    } else {
                      setErrors((prev) => ({
                        ...prev,
                        phone: `${lang.Enter_at_least || "Enter at least"} ${
                          newRule.min
                        } ${lang.digits || "digits"}`,
                      }));
                    }
                  } else {
                    setErrors((prev) => ({ ...prev, phone: "" }));
                  }
                },
              })
            }
            onFocus={() => {
              setFieldTouched("phone");
            }}
            onBlur={() => validateField("phone")}
            keyboardType="phone-pad"
          />
          <Button1
            text={lang.save}
            width="100%"
            onPress={handleSavePhone}
          />
        </View>
      </Modal>

      {/* Profile Image Modal */}
      <Modal animationType="slide" transparent visible={modalVisible}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        />
        <View style={[styles.modalContainer, { marginTop: insets.top }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{lang.profile}</Text>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={openCamera}
            activeOpacity={0.7}
          >
            <Image
              source={require("../../../../assets/icons/p_camera.png")}
              style={styles.modalIcon}
            />
            <Text style={styles.modalOptionText}>{lang.camera}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={openGallery}
            activeOpacity={0.7}
          >
            <Image
              source={require("../../../../assets/icons/p_gallery.png")}
              style={styles.modalIcon}
            />
            <Text style={styles.modalOptionText}>{lang.gallery}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Popup
        visible={deletePopupVisible}
        onClose={() => setDeletePopupVisible(false)}
        popupBorderColor={colors.primary}
        dismissOnOverlayPress={false}
        title={lang.deleteStaffRecord}
        titleStyle={{ color: colors.primary }}
      >
        <Text style={styles.popupsubtext}>{lang.confirmDeleteStaff}</Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Button1
            text={lang.yes}
            onPress={handleDelete}
            backgroundColor={colors.primary}
            width={"48%"}
            textStyle={{ color: colors.secondary }}
          />
          <Button1
            text={lang.no}
            onPress={() => setDeletePopupVisible(false)}
            backgroundColor={colors.error_text}
            width={"48%"}
            textStyle={{ color: colors.secondary }}
          />
        </View>
      </Popup>
      <View style={styles.buttonWrap}>
        <Button1
          text={lang.generate_csv}
          width={"90%"}
          onPress={() => exportMonthlyAttendanceXLSX(id)}
        />
      </View>
      <Toast config={toastConfig} />
    </>
  );
};

export default StaffProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingHorizontal: 20,
  },

  profileContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    marginBottom: 12,
  },
  profileImageContainer: {
    position: "relative",
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  editIconContainer: {
    position: "absolute",
    right: 0,
    top: 60,
  },
  editIcon: {
    width: 25,
    height: 25,
  },

  // Stats
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    marginBottom: 20,
    height: 78,
  },
  statBox: {
    backgroundColor: "#ffffffff",
    borderRadius: 5,
    alignItems: "flex-start",
    width: "43.18%",
    borderColor: colors.border,
    borderWidth: 1,
  },
  statValue: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.bold ,
    color: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: fonts.size.s,
    color: colors.subtext,
    paddingHorizontal: 12,
  },

  sectionTitle: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.medium,
    marginBottom: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  icon: {
    width: 18,
    height: 18,
    marginRight: 8,
    tintColor: colors.primary,
  },
  infoLabel: {
    fontSize: fonts.size.m,
    color: colors.text,
    maxWidth: "80%",
    fontWeight: fonts.weight.regular
  },
  infoValue: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular ,
    color: colors.subtext,
    paddingHorizontal: 25,
    maxWidth: 220,
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20, // wider
    paddingVertical: 6, // taller
    borderRadius: 20, // more round
    alignItems: "center", // center text
    justifyContent: "center",
  },
  actionButtonText: {
    color: colors.secondary,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.medium ,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 10, // Extra top padding for Android status bar
    paddingBottom: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: "80%", // Prevent full-screen takeover on small devices
  },
  modalTitle: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.medium,
    marginBottom: 20,
    textAlign: "center",
    color: colors.text, // Ensure high contrast
    paddingHorizontal: 10, // Prevent edge clipping
  },
  modalHandle: {
    width: 40,
    height: 4, // Slightly thicker for touch/visibility
    backgroundColor: colors.subtext3, // Use a visible color from your theme
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 20, // More space below handle
    elevation: 2, // Android shadow for pop
    shadowColor: colors.text, // iOS shadow fallback
    
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  modalIcon: {
    width: 22,
    height: 22,
    marginRight: 12,
  },
  modalOptionText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.medium ,
    color: colors.text,
  },
  profileImageContainer1: {
    width: 80,
    height: 80,
    borderRadius: 60,
    resizeMode: "contain",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  image: { width: 100, height: 100, borderRadius: 60 },
  deleteicon: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  deleteLabel: {
    fontSize: fonts.size.m,
    color: colors.logout_text,
    fontWeight: fonts.weight.medium ,
  },
  popupsubtext: {
    color: colors.subtext,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular ,
    marginBottom: 30,
    alignSelf: "center",
  },
  buttonWrap: { paddingBottom: 20, alignItems: "center" },
});