// screens/admin/main/HomeScreen_A.tsx
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import { useNavigation, useRoute, useIsFocused, NavigationProp, RouteProp } from "@react-navigation/native";
import { getUserById, getUsers, ProfileUser } from "../../../api/profile";
import { getSchedulesForDate, ScheduleItem } from "../../../api/schedules";
import { getAttendanceAllHistory, AttendanceHistoryItem, forceCheckout } from "../../../api/attendanceAllHistory";
import { getBranchById } from "../../../api/Branchs";
import Popup from "../../../components/Popup";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import { NotificationServiceInstance, subscribeNotifications } from "../../../api/notification/NotificationService";

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// convert hh:mm -> minutes
const hhmmToMinutes = (hhmm: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(x => parseInt(x || '0', 10));
  return (h || 0) * 60 + (m || 0);
};
// convert "YYYY-MM-DD HH:mm:ss" -> minutes from midnight for that datetime
const datetimeToMinutes = (datetime: string) => {
  if (!datetime) return 0;
  const parts = datetime.split(' ');
  if (parts.length < 2) return 0;
  const time = parts[1].split(':');
  const h = parseInt(time[0] || '0', 10);
  const m = parseInt(time[1] || '0', 10);
  return (h || 0) * 60 + (m || 0);
};

const formatMinutesDiff = (mins: number) => {
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad2(h)}h ${pad2(m)}m`;
};

const formatTime12 = (t: string) => {
  if (!t) return "";
  let hh = 0;
  let mm = "00";
  if (t.includes(' ')) {
    const timePart = t.split(' ')[1];
    const [h, m] = timePart.split(':');
    hh = parseInt(h || "0", 10);
    mm = m || "00";
  } else {
    const [h, m] = t.split(':');
    hh = parseInt(h || "0", 10);
    mm = m || "00";
  }
  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${ampm}`;
};
const timeStringToDate = (timeStr: string) => {
  const now = new Date();
  now.setSeconds(0, 0);
  if (!timeStr) return now;
  const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
  now.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
  return now;
};

// normalize a time string to "HH:MM" (handles "HH:MM:SS" or "H:M")
const normalizeToHHMM = (t?: string) => {
  if (!t) return "";
  const parts = t.split(":").map(p => parseInt(p || "0", 10));
  const hh = pad2(parts[0] ?? 0);
  const mm = pad2(parts[1] ?? 0);
  return `${hh}:${mm}`;
};

// convert "HH:MM" to minutes-from-midnight
const hhmmToMinutesStrict = (hhmm: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(x => parseInt(x || "0", 10));
  return (h || 0) * 60 + (m || 0);
};

const formatYMDDisplay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
};

