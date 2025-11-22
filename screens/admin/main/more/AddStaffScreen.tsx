// src/screens/admin/staff/AddStaffScreen.tsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Keyboard,
  Pressable,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  RefreshControl,
  LayoutChangeEvent,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useNavigation, useRoute } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import Header from "../../../../components/Header";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import InputBox from "../../../../components/InputBox";
import colors from "../../../../styles/Colors";
import fonts from "../../../../styles/Fonts";
import Popup from "../../../../components/Popup";
import translations from "../../../../assets/translations.json";
import { showErrorToast, showSuccessToast } from "../../../../components/Toast";

// API helpers 
import AsyncStorage from "@react-native-async-storage/async-storage";
import axiosInstance from "../../../../api/axiosInstance";
import { register as authRegister } from "../../../../api/auth/authService";
import {
  getBranchId,
  getBranchById,
  getUsers,
  getUserById,
  postSchedulesBulk,
  getLoggedInUserBranch,
} from "../../../../api/profile";
import { sendNotificationToUser } from "../../../../api/notification/firebaseNotifications";

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

type ScheduleEntry = {
  startTime: string;
  endTime: string;
  duration?: number;      // in hours (optional)
  date?: string | null;   // YYYY-MM-DD (optional)
};

type SchedulePayload = {
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  duration?: number; // hours (optional)
};

const AddStaffScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [refreshing, setRefreshing] = useState(false);
  const { userId, langId, onSave } = route.params || {};
  const currentLang = langId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // loading flags (optional, useful if you want a spinner near input)
  const [checkingEmail, setCheckingEmail] = useState(false);

  const checkUsernameExists = async (
    usernameToCheck: string
  ): Promise<boolean> => {
    if (!usernameToCheck) return false;

    try {
      const users = await getUsers({ username: usernameToCheck, limit: 1000 });

      if (!Array.isArray(users)) return false;

      const target = usernameToCheck.trim();
      const found = users.some((u: any) => {
        if (!u) return false;
        const e = (u.username ?? "").toString();
        return e === target;
      });

      return found;
    } catch (e) {
      console.warn("checkUsernameExists failed:", e);
      return false;
    }
  };

  const checkEmailExists = async (emailToCheck: string): Promise<boolean> => {
    if (!emailToCheck) return false;

    try {
      const users = await getUsers({ email: emailToCheck, limit: 1000 });

      if (!Array.isArray(users)) return false;

      const target = emailToCheck.trim().toLowerCase();
      const found = users.some((u: any) => {
        if (!u) return false;
        const e = (u.email ?? u.username ?? "").toString().trim().toLowerCase();
        return e === target;
      });

      return found;
    } catch (e) {
      console.warn("checkEmailExists failed:", e);
      return false;
    }
  };

  // step control
  const [step, setStep] = useState<number>(1);
  // profile image
  const [profileImage, setProfileImage] = useState<string | null>(null);
  // refs
  const nameRef = useRef<TextInput | null>(null);
  const positionRef = useRef<TextInput | null>(null);
  const emailRef = useRef<TextInput | null>(null);
  const phoneRef = useRef<TextInput | null>(null);
  const usernameRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const confirmPasswordRef = useRef<TextInput | null>(null);
  // fields
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [selectedCountry, setSelectedCountry] = useState({
    id: 1,
    name: "Deutsch",
    code: "49",
    flag: require("../../../../assets/icons/de.png"),
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [confirmPopupVisible, setConfirmPopupVisible] = useState(false);
  // Branch selection (typeable)
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const branchInputWrapperRef = useRef<View | null>(null);
  const [branchInputLayout, setBranchInputLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [timeFrom, setTimeFrom] = useState<string>("");
  const [timeFromError, setTimeFromError] = useState<string>("");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [durationHours, setDurationHours] = useState<string>("");
  const [durationError, setDurationError] = useState<string>("");
  const [addScheduleModalVisible, setAddScheduleModalVisible] = useState(false);
  const [schedules, setSchedules] = useState<Record<string, ScheduleEntry>>({});
  const [finalSchedule, setFinalSchedule] = useState<SchedulePayload[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null); // will hold weekday name like "Sunday"
  const FULL_WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatTime12 = (hhmmss: string) => {
    if (!hhmmss) return "";
    const parts = hhmmss.split(":");
    if (parts.length < 2) return hhmmss;
    let hh = parseInt(parts[0], 10);
    const mm = parts[1];
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${ampm}`;
  };
  const timeStringToDate = (timeStr: string) => {
    const now = new Date();
    now.setSeconds(0, 0);
    if (!timeStr) return now;
    const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
    now.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    return now;
  };

  const dateToYMD = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const getWeekDates = () => {
    const today = new Date();
    const dayIdx = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayIdx);
    sunday.setHours(0, 0, 0, 0);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  };
  const weekDates = getWeekDates();
  const onShowNativeTimePicker = () => setShowTimePicker(true);
  const onNativeTimeChange = (event: any, selected?: Date) => {
    setShowTimePicker(false);
    if (!selected) return;
    const hh = pad2(selected.getHours());
    const mm = pad2(selected.getMinutes());
    const ss = "00";
    setTimeFrom(`${hh}:${mm}:${ss}`);
    setTimeFromError("");
  };

  const buildScheduleArray = () => {
    const result: SchedulePayload[] = [];

    const normalizeHHMM = (t: string) => {
      if (!t) return "";
      const parts = t.split(":").map((p) => p.trim());
      if (parts.length >= 2) {
        const hh = parts[0].padStart(2, "0");
        const mm = parts[1].padStart(2, "0");
        return `${hh}:${mm}`;
      }
      return t;
    };

    const addEntry = (
      date: string,
      weekday: string,
      start: string,
      end: string,
      durationHours?: number
    ) => {
      const s = normalizeHHMM(start);
      const e = normalizeHHMM(end);
      if (!date || !weekday || !s || !e) {
        console.warn("Skipping malformed schedule entry", { date, weekday, start, end });
        return;
      }
      result.push({
        date,
        day_of_week: weekday,
        start_time: s,
        end_time: e,
        duration: durationHours,
      });
    };

    const computeDurationHours = (startMinutes: number, endMinutes: number) => {
      if (endMinutes >= startMinutes) {
        return Number(((endMinutes - startMinutes) / 60).toFixed(2));
      }
      // cross-midnight handled by splitting, but keep fallback:
      return Number(((24 * 60 - startMinutes + endMinutes) / 60).toFixed(2));
    };

    FULL_WEEKDAYS.forEach((dayName) => {
      const s = schedules[dayName];
      if (!s) return;

      const date = String(s.date ?? getDateForWeekday(dayName));
      if (!date) return;
      if (!s.startTime || !s.endTime) return;

      const start_time = normalizeHHMM(String(s.startTime));
      const end_time = normalizeHHMM(String(s.endTime));

      if (!start_time || !end_time) return;

      const [sh, sm] = start_time.split(":").map(Number);
      const [eh, em] = end_time.split(":").map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;

      if (endMinutes >= startMinutes) {
        const duration = computeDurationHours(startMinutes, endMinutes);
        addEntry(date, dayName, start_time, end_time, duration);
      } else {
        // crosses midnight -> split into two entries
        const duration1 = computeDurationHours(startMinutes, 24 * 60 - 1); // start -> 23:59
        addEntry(date, dayName, start_time, "23:59", duration1);

        const nextDateObj = new Date(date);
        nextDateObj.setDate(nextDateObj.getDate() + 1);
        const y = nextDateObj.getFullYear();
        const m = (nextDateObj.getMonth() + 1).toString().padStart(2, "0");
        const d = nextDateObj.getDate().toString().padStart(2, "0");
        const nextDate = `${y}-${m}-${d}`;

        const nextWeekday = FULL_WEEKDAYS[(FULL_WEEKDAYS.indexOf(dayName) + 1) % 7];

        const duration2 = computeDurationHours(0, endMinutes);
        addEntry(nextDate, nextWeekday, "00:00", end_time, duration2);
      }
    });
    return result;
  };

  // --- 1) Helper: getDateForWeekday ---
  const getDateForWeekday = (dayName: string) => {
    const idx = FULL_WEEKDAYS.indexOf(dayName); // 0 = Sunday
    if (idx === -1) return null;

    const today = new Date();
    const dayIdx = today.getDay(); // 0..6
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayIdx);
    sunday.setHours(0, 0, 0, 0);

    const target = new Date(sunday);
    target.setDate(sunday.getDate() + idx);
    target.setHours(0, 0, 0, 0);

    return dateToYMD(target); // uses your existing dateToYMD helper
  };

  const onAddSchedule = () => {
    if (!timeFrom || !durationHours) {
      if (!timeFrom)
        setTimeFromError(
          lang.invalid_start_time || "Enter valid start time (HH:MM:SS)"
        );
      if (!durationHours)
        setDurationError(lang.invalid_duration || "Enter duration in hours");
      return;
    }
    if (!activeDate) {
      console.warn("No active day selected for schedule");
      return;
    }

    // parse start time
    const [h, m, s] = timeFrom.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(h || 0, m || 0, s || 0);

    const durationNum = Number(durationHours);
    const endDate = new Date(
      startDate.getTime() + durationNum * 60 * 60 * 1000
    );
    const endTime = endDate.toTimeString().split(" ")[0].slice(0, 8); // HH:MM:SS

    const dayName = activeDate; // e.g. "Sunday"

    // compute date for this weekday in current week (YYYY-MM-DD)
    const dateForDay = getDateForWeekday(dayName);

    setSchedules((prev) => {
      const newSchedules = {
        ...prev,
        [dayName]: {
          startTime: timeFrom,
          endTime: endTime,
          duration: durationNum,
          date: dateForDay,
        },
      };
      console.log("Schedule added for", dayName, "=>", newSchedules[dayName]);
      console.table(
        Object.entries(newSchedules).map(([day, sObj]) => ({
          day,
          date: sObj.date,
          start: sObj.startTime,
          end: sObj.endTime,
          duration: sObj.duration,
        }))
      );
      return newSchedules;
    });

    // close modal and reset modal fields
    setAddScheduleModalVisible(false);
    setTimeFrom("");
    setDurationHours("");
    setTimeFromError("");
    setDurationError("");
  };

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
  // Camera & gallery functions
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(lang.permission_denied_title, lang.camera_access_required);
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

      setErrors((prev: any) => ({ ...prev, profileImage: "" }));

      setModalVisible(false);
    }
  };
  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(lang.permission_denied_title, lang.gallery_access_required);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);

      // clear error if previously set
      setErrors((prev: any) => ({ ...prev, profileImage: "" }));

      setModalVisible(false);
    }
  };
  // error states
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

  const validateFieldp = (field: string) => {
    let error = "";
    switch (field) {
      case "phone": {
        const normalized = phoneRaw || "";
        const phoneRule = getPhoneRuleForSelected();
        if (!normalized) error = lang.phone_required;
        else if (normalized.length < phoneRule.min)
          error = `${lang.Enter_at_least} ${phoneRule.min} ${lang.digits}`;
        else if (normalized.length > phoneRule.max)
          error = `${lang.Maximum} ${phoneRule.max} ${lang.digits}`;
      }
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
    return error === "";
  };
  const [emailExists, setEmailExists] = useState(false);
  const [usernameExists, setUsernameExists] = useState(false);

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email));
  };
  const validatePhone = (phoneValue: string): boolean => {
    const digits = (phoneValue || "").replace(/\D/g, "");
    const rule = getPhoneRuleForSelected();
    return digits.length >= rule.min && digits.length <= rule.max;
  };
  const validatePassword = (password: string): boolean => {
    const re =
      /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
    return re.test(password);
  };
  // validate step 1
  const validateStep1 = (): boolean => {
    let valid = true;
    let newErrors: any = {};

    if (!fullName) {
      newErrors.fullName = lang.full_name_required;
      valid = false;
    }

    if (!position) {
      newErrors.position = lang.position_required;
      valid = false;
    }

    if (!email) {
      newErrors.email = lang.email_required;
      valid = false;
    } else if (!validateEmail(email)) {
      newErrors.email = lang.invalid_email;
      valid = false;
    }

    // phone: use phoneRaw (digits-only) for validation
    const rule = getPhoneRuleForSelected();
    const digits = (phoneRaw || "").replace(/\D/g, "");

    if (!digits) {
      newErrors.phone = lang.phone_required;
      valid = false;
    } else if (digits.length < rule.min) {
      if (rule.min === rule.max) {
        newErrors.phone = `${lang.Please_complete_all || "Please complete all"
          } ${rule.max} ${lang.digits || "digits"}`;
      } else {
        newErrors.phone = `${lang.Enter_at_least || "Enter at least"} ${rule.min
          } ${lang.digits || "digits"}`;
      }
      valid = false;
    } else if (digits.length > rule.max) {
      newErrors.phone = `${lang.Maximum || "Maximum"} ${rule.max} ${lang.digits || "digits"
        }`;
      valid = false;
    }
    setErrors(newErrors);
    return valid;
  };

  // validate step 2
  const validateStep2 = async (): Promise<boolean> => {
    let valid = true;
    let newErrors: any = {};

    if (!username) {
      newErrors.username = lang.username_required;
      valid = false;
    } else {
      const exists = await checkUsernameExists(username);
      if (exists) {
        newErrors.username = lang.username_exists; // make sure to add this string in lang file
        valid = false;
      }
    }

    if (!password) {
      newErrors.password = lang.password_required;
      valid = false;
    } else if (!validatePassword(password)) {
      newErrors.password = lang.password_invalid;
      valid = false;
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = lang.confirm_password_required;
      valid = false;
    } else if (confirmPassword !== password) {
      newErrors.confirmPassword = lang.passwords_no_match;
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };
  const [checkingUsername, setCheckingUsername] = useState(false);
  const onSavePress = async () => {
    if (checkingUsername) return; // avoid duplicate requests

    try {
      setCheckingUsername(true);
      const isValid = await validateStep2();
      if (isValid) {
        setConfirmPopupVisible(true);
      }
    } finally {
      setCheckingUsername(false);
    }
  };

  const validateField = (field: string, value: string) => {
    let error = "";
    switch (field) {
      case "fullName":
        if (!value) error = lang.full_name_required;
        break;

      case "position":
        if (!value) error = lang.position_required;
        break;

      case "email":
        if (!value) error = lang.email_required;
        else if (!validateEmail(value)) error = lang.invalid_email;
        break;

      case "phone":
        if (!value) error = lang.phone_required;
        else if (!validatePhone(value)) error = lang.invalid_phone;
        break;

      case "username":
        if (!value) {
          error = lang.username_required;
        }
        // removed local uniqueness check (we now rely on backend)
        break;

      case "password":
        if (!value) error = lang.password_required;
        else if (!validatePassword(value)) error = lang.password_invalid;
        break;

      case "confirmPassword":
        if (!value) error = lang.confirm_password_required;
        else if (value !== password) error = lang.passwords_no_match;
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  // handlers
  const handleNext = async () => {
    if (!validateStep1()) {
      setTouched((prev) => ({ ...prev, phone: true }));
      return;
    }

    // format finalPhone as earlier
    const finalPhone = `${selectedCountry.code}${phoneRaw}`;

    if (email && validateEmail(email)) {
      try {
        // optionally set a small UI flag here (checkingEmail) if you want a spinner
        const exists = await checkEmailExists(email);
        if (exists) {
          // set error and prevent going to next step
          setErrors((prev) => ({
            ...prev,
            email: lang.email_in_use || "Email already in use",
          }));
          // ensure email input is focused so user notices (optional)
          emailRef.current?.focus();
          return;
        } else {
          // clear any previous email-exists error
          setErrors((prev) => ({ ...prev, email: "" }));
        }
      } catch (e) {
        // if the check fails unexpectedly, we do not block user — but log it
        console.warn("Email availability check failed, proceeding without blocking:", e);
      }
    }

    // proceed to build step1 data and go to step 2
    const nameParts = fullName.trim().split(/\s+/);
    const firstname = nameParts[0] ?? "";
    const lastname = nameParts.slice(1).join(" ") ?? "";

    const step1_Data = {
      id: undefined,
      firstname,
      lastname,
      position,
      email,
      phone: finalPhone,
      userId,
      langId,
    };

    console.log("Step1 data:", { ...step1_Data, phone: step1_Data.phone });
    goToStep2();
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);

    if (step === 1) {
      // Reset Step 1 fields
      setProfileImage(null);
      setFullName("");
      setPosition("");
      setEmail("");
      setPhone("");
      setErrors({});
    } else if (step === 2) {
      setSchedules({});
      setActiveDate(null);
      setTimeFrom("");
      setTimeFromError("");
      setDurationHours("");
      setDurationError("");
      setAddScheduleModalVisible(false);
      setSelectedBranch("");
      setSelectedBranchId(null);
    } else if (step === 3) {
      // Reset Step 2 fields
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setErrors({});
    }
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, [step]);

  const goToStep2 = () => {
    setStep(2);
  };

  const goToStep3 = () => {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setErrors({});
    setStep(3);
  };
  const onBranchLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setBranchInputLayout({ x, y, width, height });
  };

  // Small safe parseYMD utility to avoid cross-engine Date parsing issues
  const parseYMD = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((n) => Number(n));
    return new Date(y, m - 1, d);
  };

  const loadSavedBranch = async () => {
    try {
      const saved = await getBranchId(); // from AsyncStorage
      if (!saved) return;

      // set id immediately
      setSelectedBranchId(saved);

      // try to fetch branch name
      const branch = await getBranchById(saved);
      if (branch && branch.name) {
        setSelectedBranch(branch.name);
      } else {
        // fallback: show id (better than empty)
        setSelectedBranch(String(saved));
      }
    } catch (e) {
      console.warn("loadSavedBranch failed", e);
      setSelectedBranch(String((await getBranchId()) ?? ""));
    }
  };

  useEffect(() => {
    // load default branch once on mount
    (async () => {
      if (!selectedBranch && !selectedBranchId) {
        await loadSavedBranch();
      }
    })();
  }, []);

  const openAddModalForDate = async (ymd: string) => {
    // parse input ymd to find weekday name
    const d = parseYMD(ymd);
    const dayName = FULL_WEEKDAYS[d.getDay()];
    setActiveDate(dayName);
    // if branch not selected, try fetching admin's saved branch id and set selectedBranchId + name
    if (!selectedBranch && !selectedBranchId) {
      await loadSavedBranch();
    }
    // If there's an existing schedule for this weekday, pre-fill the modal fields
    const existing = schedules[dayName];
    if (existing) {
      // prefer existing times
      setTimeFrom(existing.startTime ?? "");
      setDurationHours(
        existing.duration !== undefined ? String(existing.duration) : ""
      );
      // ensure date exists
      if (!existing.date) {
        const computed = getDateForWeekday(dayName);
        if (computed) {
          // attach computed date back into schedules so it persists
          setSchedules((prev) => ({
            ...prev,
            [dayName]: {
              ...prev[dayName],
              date: computed,
            },
          }));
        }
      }
    } else {
      // no existing schedule: compute date and set modal defaults empty
      const computed = getDateForWeekday(dayName);
      // we do not persist until user presses Add, but keeping date available is helpful
      setTimeFrom("");
      setDurationHours("");
      // optionally preload date into schedules as a placeholder (commented)
      // setSchedules(prev => ({ ...prev, [dayName]: { date: computed } }));
    }

    setAddScheduleModalVisible(true);
  };

  const hasWeeklySchedule = React.useMemo(() => {
    return FULL_WEEKDAYS.some((d) => !!schedules[d]);
  }, [schedules]);

  // Reset all Step-2 schedule related fields
  const resetStep2Fields = () => {
    setSchedules({});
    setActiveDate(null);
    setTimeFrom("");
    setTimeFromError("");
    setDurationHours("");
    setDurationError("");
    setAddScheduleModalVisible(false);
  };
  const handleProceedFromStep2 = () => {
    const scheduleArray = buildScheduleArray(); //includes date, start_time, end_time, duration

    // Log a friendly summary to the console before proceeding
    const summary =
      scheduleArray.length === 0
        ? "No schedules set for this week."
        : scheduleArray
          .map(
            (item) =>
              `${item.day_of_week} (${item.date}): ${item.start_time} - ${item.end_time}`
          )
          .join("\n");

    console.log("Proceeding from Step 2. Weekly schedules summary:\n", summary);

    if (scheduleArray.length > 0) {
      console.table(
        scheduleArray.map((item) => ({
          day: item.day_of_week,
          date: item.date,
          start: item.start_time,
          end: item.end_time,
          duration: item.duration,
        }))
      );
    }
    setFinalSchedule(scheduleArray); // <-- if you store to state for Step3
    goToStep3();
  };

  useEffect(() => {
    if (usernameTimer.current) {
      clearTimeout(usernameTimer.current);
      usernameTimer.current = null;
    }

    if (!username) {
      setErrors((prev) => ({ ...prev, username: "" }));
      setCheckingUsername(false);
      return;
    }

    // kick off debounce
    setCheckingUsername(true);
    usernameTimer.current = setTimeout(async () => {
      try {
        const exists = await checkUsernameExists(username);
        if (exists) {
          setErrors((prev) => ({
            ...prev,
            username: lang.username_exists || "Username already taken",
          }));
        } else {
          // only clear if there isn't another validation error
          setErrors((prev) => ({
            ...prev,
            username:
              prev.username ===
                (lang.username_exists || "Username already taken")
                ? ""
                : prev.username,
          }));
        }
      } finally {
        setCheckingUsername(false);
      }
    }, 600);

    return () => {
      if (usernameTimer.current) {
        clearTimeout(usernameTimer.current);
        usernameTimer.current = null;
      }
    };
  }, [username]);

  // email availability check (only when email format valid)
  useEffect(() => {
    if (emailTimer.current) {
      clearTimeout(emailTimer.current);
      emailTimer.current = null;
    }

    if (!email) {
      setErrors((prev) => ({ ...prev, email: "" }));
      setCheckingEmail(false);
      return;
    }

    // quick format check
    if (!validateEmail(email)) {
      // don't run availability check if invalid format
      setErrors((prev) => ({
        ...prev,
        email: lang.invalid_email || "Invalid email",
      }));
      setCheckingEmail(false);
      return;
    } else {
      // clear format error (we will check uniqueness)
      setErrors((prev) => ({ ...prev, email: "" }));
    }

    setCheckingEmail(true);
    emailTimer.current = setTimeout(async () => {
      try {
        const exists = await checkEmailExists(email);
        if (exists) {
          setErrors((prev) => ({
            ...prev,
            email: lang.email_in_use || "Email already in use",
          }));
        } else {
          setErrors((prev) => ({ ...prev, email: "" }));
        }
      } finally {
        setCheckingEmail(false);
      }
    }, 600);

    return () => {
      if (emailTimer.current) {
        clearTimeout(emailTimer.current);
        emailTimer.current = null;
      }
    };
  }, [email]);

  const handleSave = async () => {
    if (!(await validateStep2())) return;

    // build payload (API expects "fullname" per your raw body)
    const finalPhone = `${selectedCountry.code}${phoneRaw}`;

    // Determine branch id to use: prefer selectedBranchId, else use saved admin branch
    let branchIdToUse: string | null = null;
    try {
      // Force server fetch to ensure we use the active logged-in user's branch
      branchIdToUse = await getLoggedInUserBranch(false); // pass true to prefer cache if you want
      if (!branchIdToUse) {
        console.warn("No branch id found for logged-in user; payload will send empty string for branch");
      }
    } catch (e) {
      console.warn("Failed to obtain logged-in user's branch id", e);
      branchIdToUse = null;
    }

    const payload: any = {
      fullname: fullName,
      branch: branchIdToUse ?? "",
      username: username,
      email: email,
      password: password,
      position: position,
      phone: finalPhone,
      role: "",
    };

    // Save current admin token & userId so we can restore later
    let prevToken: string | null = null;
    let prevUserId: string | null = null;
    try {
      prevToken = await AsyncStorage.getItem("userToken");
      prevUserId = await AsyncStorage.getItem("userId");
    } catch (e) {
      console.warn("Failed to read previous auth data", e);
    }

    try {
      // call register from AuthService
      const result = await authRegister(payload);
      // result contains { token, user } per interface
      const createdUser = result?.user ?? null;
      const createdId = createdUser.id ?? null;

      // call onSave callback without password
      if (onSave) {
        try {
          const sanitized = { ...(createdUser || {}), password: undefined };
          onSave(sanitized);
        } catch (e) {
          console.warn("onSave callback error", e);
        }
      }

      // Immediately restore previous admin token BEFORE fetching user profile and posting schedules
      try {
        if (prevToken) {
          await AsyncStorage.setItem("userToken", prevToken);
        } else {
          await AsyncStorage.removeItem("userToken");
        }
        if (prevUserId) {
          await AsyncStorage.setItem("userId", prevUserId);
        } else {
          await AsyncStorage.removeItem("userId");
        }
      } catch (e) {
        console.warn(
          "Failed to restore previous auth data before profile fetch / schedule post",
          e
        );
      }

      // If we have a created user id, fetch full user from DB and log it
      if (createdId) {
        try {
          const fresh = await getUserById(String(createdId));
          console.log("Created user fetched from DB:", fresh);
        } catch (fetchErr) {
          console.warn(
            "Failed to fetch created user after register:",
            fetchErr
          );
        }
      } else {
        console.warn(
          "Created user id not returned by authRegister:",
          createdUser
        );
      }

      // --- NEW: Build schedule payload and POST to schedule bulk endpoint ---
      try {
        const scheduleArray = buildScheduleArray();
        if (scheduleArray.length > 0) {
          try {
            const scheduleResp = await postSchedulesBulk(
              String(createdId),
              String(branchIdToUse ?? ""),
              scheduleArray,
              prevToken ?? undefined
            );
            console.log("Schedule bulk response:", scheduleResp);
          } catch (scheduleErr: any) {
            console.warn(
              "Failed to POST schedules after creating employee:",
              scheduleErr?.response ?? scheduleErr
            );
            showErrorToast("Failed to save schedules (saved user).");
          }
        } else {
          console.log("No schedules to post for created employee.");
        }
      } catch (outerErr) {
        console.warn("Error while preparing schedules:", outerErr);
      }
      // --- after your schedule POST (inside try that created the user) ---
      try {
        // prepare friendly notification body
        const employeeId = String(createdId);
        const scheduleArrayForNotif: SchedulePayload[] = buildScheduleArray() || [];

        const formatDateReadable = (ymd: string) => {
          if (!ymd) return "";
          const [y, m, d] = String(ymd).split("-").map((v) => Number(v));
          if (!y || !m || !d) return ymd;
          const dt = new Date(y, m - 1, d);
          return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
        };

        const composeBody = () => {
          let body = `Welcome ${fullName ?? "Member"} - Your account has been created.`;
          if (scheduleArrayForNotif.length > 0) {
            // give a short, readable summary of schedules
            const lines = scheduleArrayForNotif.map((s) => {
              const dateReadable = formatDateReadable(s.date);
              const start = s.start_time || "";
              const end = s.end_time || "";
              return `${s.day_of_week} (${dateReadable}), Time: ${start} - ${end}`;
            });
            body += `\nYour shifts this week: ` + lines.slice(0, 10).join("\n"); // cap lines to 10 for safety
          }
          return body;
        };

        const notifPayload = {
          title: scheduleArrayForNotif.length > 0 ? "Welcome - New Shift Assigned" : "Welcome to the team",
          body: composeBody(),
          type: "staff_created",
          meta: {
            createdBy: userId ?? null,
            branchId: branchIdToUse ?? null,
            schedulesCount: scheduleArrayForNotif.length,
            schedulesPreview: scheduleArrayForNotif.slice(0, 10), // small payload
          },
        };

        try {
          await sendNotificationToUser(employeeId, notifPayload);
          console.log("[notif] welcome notification written for", employeeId);
        } catch (e) {
          // do not block success path
          console.warn("[notif] failed to write welcome notification for", employeeId, e);
        }
      } catch (e) {
        console.warn("[notif] unexpected error preparing/sending welcome notification:", e);
      }

      showSuccessToast(
        lang?.staff_created_success ?? "Staff created successfully"
      );
      setConfirmPopupVisible(false);
      console.log("Creating staff with payload branch:", branchIdToUse, "payload:", {
        fullname: fullName,
        branch: branchIdToUse ?? "",
        username, email, position, phone: finalPhone,
      })
      navigation.goBack();
    } catch (err: any) {
      setConfirmPopupVisible(false);
      setErrors((prev) => ({
        ...prev,
        username: lang.username_exists_use || "This username already exists in another branch.",
      }));
      setUsernameExists(true);

      const message =
        err?.response?.data?.message ??
        err?.response?.data ??
        err?.message ??
        "Failed to create staff";

      showErrorToast(String(message));
    } finally {
      // restore previous admin token and userId (if any) to avoid switching session
      // NOTE: we already attempted restore above; keep this as a safety net.
      try {
        if (prevToken) {
          axiosInstance.defaults.headers[
            "Authorization"
          ] = `Bearer ${prevToken}`;
        } else {
          await AsyncStorage.removeItem("userToken");
        }
        if (prevUserId) {
          await AsyncStorage.setItem("userId", prevUserId);
        } else {
          await AsyncStorage.removeItem("userId");
        }
      } catch (e) {
        console.warn("Failed to restore previous auth data in finally", e);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: "image",
          url: require("../../../../assets/icons/back_b.png"),
          width: 23,
          height: 23,
          onPress: () => {
            if (step === 2) {
              resetStep2Fields();
              setStep(1); // go back to Step 1
            } else if (step === 3) {
              setStep(2);
            } else {
              navigation.goBack();
            }
          },
        }}
        center={{ type: "text", value: lang.profile, color: colors.text }}
      />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          extraScrollHeight={20} // adjust scroll when keyboard opens
          enableOnAndroid={true}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressBackgroundColor={colors.secondary}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                progressBackgroundColor={colors.secondary}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            <View style={styles.progressWrap}>
              <View
                style={[
                  styles.progressLine,
                  {
                    backgroundColor:
                      step >= 1 ? colors.primary : colors.progressBarBackground,
                  },
                ]}
              />
              <View
                style={[
                  styles.progressLine,
                  {
                    backgroundColor:
                      step >= 2 ? colors.primary : colors.progressBarBackground,
                  },
                ]}
              />
              <View
                style={[
                  styles.progressLine,
                  {
                    backgroundColor:
                      step >= 3 ? colors.primary : colors.progressBarBackground,
                  },
                ]}
              />
            </View>

            {step === 1 ? (
              <>
                <View>
                  <Text style={styles.title}>{lang.basic_details}</Text>
                  <Text style={styles.subtitle}>{lang.basic_details_desc}</Text>
                </View>

                <CartBox
                  alignItems="center"
                  marginTop={20}
                  marginBottom={8}
                  backgroundColor={colors.secondary}
                  borderRadius={0}
                  paddingTop={10}
                  paddingBottom={10}
                >
                  <View style={styles.profileImageContainer}>
                    {profileImage ? (
                      <Image
                        source={{ uri: profileImage }}
                        style={styles.image}
                      />
                    ) : (
                      <Image
                        source={require("../../../../assets/icons/profile_gray.png")}
                        style={styles.image}
                      />
                    )}
                  </View>
                  <View style={styles.addprofile}>
                    <TouchableOpacity onPress={() => setModalVisible(true)}>
                      <Text
                        style={[
                          styles.addPhoto,
                          errors.profileImage
                            ? { color: colors.error_text }
                            : null,
                        ]}
                      >
                        {lang.add_profile}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </CartBox>
                <InputBox
                  ref={nameRef}
                  label={lang.full_name}
                  placeholder={lang.enter_full_name}
                  value={fullName}
                  setValue={(text) => {
                    setFullName(text);
                    if (!text) {
                      setErrors((prev) => ({
                        ...prev,
                        fullName: lang.full_name_required,
                      }));
                    } else {
                      setErrors((prev) => ({ ...prev, fullName: "" }));
                    }
                  }}
                  errorMessage={errors.fullName}
                  returnKeyType="next"
                  onSubmitEditing={() => positionRef.current?.focus()}
                />
                <InputBox
                  ref={positionRef}
                  label={lang.position}
                  placeholder={lang.enter_position}
                  value={position}
                  setValue={(text) => {
                    setPosition(text);
                    if (!text) {
                      setErrors((prev) => ({
                        ...prev,
                        position: lang.position_required,
                      }));
                    } else {
                      setErrors((prev) => ({ ...prev, position: "" }));
                    }
                  }}
                  errorMessage={errors.position}
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
                <InputBox
                  ref={emailRef}
                  label="Email"
                  placeholder="Enter email"
                  value={email}
                  setValue={async (text) => {
                    setEmail(text);

                    if (!text) {
                      setErrors((prev) => ({
                        ...prev,
                        email: lang.Email_is_required || "Email is required",
                      }));
                      setEmailExists(false);
                      return;
                    }

                    if (!validateEmail(text)) {
                      setErrors((prev) => ({
                        ...prev,
                        email: lang.invalid_email || "Invalid email format",
                      }));
                      setEmailExists(false);
                      return;
                    }

                    const exists = await checkEmailExists(text);

                    if (exists) {
                      setErrors((prev) => ({
                        ...prev,
                        email:
                          lang.email_already_used ||
                          "This email is already used.",
                      }));
                      setEmailExists(true);
                    } else {
                      setErrors((prev) => ({ ...prev, email: "" }));
                      setEmailExists(false);
                    }
                  }}
                  errorMessage={errors.email}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (!errors.email && !emailExists) {
                      phoneRef.current?.focus();
                    } else {
                      emailRef.current?.focus(); // stay in email field if error exists
                    }
                  }}
                />
                <InputBox
                  ref={phoneRef}
                  label="Phone"
                  placeholder={`123 456 789`}
                  value={phone}
                  setValue={(text: string) => onPhoneChange(text)}
                  errorMessage={touched.phone ? errors.phone : ""}
                  leftIcon={selectedCountry.flag}
                  leftIcon2={require("../../../../assets/icons/down_b.png")}
                  onLeftIcon2Press={() =>
                    navigation.navigate("Code", {
                      initialSelectedId: selectedCountry.id,
                      onSelect: (item: any) => {
                        setSelectedCountry(item);
                        const newRule =
                          PHONE_RULES[(item.code || "").replace(/\D/g, "")] ||
                          DEFAULT_PHONE_RULE;

                        let currentRaw = (phone || "").replace(/\D/g, "");
                        const hasLeadingZero = currentRaw.startsWith("0");
                        const maxDisplay =
                          newRule.max + (hasLeadingZero ? 1 : 0);
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
                              phone: `${lang.Please_complete_all ||
                                "Please complete all"
                                } ${newRule.max} digits`,
                            }));
                          } else {
                            setErrors((prev) => ({
                              ...prev,
                              phone: `${lang.enterAtLeast || "Enter at least"
                                } ${newRule.min} ${lang.digits || "digits"}`,
                            }));
                          }
                        } else {
                          setErrors((prev) => ({ ...prev, phone: "" }));
                        }
                      },
                    })
                  }
                  returnKeyType="done"
                  onFocus={() => {
                    setFieldTouched("phone");
                  }}
                  onBlur={() => validateFieldp("phone")}
                  keyboardType="phone-pad"
                  onSubmitEditing={() => {
                    validateField("phone", phone);
                    Keyboard.dismiss();
                  }}
                />
              </>
            ) : step === 2 ? (
              <>
                <View style={styles.contentBox}>
                  <Text style={styles.title}>{lang.schedule_details}</Text>
                  <Text style={styles.subtitle}>
                    {lang.create_new_work_schedule}
                  </Text>
                </View>

                <View style={{ marginTop: 0 }}>
                  {weekDates.map((d) => {
                    const ymd = dateToYMD(d);
                    const dayName = FULL_WEEKDAYS[d.getDay()];
                    const wk = WEEKDAYS[d.getDay()]; // short label like "Sun","Mon"
                    return (
                      <View key={dayName} style={styles.each_day}>
                        <CartBox
                          width="auto"
                          height={52}
                          containerStyle={styles.day}
                        >
                          <Text style={styles.day_text}>{`${wk}`}</Text>
                        </CartBox>
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          activeOpacity={0.8}
                          onPress={() => {
                            openAddModalForDate(ymd);
                          }}
                        >
                          <CartBox width="auto" containerStyle={styles.time}>
                            {schedules[dayName] ? (
                              <View style={{ alignItems: "center" }}>
                                <View style={{ flexDirection: "row" }}>
                                  <Image
                                    source={require("../../../../assets/icons/clock_b.png")}
                                    style={styles.clock}
                                  />
                                  <Text style={styles.time_text}>
                                    {schedules[dayName]
                                      ? `${formatTime12(
                                        schedules[dayName].startTime
                                      )} - ${formatTime12(
                                        schedules[dayName].endTime
                                      )}`
                                      : ""}
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <Image
                                source={require("../../../../assets/icons/plus_b.png")}
                                style={styles.plus}
                              />
                            )}
                          </CartBox>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={styles.contentBox}>
                  <Text style={styles.title}>{lang.login_account_details}</Text>
                  <Text style={styles.subtitle}>{lang.login_account_desc}</Text>
                </View>
                <InputBox
                  ref={usernameRef}
                  label={lang.username}
                  placeholder={lang.enter_username}
                  value={username}
                  setValue={async (text) => {
                    setUsername(text);

                    if (!text) {
                      setErrors((prev) => ({
                        ...prev,
                        username: lang.username_required,
                      }));
                      setUsernameExists(false);
                      return;
                    }

                    const exists = await checkUsernameExists(text);

                    if (exists) {
                      setErrors((prev) => ({
                        ...prev,
                        username: lang.username_exists,
                      }));
                      setUsernameExists(true);
                    } else {
                      setErrors((prev) => ({ ...prev, username: "" }));
                      setUsernameExists(false);
                    }
                  }}
                  errorMessage={errors.username}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (!errors.userName && !usernameExists) {
                      validateField("username", username);
                      passwordRef.current?.focus();
                    } else {
                      usernameRef.current?.focus();
                    }
                  }}
                />

                <InputBox
                  ref={passwordRef}
                  label={lang.password_label}
                  placeholder="********"
                  secureTextEntry={!showPassword ? true : false}
                  value={password}
                  setValue={(text) => {
                    setPassword(text);
                    if (!text) {
                      setErrors((prev) => ({
                        ...prev,
                        password: lang.password_required,
                      }));
                    } else if (!validatePassword(text)) {
                      setErrors((prev) => ({
                        ...prev,
                        password: lang.password_invalid,
                      }));
                    } else {
                      setErrors((prev) => ({ ...prev, password: "" }));
                    }
                  }}
                  rightIcon={
                    showPassword
                      ? require("../../../../assets/icons/eye_open.png")
                      : require("../../../../assets/icons/eye_close.png")
                  }
                  onRightIconPress={() => setShowPassword((s) => !s)}
                  errorMessage={errors.password}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    validateField("password", password);
                    confirmPasswordRef.current?.focus();
                  }}
                />

                <InputBox
                  ref={confirmPasswordRef}
                  label={lang.confirmPassword}
                  placeholder="********"
                  secureTextEntry={!showConfirmPassword ? true : false}
                  value={confirmPassword}
                  setValue={(text) => {
                    setConfirmPassword(text);
                    if (!text) {
                      setErrors((prev) => ({
                        ...prev,
                        confirmPassword: lang.confirm_password_required,
                      }));
                    } else if (text !== password) {
                      setErrors((prev) => ({
                        ...prev,
                        confirmPassword: lang.passwords_no_match,
                      }));
                    } else {
                      setErrors((prev) => ({ ...prev, confirmPassword: "" }));
                    }
                  }}
                  rightIcon={
                    showConfirmPassword
                      ? require("../../../../assets/icons/eye_open.png")
                      : require("../../../../assets/icons/eye_close.png")
                  }
                  onRightIconPress={() => setShowConfirmPassword((s) => !s)}
                  errorMessage={errors.confirmPassword}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    validateField("confirmPassword", confirmPassword);
                    Keyboard.dismiss();
                  }}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>

      {/* Profile Image Modal */}
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
            <Text style={styles.modalTitle}>Edit profile</Text>

            <CartBox
              paddingLeft={20}
              paddingTop={10}
              paddingBottom={10}
              alignItems="flex-start"
              borderRadius={12}
              borderWidth={1}
              borderColor="#E5E7EB"
              marginBottom={12}
              onPress={openCamera}
            >
              <View style={styles.logout}>
                <Image
                  source={require("../../../../assets/icons/p_camera.png")}
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
              borderColor="#E5E7EB"
              onPress={openGallery}
            >
              <View style={styles.logout}>
                <Image
                  source={require("../../../../assets/icons/p_gallery.png")}
                  style={styles.logoutIcon}
                />
                <Text style={styles.modalButtonText}>{lang.gallery}</Text>
              </View>
            </CartBox>
          </View>
        </Pressable>
      </Modal>

      <Popup
        visible={confirmPopupVisible}
        onClose={() => setConfirmPopupVisible(false)}
        popupBorderColor={colors.primary}
        dismissOnOverlayPress={false}
        title={lang.confirm_save_staff}
        titleStyle={{ color: colors.primary, marginBottom: 30 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Button1
            text={lang.yes}
            backgroundColor={colors.primary}
            width={"48%"}
            textStyle={{ color: colors.secondary }}
            onPress={handleSave}
          />
          <Button1
            text={lang.no}
            onPress={() => setConfirmPopupVisible(false)}
            backgroundColor={colors.error_text}
            width={"48%"}
            textStyle={{ color: colors.secondary }}
          />
        </View>
      </Popup>

      <View style={styles.fixedNext}>
        {step === 1 && (
          <Button1
            text={lang.next}
            onPress={handleNext}
            backgroundColor={colors.primary}
            width={"100%"}
          />
        )}
        {step === 2 && (
          <View style={styles.step2Buttons}>
            <Button1
              text={lang.previous}
              textStyle={{ color: colors.primary }}
              onPress={() => {
                resetStep2Fields();
                setStep(1);
              }}
              backgroundColor={colors.secondary}
              width={"45%"}
            />
            {hasWeeklySchedule ? (
              <Button1
                text={lang.next ?? "Next"}
                onPress={handleProceedFromStep2}
                backgroundColor={colors.primary}
                width={"45%"}
              />
            ) : (
              <Button1
                text={lang.skip ?? "Skip"}
                onPress={handleProceedFromStep2}
                backgroundColor={colors.primary}
                width={"45%"}
              />
            )}
          </View>
        )}

        {step === 3 && (
          <View style={styles.step2Buttons}>
            <Button1
              text={lang.previous}
              textStyle={{ color: colors.primary }}
              onPress={() => setStep(2)}
              backgroundColor={colors.secondary}
              width={"45%"}
            />
            <Button1
              text={lang.save}
              onPress={onSavePress}
              backgroundColor={colors.primary}
              width={"45%"}
            //disabled={checkingUsername} // optional - depends on Button1 props
            />
          </View>
        )}
      </View>
      {/* Add Schedule Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={addScheduleModalVisible}
        onRequestClose={() => {
          setAddScheduleModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setAddScheduleModalVisible(true);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.Add_Schedule}</Text>

            <View>
              <ScrollView
                style={{ marginTop: 8, maxHeight: 420 }}
                keyboardShouldPersistTaps="handled"
              >
                <View
                  ref={(r) => {
                    branchInputWrapperRef.current = r;
                  }}
                  onLayout={onBranchLayout}
                >
                  <InputBox
                    label={lang.branch}
                    placeholder={""}
                    value={selectedBranch}
                    editable={false}
                    setValue={() => { }}
                    rightIcon={require("../../../../assets/icons/branch_b.png")}
                    rightIconStyle={{ tintColor: colors.primary }}
                  />
                </View>

                <InputBox
                  label={lang.set_time_from}
                  placeholder={"00:00:00"}
                  value={timeFrom}
                  setValue={(v: string) => {
                    setTimeFrom(v);
                    const ok = /^(\d{2}):(\d{2}):(\d{2})$/.test(v);
                    if (ok) setTimeFromError("");
                  }}
                  rightIcon={require("../../../../assets/icons/clock_b.png")}
                  errorMessage={timeFromError}
                  rightIconStyle={{ tintColor: colors.primary }}
                  onRightIconPress={onShowNativeTimePicker}
                  onPress={onShowNativeTimePicker}
                />

                <InputBox
                  label={lang.Duration}
                  placeholder={"Eg: 8"}
                  value={durationHours}
                  setValue={(v: string) => {
                    setDurationHours(v.replace(/[^0-9.]/g, ""));
                    setDurationError("");
                  }}
                  errorMessage={durationError}
                  rightIconStyle={{ tintColor: colors.primary }}
                  keyboardType="numeric"
                />
                <View style={{ height: 18 }} />
                <Button1
                  text={lang.Add}
                  width={"100%"}
                  onPress={onAddSchedule}
                />
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Pressable>
      </Modal>
      {/* Native Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={timeStringToDate(timeFrom)}
          mode="time"
          is24Hour={true}
          display={Platform.OS === "ios" ? "spinner" : "clock"}
          onChange={onNativeTimeChange}
        />
      )}
    </View>
  );
};
export default AddStaffScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  content: { paddingHorizontal: 20, paddingBottom: 80 },
  contentBox: {
    marginBottom: 20,
  },
  dayContainer: {
    flexDirection: "row",
  },
  profileImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 60,
    resizeMode: "contain",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  image: { width: 100, height: 100, borderRadius: 60 },
  addprofile: {
    marginTop: 24,
  },
  addPhoto: {
    fontSize: fonts.size.xs,
    fontWeight: fonts.weight.regular,
    fontFamily: fonts.family.regular,
    color: colors.primary,
    minHeight: 12,
  },
  progressWrap: {
    flexDirection: "row",
    height: 10,
    width: "100%",
    marginTop: 20,
    marginBottom: 20,
    gap: 20,
  },
  progressLine: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 10,
  },
  fixedNext: {
    padding: 16,
    backgroundColor: colors.secondary,
  },
  title: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
    fontFamily: fonts.family.regular,
    color: colors.search,
    minHeight: 14,
  },
  step2Buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  logout: { flexDirection: "row" },
  logoutIcon: { width: 17, height: 17, marginRight: 8, resizeMode: "contain" },
  logoutText: {
    fontSize: fonts.size.m,
    color: colors.logout_text,
    fontWeight: fonts.weight.medium,
  },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContainer: {
    backgroundColor: colors.secondary,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 1.5,
    elevation: 4,
  },
  modalHandle: {
    width: 40,
    height: 6,
    backgroundColor: colors.modal_line,
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.medium,
    textAlign: "center",
    marginBottom: 19,
    lineHeight: 22,
  },
  modalButton: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalButtonText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
    textAlign: "center",
    fontFamily: fonts.family.regular,
  },
  each_day: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 20,
    alignItems: "center",
  },
  day: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    marginRight: 10,
    paddingTop: 11,
    paddingBottom: 11,
    width: 52,
    alignItems: "center",
  },
  day_text: {
    color: colors.primary,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
  },
  time: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  plus: { width: 16, height: 16 },
  time_text: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
    color: colors.primary,
  },
  clock: { width: 14, height: 14, marginRight: 4 },
});