const formatYMD = (d: Date): string => {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayDate = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const yesterdayDate = (() => {
  const d = new Date(todayDate);
  d.setDate(d.getDate() - 1);
  return d;
})();
const yesterdayYMD = formatYMD(yesterdayDate);

const parseAttendanceDatetime = (s: string | undefined | null): Date | null => {
  if (!s) return null;
  const iso = s.replace(' ', 'T');
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

// ============================================================
// Type Definitions
// ============================================================

type LangId = "en" | "de";

type HomeScreenRouteParams = {
  userId?: string;
  id?: string;
  langId?: LangId;
  language?: string;
  branchId?: string | null;
};

type RootStackParamList = {
  HomeScreen: HomeScreenRouteParams;
  NotificationScreen: {
    userId?: string;
    langId?: string;
    branchId?: string | null;
  };
};

type KeyboardEvent = {
  endCoordinates: {
    height?: number;
  };
};

type ErrorWithMessage = {
  message?: string;
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface ScreenProps {
  userId: string;
  langId: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  routeRefresh?: boolean;
  onConsumedRefresh?: () => void;
  toastMessage?: string;
  onConsumedToast?: () => void;
  branch?: string;
  createdUser?: string;
}

const HomeScreen_A: React.FC<ScreenProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "HomeScreen">>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId;
  const routeLangId = route.params?.langId;
  const userId = propUserId || routeUserId;
  const langId = (propLangId || routeLangId || "en") as LangId;
  const langKey = langId as keyof typeof translations;
  const lang = translations[langKey] || translations["en"];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [version, setVersion] = useState<number>(0);

  const passedBranchId = route.params?.branchId ?? null;

  const [activeBranchId, setActiveBranchId] = useState<string | null>(passedBranchId || null);

  // schedules & users (previously used)
  const [schedulesState, setSchedulesState] = useState<ScheduleItem[]>([]);
  const [usersState, setUsersState] = useState<ProfileUser[]>([]);
  const [loadingShiftData, setLoadingShiftData] = useState<boolean>(false);

  // Modal / checkout state
  const [forceCheckoutModalVisible, setForceCheckoutModalVisible] = useState<boolean>(false);
  /**
 * When opening the Force Checkout modal we store the attendance record
 * plus the resolved user profile (if available) so the modal always
 * has fullname/username regardless of the raw attendance.user shape.
 */
  type CheckoutTarget = AttendanceHistoryItem & {
    userProfile?: { fullname?: string; username?: string };
    schedule?: ScheduleItem | null;
  };
  const [checkoutTargetAttendance, setCheckoutTargetAttendance] = useState<CheckoutTarget | null>(null);

  const [checkoutTime, setCheckoutTime] = useState<string>(""); // "HH:MM"
  const [checkoutTimeError, setCheckoutTimeError] = useState<string>("");
  const [confirmPopupVisible, setConfirmPopupVisible] = useState<boolean>(false);
  const [confirmSubmitting, setConfirmSubmitting] = useState<boolean>(false);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  const shouldShowForceCheckoutButton = (
    attendance: AttendanceHistoryItem,
    schedule?: ScheduleItem | null
  ): boolean => {
    if (!attendance || attendance.Out) return false;
    if (!schedule || !schedule.date || !schedule.end_time) return false;

    const schedDate = new Date(schedule.date);
    const [eh, em] = schedule.end_time.split(':').map((x) => parseInt(x || '0', 10));
    schedDate.setHours(eh, em, 0, 0);
    return Date.now() >= schedDate.getTime();
  };

  const openForceCheckoutModal = (
    attendance: AttendanceHistoryItem,
    schedule?: ScheduleItem | null,
    userProfile?: { fullname?: string; username?: string } | null
  ) => {
    // store schedule and userProfile with the attendance so modal validations can access schedule.end_time
    const merged: CheckoutTarget = {
      ...(attendance),
      userProfile: userProfile ?? undefined,
      schedule: schedule ?? null,
    };

    // set default checkout time to schedule end time (normalized to HH:MM) if available
    const defaultTime = normalizeToHHMM(schedule?.end_time ?? "");
    setCheckoutTargetAttendance(merged);
    setCheckoutTime(defaultTime);
    // set timeFrom for the native picker using "HH:MM:00"
    setTimeFrom(defaultTime ? `${defaultTime}:00` : "");
    setCheckoutTimeError("");
    setForceCheckoutModalVisible(true);
  };

  const setCheckoutTimeSafe = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    let hh = "";
    let mm = "";
    if (digits.length > 0) {
      hh = digits.slice(0, 2);
      if (hh && parseInt(hh, 10) > 23) hh = "23";
    }
    if (digits.length > 2) {
      mm = digits.slice(2, 4);
      if (mm && parseInt(mm, 10) > 59) mm = "59";
    }
    const formatted = hh + (mm ? ":" + mm : "");
    setCheckoutTime(formatted);

    const valid = /^([01]?\d|2[0-3]):([0-5]\d)$/.test(formatted);
    setCheckoutTimeError(valid ? "" : lang.Invalid_time);
  };

  const handleSaveForceCheckout = async () => {
    if (!checkoutTargetAttendance) return;

    // guard — (should be already validated by showConfirmDialog, but keep safety)
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(checkoutTime)) {
      setCheckoutTimeError(lang.Invalid_time);
      return;
    }

    setConfirmSubmitting(true);
    try {
      // Build local Date for the attendance In date + provided time
      const inDatePart = checkoutTargetAttendance.In.split(" ")[0]; // "YYYY-MM-DD"
      const [y, m, d] = inDatePart.split("-").map(s => parseInt(s || "0", 10));
      const [hhStr, mmStr] = checkoutTime.split(":");
      const ch = parseInt(hhStr || "0", 10);
      const cm = parseInt(mmStr || "0", 10);
      const checkoutLocal = new Date(y, (m || 1) - 1, d || 1, ch, cm, 0, 0);

      // Additional safety checks (schedule / check-in)
      const scheduleEndHHMM = checkoutTargetAttendance.schedule ? normalizeToHHMM(checkoutTargetAttendance.schedule.end_time ?? "") : null;
      if (scheduleEndHHMM) {
        const schedMin = hhmmToMinutesStrict(scheduleEndHHMM);
        const checkoutMin = hhmmToMinutesStrict(checkoutTime);
        if (checkoutMin < schedMin) {
          showErrorToast(`${lang.Checkout_cannot_be_earlier_than_scheduled_end} (${formatTime12(scheduleEndHHMM)})`);
          setConfirmSubmitting(false);
          return;
        }
      }
      const checkinDt = parseAttendanceDatetime(checkoutTargetAttendance.In);
      if (checkinDt && checkoutLocal.getTime() < checkinDt.getTime()) {
        setCheckoutTimeError(lang.Checkout_cannot_be_before_checkin);
        setConfirmSubmitting(false);
        return;
      }

      const checkoutIso = checkoutLocal.toISOString();

      await forceCheckout(checkoutTargetAttendance.id ?? checkoutTargetAttendance._id, checkoutIso);
      // success
      setConfirmPopupVisible(false);
      setForceCheckoutModalVisible(false);
      setCheckoutTargetAttendance(null);
      setCheckoutTime("");
      await fetchAttendanceAndEnrich(activeBranchId);
      await fetchShiftData(activeBranchId);

      showSuccessToast(lang.Checked_out_successfully);
    } catch (err: unknown) {
      const error = err as ErrorWithMessage;
      console.warn("force checkout failed", error);
      showErrorToast(lang.Checkout_failed_Try_again);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  // recent checkins from attendance API (already enriched)
  type RecentCheckinItem = {
    attendance: AttendanceHistoryItem;
    userProfile: { fullname: string; username: string } | null;
    schedule?: ScheduleItem | null;
    status: "early" | "late" | "ontime" | "noschedule";
    diffText: string;
    branchNameToShow?: string | null;
  };
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckinItem[]>([]);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setVersion((v) => v + 1);
    setRefreshing(false);
  };

  /**
   * Load schedules for today + yesterday for the given branchId.
   * Caches result briefly to reduce API calls while polling.
   *
   * - Uses getSchedulesForDate(dateYMD, { branchId })
   * - Merges and deduplicates schedules by _id
   */
  const loadSchedulesForBranchWithCache = async (branchIdToUse: string | null): Promise<ScheduleItem[]> => {
    if (!branchIdToUse) return [];

    // Fetch today's and yesterday's schedules fresh every time
    const [todaySchedules, yesterdaySchedules] = await Promise.all([
      getSchedulesForDate(todayYMD, { branchId: branchIdToUse }),
      getSchedulesForDate(yesterdayYMD, { branchId: branchIdToUse }),
    ]);

    const merged = [...(todaySchedules ?? []), ...(yesterdaySchedules ?? [])];

    // dedupe by _id or id
    const dedupe = new Map<string, ScheduleItem>();
    merged.forEach((s) => {
      const key = s._id;
      dedupe.set(String(key), s);
    });
    return Array.from(dedupe.values());
  };

  const fetchShiftData = async (branchIdToUse: string | null): Promise<void> => {
    if (!branchIdToUse) {
      setSchedulesState([]);
      setUsersState([]);
      return;
    }

    setLoadingShiftData(true);
    try {
      const [schedules, users] = await Promise.all([
        loadSchedulesForBranchWithCache(branchIdToUse),
        getUsers({ limit: 1000 }),
      ]);
      setSchedulesState(schedules);
      setUsersState(users ?? []);
    } catch (err: unknown) {
      const error = err as ErrorWithMessage;
      console.warn('fetchShiftData failed', error);
      setSchedulesState([]);
      setUsersState([]);
    } finally {
      setLoadingShiftData(false);
    }
  };
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeFrom, setTimeFrom] = useState<string>("");
  const onShowNativeTimePicker = () => { setShowTimePicker(true); };
  const onNativeTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(false);
    if (!selected) return;
    const hh = pad2(selected.getHours());
    const mm = pad2(selected.getMinutes());
    const formatted = `${hh}:${mm}`;
    setCheckoutTime(formatted);
    setTimeFrom(`${formatted}:00`);
  };

  const showConfirmDialog = () => {
    try {
      if (!checkoutTargetAttendance) return;

      // 1) basic format check
      if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(checkoutTime)) {
        setCheckoutTimeError(lang.Invalid_time);
        return;
      }

      // 2) schedule end check (if schedule exists)
      const scheduleEndHHMM = checkoutTargetAttendance.schedule
        ? normalizeToHHMM(checkoutTargetAttendance.schedule.end_time ?? "")
        : null;
      if (scheduleEndHHMM) {
        const schedMin = hhmmToMinutesStrict(scheduleEndHHMM);
        const checkoutMin = hhmmToMinutesStrict(checkoutTime);
        if (checkoutMin < schedMin) {
          setCheckoutTimeError(`${lang.Checkout_cannot_be_earlier_than_scheduled_end} (${formatTime12(scheduleEndHHMM)})`);
          return;
        }
      }

      // 3) not before check-in
      const inStr = checkoutTargetAttendance.In ?? "";
      const checkinDt = parseAttendanceDatetime(inStr);
      if (inStr && checkinDt) {
        const inDatePart = inStr.split(" ")[0];
        const [y, m, d] = inDatePart.split("-").map(s => parseInt(s || "0", 10));
        const [hh, mm] = checkoutTime.split(":").map(s => parseInt(s || "0", 10));
        const checkoutLocal = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
        if (checkoutLocal.getTime() < checkinDt.getTime()) {
          setCheckoutTimeError(lang.Checkout_cannot_be_before_checkin);
          return;
        }
      }

      // passed validation — clear error and show popup
      setCheckoutTimeError("");
      setForceCheckoutModalVisible(false);
      setTimeout(() => { setConfirmPopupVisible(true); }, 350);
    } catch (err: unknown) {
      const error = err as ErrorWithMessage;
      console.warn("showConfirmDialog validation error", error);
      setCheckoutTimeError(lang.Invalid_time);
    }
  };

  //To calculate total staff count (For the current branch, Today date schedule)
  const TotalstaffCount = useMemo(() => {
    if (!Array.isArray(schedulesState) || schedulesState.length === 0 || !activeBranchId) return 0;

    const pad2Local = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMDLocal = (d: Date) =>
      `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;

    const uniqueEmpIds = new Set<string>();

    schedulesState.forEach((s) => {
      if (!s.date) return;

      const sDate = new Date(s.date);
      const sYMD = toYMDLocal(sDate);

      // branch id can be object or string
      let branchIdOfSchedule = null;
      if (s.branch_id && typeof s.branch_id === 'object' && '_id' in s.branch_id) {
        branchIdOfSchedule = (s.branch_id)._id;
      } else if (typeof s.branch_id === 'string') {
        branchIdOfSchedule = s.branch_id;
      }

      if (sYMD === todayYMD && branchIdOfSchedule && String(branchIdOfSchedule) === String(activeBranchId)) {
        // employee_id may be object or string
        let empId = null;
        if (s.employee_id && typeof s.employee_id === 'object' && '_id' in s.employee_id) {
          empId = (s.employee_id)._id;
        } else if (typeof s.employee_id === 'string') {
          empId = s.employee_id;
        }
        if (empId) uniqueEmpIds.add(String(empId));
      }
    });

    const count = uniqueEmpIds.size;
    console.log('TotalstaffCount for branch', activeBranchId, 'on', todayYMD, '=', count);
    return count;
  }, [schedulesState, todayYMD, activeBranchId]);

  /**
   * Enrich attendance records for display.
   *
   * Rules:
   * - Include attendance that belongs to branchIdToUse
   * - Include:
   *    * check-ins from today (In YMD === todayYMD) where In <= now
   *    * check-ins from yesterday (In YMD === yesterdayYMD) only when Out is missing (ongoing cross-day)
   * - For schedule lookup: match schedule.date === the YMD of the In time (yesterday or today)
   * - Cache attendance briefly to reduce repeated API calls during polling
   */
  const fetchAttendanceAndEnrich = async (branchIdToUse: string | null): Promise<void> => {
    if (!branchIdToUse) {
      setRecentCheckins([]);
      return;
    }
    try {
      const all = await getAttendanceAllHistory();

      const now = new Date();

      const filtered = (all || []).filter((record) => {
        // branch id normalization
        const recordBranchId = record.branch_id ?? null;

        if (!recordBranchId) return false;
        if (String(recordBranchId) !== String(branchIdToUse)) return false;
        if (!record.In) return false;

        const inDt = parseAttendanceDatetime(record.In);
        if (!inDt) return false;

        const inYMD = formatYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate()));

        // include today's check-ins (up to now)
        if (inYMD === todayYMD) {
          return inDt.getTime() <= now.getTime();
        }
        // include yesterday's check-ins only if Out is missing (ongoing cross-day)
        if (inYMD === yesterdayYMD && !record.Out) {
          return true;
        }
        return false;
      });

      filtered.sort((a, b) => (a.In < b.In ? 1 : -1));

      const enriched = await Promise.all(
        filtered.map(async (att) => {
          const uid = att.user.id;
          let userProfile: ProfileUser | null = usersState.find((u) => String((u)._id) === String(uid)) ?? null;

          if (!userProfile && uid) {
            try {
              const fetched = await getUserById(String(uid));
              userProfile = fetched ?? null;
            } catch {
              userProfile = null;
            }
          }

          // choose schedule date based on In YMD (yesterday or today)
          const inDt = parseAttendanceDatetime(att.In);
          const inYMD = inDt ? formatYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate())) : todayYMD;

          const schedule = schedulesState.find((s) => {
            let empId: string | null = null;
            if (s.employee_id && typeof s.employee_id === 'object' && '_id' in s.employee_id) {
              empId = s.employee_id._id ?? null;
            } else if (!empId || !uid) return false;
            const sDate = s.date ? formatYMD(new Date(s.date)) : null;
            return String(empId) === String(uid) && sDate === inYMD;
          }) ?? null;

          // compute duration & status (same logic, but safe)
          let status: "early" | "late" | "ontime" | "noschedule" = "noschedule";
          let diffText = formatMinutesDiff(0);

          try {
            const inDtLocal = parseAttendanceDatetime(att.In);
            const outDtLocal = parseAttendanceDatetime(att.Out ?? undefined);
            if (inDtLocal) {
              const endDt = outDtLocal ?? new Date();
              const durationMins = Math.max(0, Math.round((endDt.getTime() - inDtLocal.getTime()) / 60000));
              diffText = formatMinutesDiff(durationMins);
            }

            if (schedule && schedule.start_time && att.In) {
              const schedMin = hhmmToMinutes(schedule.start_time);
              const inMin = datetimeToMinutes(att.In);
              if (!Number.isNaN(schedMin) && !Number.isNaN(inMin)) {
                const startDiff = inMin - schedMin;
                if (startDiff > 0) status = "late";
                else if (startDiff === 0) status = "ontime";
                else status = "early";
              }
            }
          } catch (err: unknown) {
            const error = err as ErrorWithMessage;
            console.warn('compute status error', error);
            status = "noschedule";
          }

          // branchNameToShow logic 
          let branchNameToShow: string | null = null;
          try {
            if (userProfile) {
              let userBranchId: string | null = null;
              if (typeof userProfile.branch === 'string') {
                userBranchId = userProfile.branch;
              } else if (userProfile.branch && typeof userProfile.branch === 'object') {
                const branchObj = userProfile.branch as { _id?: string; id?: string; name?: string };
                userBranchId = branchObj._id ?? branchObj.id ?? null;
                const userBranchName = branchObj.name ?? null;
                if (userBranchId && String(userBranchId) !== String(branchIdToUse ?? activeBranchId)) {
                  branchNameToShow = userBranchName || (await getBranchById(userBranchId)).name || null;
                }
              }
            } else if (att.branch_id) {
              const b = await getBranchById(att.branch_id);
              if (b) {
                const userBranchId = b._id;
                if (userBranchId && String(userBranchId) !== String(branchIdToUse ?? activeBranchId)) {
                  branchNameToShow = b.name || null;
                }
              }
            }
          } catch (err: unknown) {
            const error = err as ErrorWithMessage;
            console.warn('branchNameToShow lookup failed', error);
            branchNameToShow = null;
          }

          // Transform userProfile to match expected type
          const transformedUserProfile: { fullname: string; username: string } | null = userProfile
            ? { fullname: userProfile.fullname, username: userProfile.username }
            : null;

          return {
            attendance: att,
            userProfile: transformedUserProfile,
            schedule,
            status,
            diffText,
            branchNameToShow,
          };
        })
      );

      setRecentCheckins(enriched);
    } catch (err: unknown) {
      const error = err as ErrorWithMessage;
      console.warn('fetchAttendanceAndEnrich failed', error);
      setRecentCheckins([]);
    }
  };
  const isFocused = useIsFocused();

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height || 0);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!activeBranchId || !isFocused) return;
    // immediate refresh when screen becomes focused
    fetchShiftData(activeBranchId);
    void fetchAttendanceAndEnrich(activeBranchId);

    // poll attendance only (keeps UI live while screen open)
    const pollMs = 60 * 1000; // 60s - adjust as needed
    const interval = setInterval(() => {
      void fetchAttendanceAndEnrich(activeBranchId);
    }, pollMs);

    return () => {
      clearInterval(interval);
    };
  }, [activeBranchId, isFocused, version]);

  // initial & deps
  useEffect(() => {
    if (!userId) {
      console.log("No userId found in params");
      return;
    }
    // don’t overwrite if already set
    if (activeBranchId) {
      console.log("activeBranchId already set:", activeBranchId);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        console.log("🔍 Fetching user by ID:", userId);
        const u = await getUserById(userId);
        if (!mounted || !u) {
          console.log("User not found or unmounted");
          return;
        }
        const branchField = u.branch;
        const branchId = typeof branchField === "string" ? branchField : (branchField && typeof branchField === "object" ?
          (branchField as { _id?: string })._id ?? null : null);

        const branchName = branchField && typeof branchField === "object" ? (branchField as { name: string }).name ?? null : null;

        console.log("User branch data:", branchField);
        console.log("Extracted branchId:", branchId);
        console.log("Extracted branchName:", branchName);

        if (branchId) {
          setActiveBranchId(String(branchId));
          console.log("activeBranchId set to:", branchId);
        } else {
          console.log("No branchId found for user");
        }
      } catch (err: unknown) {
        const error = err as ErrorWithMessage;
        console.warn("Failed to load branch from userId", error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, activeBranchId]);

  useEffect(() => {
    fetchShiftData(activeBranchId);
  }, [activeBranchId, version]);

  useEffect(() => {
    void fetchAttendanceAndEnrich(activeBranchId);
  }, [activeBranchId, version, schedulesState, usersState]);

  // this is to show the notification
  const [unreadCount, setUnreadCount] = useState<number>(0);
  useEffect(() => {
    if (!userId) return;
    // pass branch id so service listens to both personal + branch inbox
    NotificationServiceInstance.start(userId, activeBranchId ?? null)
      .catch((e) => console.warn('[AdminHome] notif start failed', e));
    const unsub = subscribeNotifications((_items, uc) => {
      setUnreadCount(uc);
    });
    return () => {
      try { unsub(); } catch (e) { /* ignore */ }
    };
  }, [userId, activeBranchId]);

  const handleNotificationPress = () => {
    console.log('Header notification pressed — params:', { userId, langId, activeBranchId });
    (navigation.navigate)("NotificationScreen", { userId, langId, branchId: activeBranchId });
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.timeTrack, color: colors.text }}
        right={{
          type: "image",
          url: unreadCount > 0
            ? require("../../../assets/icons/notification_active.png")
            : require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: handleNotificationPress,
        }}
      />

      <View style={styles.body}>
        <View style={styles.boxes}>
          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image source={require("../../../assets/icons/totalstaff_b.png")} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
            </View>
            <Text style={styles.total_count}>{loadingShiftData ? "..." : TotalstaffCount}</Text>
          </CartBox>

          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image source={require("../../../assets/icons/staff_tik_g.png")} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
            </View>

            <Text style={styles.shift_count}>{loadingShiftData ? "..." : String(recentCheckins.length)}</Text>

          </CartBox>
        </View>

        <Text style={styles.heading}>{lang.recent_check_ins}</Text>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: '15%' }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.details}>
            {loadingShiftData ? (
              <View style={{ justifyContent: 'center', alignItems: 'center', marginTop: "40%" }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : recentCheckins.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 20 * base }}>
                <Text style={{ textAlign: 'center', color: colors.subtext }}>
                  {lang.no_recent_checkins}
                </Text>
              </View>
            ) : (
              // Loaded and has data: show the check-ins
              recentCheckins.map(({ attendance, userProfile, schedule, status, diffText, branchNameToShow }) => {
                const displayName = userProfile?.fullname ?? userProfile?.username ?? 'Unknown';
                const startTime = schedule?.start_time ? formatTime12(schedule.start_time) : "-";
                const endTime = schedule?.end_time ? formatTime12(schedule.end_time) : "";
                const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;

                const dateDisplay = formatYMDDisplay(attendance.In.split(' ')[0]);

                return (
                  <CartBox key={attendance.id} containerStyle={styles.detail_cartbox}>
                    {branchNameToShow && (
                      <View style={styles.branchHeader}>
                        <Image
                          source={require("../../../assets/icons/branch.png")}
                          style={styles.branchIcon}
                          resizeMode="contain"
                        />
                        <Text style={styles.branchName} numberOfLines={1} ellipsizeMode="tail">
                          {branchNameToShow}
                        </Text>
                      </View>
                    )}

                    <View style={styles.profileRow}>
                      <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />

                      <View style={styles.middleRightContainer}>
                        <View style={styles.name_position}>
                          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
                          <Text style={styles.time} numberOfLines={1} ellipsizeMode="tail">{timeStr}</Text>
                          <Text style={styles.time} numberOfLines={1} ellipsizeMode="tail">{dateDisplay}</Text>
                        </View>

                        <View style={styles.statusInline}>
                          {status === "late" ? (
                            <Text style={styles.status_late} numberOfLines={1} ellipsizeMode="tail">{lang.late}</Text>
                          ) : status === "early" || status === "ontime" ? (
                            <Text style={styles.status_early} numberOfLines={1} ellipsizeMode="tail">
                              {status === "ontime" ? (lang.on_time) : lang.early}
                            </Text>
                          ) : (
                            <Text style={styles.status_noschedule} numberOfLines={1} ellipsizeMode="tail">{lang.no_schedule}</Text>
                          )}

                          {status !== "noschedule" &&
                            <Text style={styles.duration} numberOfLines={1} ellipsizeMode="tail">{diffText}</Text>}
                        </View>
                      </View>
                    </View>
                    {shouldShowForceCheckoutButton(attendance, schedule) && (
                      <Button1
                        text={lang.Check_out}
                        textStyle={{ color: colors.primary, paddingVertical: 10, fontSize: fonts.size.l, fontWeight: fonts.weight.medium }}
                        backgroundColor={colors.secondary}
                        containerStyle={{ borderColor: colors.primary, borderWidth: 1, borderRadius: 12, width: '100%', marginTop: 10 }}
                        onPress={() => { openForceCheckoutModal(attendance, schedule, userProfile); }}
                      />
                    )}
                  </CartBox>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
      {/* Force checkout modal */}
      <Modal
        visible={forceCheckoutModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setForceCheckoutModalVisible(false); }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => { setForceCheckoutModalVisible(false); }}
          pointerEvents="auto"
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, justifyContent: "flex-end" }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); }}>
              <View
                style={[
                  styles.modalContainer,
                  Platform.OS === "android" ? { marginBottom: keyboardHeight || 0 } : {},
                ]}
              >
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  {lang.Check_out} - {checkoutTargetAttendance?.user.fullname}
                </Text>

                <Text style={[styles.name, { marginBottom: 16 }]}>
                  {lang.Checked_in}:{" "}
                  {checkoutTargetAttendance
                    ? formatYMDDisplay(checkoutTargetAttendance.In.split(" ")[0])
                    : ""}, {" "}
                  {checkoutTargetAttendance
                    ? formatTime12(checkoutTargetAttendance.In.split(" ")[1])
                    : ""}
                </Text>
                <InputBox
                  label={lang.Check_out_time}
                  placeholder="HH:MM"
                  value={checkoutTime}
                  setValue={(v: string) => { setCheckoutTimeSafe(v); }}
                  keyboardType="numeric"
                  maxLength={5}
                  rightIcon={require("../../../assets/icons/clock_b.png")}
                  errorMessage={checkoutTimeError}
                  onRightIconPress={onShowNativeTimePicker}
                />
                <View style={{ marginTop: 51 }}>
                  <Button1
                    text={lang.Confirm_check_out}
                    backgroundColor={colors.primary}
                    width={"100%"}
                    textStyle={{ color: colors.secondary }}
                    onPress={showConfirmDialog}
                  />
                </View>
              </View>

            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
      {/* Confirm popup */}
      <Popup
        visible={confirmPopupVisible}
        onClose={() => { setConfirmPopupVisible(false); }}
        popupBorderColor={colors.primary}
        dismissOnOverlayPress={false}
        title={`${lang.Confirm_checkout_for} ${checkoutTargetAttendance?.userProfile?.fullname} ? ${lang.This_action_will_be_recorded}`}
        titleStyle={{ color: colors.primary, marginBottom: 20 }}
      >
        {/* Small loading indicator BETWEEN title and buttons */}
        {confirmSubmitting && (
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {/* Buttons row — guard onPress so disabled prop is not required */}
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}
          // prevent touches while submitting (extra safety)
          pointerEvents={confirmSubmitting ? "none" : "auto"}
        >
          <View style={{ width: "48%" }}>
            <Button1
              text={lang.yes}
              backgroundColor={colors.primary}
              width={"100%"}
              textStyle={{ color: colors.secondary }}
              onPress={() => {
                if (confirmSubmitting) return;
                void handleSaveForceCheckout();
              }}
            />
          </View>

          <View style={{ width: "48%" }}>
            <Button1
              text={lang.no}
              onPress={() => {
                if (confirmSubmitting) return;
                setConfirmPopupVisible(false);
              }}
              backgroundColor={colors.error_text}
              width={"100%"}
              textStyle={{ color: colors.secondary }}
            />
          </View>
        </View>
      </Popup>

      {showTimePicker && (
        <DateTimePicker
          value={timeStringToDate(timeFrom)}
          mode="time"
          is24Hour={true}
          display={Platform.OS === "ios" ? "spinner" : "clock"}
          onChange={onNativeTimeChange}
        />
      )}
      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  body: {
    flex: 1,
    marginTop: 20,
    marginHorizontal: 20,
  },
  boxes: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  details: {
  },
  detail_cartbox: {
    width: "100%",
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  profileImage: { width: 38 * base, height: 38, borderRadius: 20, resizeMode: "cover" },
  name_position: { marginLeft: 10, width: "55%", },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, color: colors.text, },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 8, fontWeight: fonts.weight.regular, },
  status_early: {
    fontWeight: fonts.weight.regular,
    color: colors.status_early,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_early_bg,
    borderRadius: 10,
    textAlign: "center",
    marginRight: 8
  },
  status_late: {
    fontWeight: fonts.weight.regular,
    color: colors.status_late,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_late_bg,
    borderRadius: 8,
    textAlign: "center",
    marginRight: 8
  },
  status_noschedule: {
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 8,
    textAlign: "center",
    width: 55 * base,
  },
  heading: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
    marginBottom: 12,
    marginTop: 20,
  },
  staff: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border1,
    width: 190 * base,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    alignItems: "flex-start",
  },
  icon: {
    width: 30 * base,
    height: 30,
  },
  total_staff: {
    color: colors.search,
    fontWeight: fonts.weight.regular,
    fontSize: 14,
    marginLeft: 8,
    width: "75%"
  },
  total_count: {
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.xxl,
    color: colors.primary,
    marginTop: 8,
  },
  shift_count: {
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.xxl,
    color: colors.text,
    marginTop: 8,
  },
  branchHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    width: '90%',
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    alignSelf: "center",
  },
  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  middleRightContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1
  },
  statusInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
    flexShrink: 0,
    width: '45%',
  },
  duration: {
    color: colors.primary,
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.m,
    width: 70,
  },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContainer: {
    backgroundColor: colors.secondary,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 70,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
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
    marginBottom: 20,
  },
});

export default HomeScreen_A;