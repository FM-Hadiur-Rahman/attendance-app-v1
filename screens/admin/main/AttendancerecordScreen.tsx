// screens/admin/main/AttendancerecordScreen.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import colors from "../../../styles/Colors";
import Header from "../../../components/Header";
import DateTimePicker from "@react-native-community/datetimepicker";
import SearchBar from "../../../components/SearchBar";
import { useNavigation, useRoute, NavigationProp, RouteProp } from "@react-navigation/native";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";
import Toast, {
  showErrorToast,
  showSuccessToast,
  toastConfig,
} from "../../../components/Toast";
import {
  getAttendanceReport,
  AttendanceReportItem,
} from "../../../api/checkin_checkout";
import { getBranchId, getProfile, ProfileUser } from "../../../api/profile";
import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { DateTimePickerEvent } from "@react-native-community/datetimepicker";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// --- helpers for parsing/formatting times & dates ---
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// time formatting: accept ISO, "YYYY-MM-DD HH:MM:SS", "HH:MM", "HH:MM:SS", return "h:mm AM/PM"
const formatTimeFromAny = (value?: string | null) => {
  if (!value) return "";
  try {
    const dt = new Date(value);
    if (!isNaN(dt.getTime())) {
      let h = dt.getHours();
      const m = dt.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    }
    // plain HH:MM or HH:MM:SS
    const parts = value.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length >= 2) {
      let h = parts[0];
      const m = parts[1];
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    }
    return value;
  } catch (e) {
    return value;
  }
};

// return minutes since midnight for various formats
const timeToMinutesAny = (value?: string | null) => {
  if (!value) return null;
  try {
    const dt = new Date(value);
    if (!isNaN(dt.getTime())) {
      return dt.getHours() * 60 + dt.getMinutes();
    }
    // plain HH:MM or HH:MM:SS
    const parts = value.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length >= 2) return parts[0] * 60 + parts[1];
  } catch (e) {
    /* ignore */
  }
  return null;
};

const minutesToDurationText = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
};

// convert "YYYY-MM-DD" or date-like into YYYY-MM-DD string
const normalizeDateToYMD = (s?: string | null) => {
  if (!s) return "";
  // if already Y-M-D
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return toYMD(dt);
  return s;
};

// ============================================================
// Type Definitions
// ============================================================

type LangId = "en" | "de";

type BranchLike = {
  _id?: string;
  id?: string;
  name?: string;
  branch_name?: string;
} | string | null;

type CreatedUserLike = {
  _id?: string;
  id?: string;
  username?: string;
  fullname?: string;
  email?: string;
} | null;

type AttendancerecordScreenRouteParams = {
  userId?: string;
  id?: string;
  langId?: LangId;
  language?: string;
  branchId?: string | null;
};

type RootStackParamList = {
  AttendancerecordScreen: AttendancerecordScreenRouteParams;
  NotificationScreen: {
    userId?: string;
    langId?: string;
    branchId?: string | null;
  };
};

type ExtendedAttendanceReportItem = AttendanceReportItem & {
  actual_in?: string | null;
  actual_out?: string | null;
  checkIn?: string | null;
  check_in?: string | null;
  in?: string | null;
  in_time?: string | null;
  branch_id?: string;
  branch_name?: string;
  branch?: BranchLike;
  user?: {
    fullname?: string;
    username?: string;
  };
  name?: string;
  employee_id?: string;
};

type AttendanceApiResponse = 
  | AttendanceReportItem[]
  | { rows: AttendanceReportItem[] }
  | { data: AttendanceReportItem[] }
  | null
  | undefined;

type EnrichedRecord = {
  raw: ExtendedAttendanceReportItem;
  id: string;
  name: string;
  username: string;
  branchId: string;
  branchName: string;
  date: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledStartDisplay: string;
  scheduledEndDisplay: string;
  checkInRaw: string | null;
  checkOutRaw: string | null;
  checkInTime: string;
  checkOutTime: string;
  durationMins: number | null;
  durationText: string;
  diffVsScheduleText: string;
  status: "early" | "late" | "on_time" | "no-schedule";
};

type ErrorWithMessage = {
  message?: string;
  response?: {
    data?: {
      message?: string;
    };
  };
};

// ---------------- component ----------------
interface ScreenProps {
  userId?: string | null;
  langId?: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  routeRefresh?: boolean;
  onConsumedRefresh?: () => void;
  toastMessage?: string | null;
  onConsumedToast?: () => void;
  branch?: BranchLike;
  createdUser?: CreatedUserLike;
}

const AttendancerecordScreen: React.FC<ScreenProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "AttendancerecordScreen">>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = (propLangId || routeLangId || "en") as LangId;
  const langKey = langId as keyof typeof translations;
  const lang = translations[langKey] || translations["en"];

  const [query, setQuery] = useState<string>("");
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
const [loading, setLoading] = useState(true);       // initial load
const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);

  const defaultToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const WEEKDAY_FMT = `${WEEKDAYS[defaultToday.getDay()]}, ${MONTHS[defaultToday.getMonth()]
    } ${defaultToday.getDate()}`;
  const [dateInput, setDateInput] = useState<string>(WEEKDAY_FMT);
  const [dateError, setDateError] = useState<string>("");
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(
    defaultToday
  );
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // main attendance data from server (array of rows)
  const [attendanceData, setAttendanceData] = useState<AttendanceReportItem[]>(
    []
  );

  // selectedRange computation (same logic you had)
  const pad = pad2;
  const dateInputToYMD = (display: string): { ok: boolean; ymd?: string } => {
    // permissive: try parse by Date fallback
    if (!display || display.trim() === "") return { ok: false };
    // attempt to parse by heuristics (reuse a simple parse)
    const cleaned = display.replace(",", "").trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      // try mon day
      const mon = parts[1].slice(0, 3);
      const dayStr = parts[2] ?? parts[1];
      const monIndex = MONTHS.findIndex(
        (m) => m.toLowerCase() === mon.toLowerCase()
      );
      if (monIndex >= 0) {
        const day = parseInt(dayStr, 10);
        if (!isNaN(day)) {
          const year = new Date().getFullYear();
          const dt = new Date(year, monIndex, day);
          if (!isNaN(dt.getTime())) {
            return { ok: true, ymd: toYMD(dt) };
          }
        }
      }
    }
    // fallback to Date parse
    const dt = new Date(display);
    if (!isNaN(dt.getTime())) return { ok: true, ymd: toYMD(dt) };
    return { ok: false };
  };

  const getStartOfWeekSunday = (date: Date) => {
    const day = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  };
  const getEndOfWeekSaturday = (date: Date) => {
    const s = getStartOfWeekSunday(date);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  };

  const selectedRange = useMemo(() => {
    try {
      if (mode === "day") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) return { type: "day" as const, ymd: conv.ymd! };
        if (selectedDateObj)
          return { type: "day" as const, ymd: toYMD(selectedDateObj) };
        return null;
      } else if (mode === "week") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) {
          const [y, m, d] = conv.ymd!.split("-").map((x) => parseInt(x, 10));
          const dt = new Date(y, m - 1, d);
          const s = getStartOfWeekSunday(dt);
          const e = getEndOfWeekSaturday(dt);
          return {
            type: "week" as const,
            startYmd: toYMD(s),
            endYmd: toYMD(e),
          };
        }
        const base = selectedDateObj ?? new Date();
        const s = getStartOfWeekSunday(base);
        const e = getEndOfWeekSaturday(base);
        return { type: "week" as const, startYmd: toYMD(s), endYmd: toYMD(e) };
      } else {
        // month
        const dt = selectedDateObj ?? new Date();
        return {
          type: "month" as const,
          year: dt.getFullYear(),
          monthIndex: dt.getMonth(),
        };
      }
    } catch (e) {
      return null;
    }
  }, [mode, dateInput, selectedDateObj]);

  // ---------- fetch attendance from API ----------
  const fetchAttendanceReport = useCallback(async () => {
    if (!selectedRange) return;

    try {
      setLoading(true);
      setRefreshing(true);

      // --- compute start/end dates ---
      let startDate = "";
      let endDate = "";
      const branchId = currentBranchId || "";

      if (selectedRange.type === "day") {
        startDate = selectedRange.ymd;
        endDate = selectedRange.ymd;
      } else if (selectedRange.type === "week") {
        startDate = selectedRange.startYmd;
        endDate = selectedRange.endYmd;
      } else {
        const year = selectedRange.year;
        const month = selectedRange.monthIndex;
        startDate = `${year}-${pad(month + 1)}-01`;
        endDate = `${year}-${pad(month + 1)}-${pad(
          new Date(year, month + 1, 0).getDate()
        )}`;
      }

      // --- get logged-in profile ---
      const prof = await getProfile(); // current logged-in user
      const loggedInBranchId =
        typeof prof.branch === "string"
          ? prof.branch : null;
      const loggedInUserId = prof._id;
      const userRole = prof.role;

      // save branch id for later comparison in UI
      setCurrentBranchId(loggedInBranchId);

      // --- fetch attendance data ---
      const res = await getAttendanceReport(
        startDate,
        endDate,
        branchId
      );
      const rows: AttendanceReportItem[] = Array.isArray(res) ? res : [];
      const normalized = Array.isArray(rows) ? rows : [];
      const normalizedWithCheckin = normalized.filter((r: ExtendedAttendanceReportItem) => {
        const actualIn =
          r.actualIn ??
          r.actual_in ??
          r.checkIn ??
          r.check_in ??
          r.in ??
          r.in_time ??
          "";
        // keep only rows that have a non-empty check-in value
        return actualIn && String(actualIn).trim() !== "";
      });

      // --- normalize branch info for each record ---
      const enriched = normalizedWithCheckin.map((r: ExtendedAttendanceReportItem) => {
        const rawBranch =
          r.branchId ?? r.branch_id ?? r.branch ?? r.branch_name ?? "";
        let branchIdStr = "";
        let branchNameStr = "";

        if (typeof rawBranch === "string") {
          branchIdStr = rawBranch;
        } else if (rawBranch && typeof rawBranch === "object") {
          const branchObj = rawBranch as { _id?: string; id?: string; name?: string; branch_name?: string };
          branchIdStr = branchObj._id ?? branchObj.id ?? "";
          branchNameStr = branchObj.name ?? branchObj.branch_name ?? "";
        }

        // fallback name fields
        branchNameStr = branchNameStr || r.branchName || r.branch_name || "";

        return {
          ...r,
          branchId: branchIdStr,
          branchName: branchNameStr,
          employeeId: r.employeeId ?? r.employee_id ?? "",
          name: r.user?.fullname ?? r.name ?? "Unknown",
        } as ExtendedAttendanceReportItem;
      });

      // --- filter only logged-in user if not admin ---
      let filtered = enriched;
      if (userRole !== "admin") {
        filtered = enriched.filter(
          (r) =>
            r.employeeId === loggedInUserId
        );
      }

      setAttendanceData(filtered);
    } catch (err: unknown) {
      const error = err as ErrorWithMessage;
      console.error("Failed to load attendance report:", error);
      showErrorToast("Failed to load attendance");
      setAttendanceData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedRange]);

  useEffect(() => {
    void fetchAttendanceReport();
  }, [fetchAttendanceReport]);

  // onRefresh
  const onRefresh = async () => {
    setRefreshing(false);
    await fetchAttendanceReport();
    setRefreshing(false);
  };

  // ---------- transform raw rows into enriched items ----------
  const enriched = useMemo(() => {
    return (attendanceData || []).map((r) => {
      // r likely has:
      // { actualIn, actualOut, branchId, branchName, date, employeeId, endStatus, fullname, scheduledEnd, scheduledStart, startStatus, username }
      const dateYmd = normalizeDateToYMD(r.date ?? r.startStatus ?? "");
      const checkInRaw = r.actualIn && r.actualIn !== "" ? r.actualIn : null;
      const checkOutRaw =
        r.actualOut && r.actualOut !== "" ? r.actualOut : null;
      const scheduledStart = r.scheduledStart ?? "";
      const scheduledEnd = r.scheduledEnd ?? "";
      const startStatus =
        r.startStatus;
      const endStatus = r.endStatus;

      // compute checkIn/checkOut time strings (HH:MM or ISO)
      const checkInTime = checkInRaw ? checkInRaw : null;
      const checkOutTime = checkOutRaw ? checkOutRaw : null;

      // compute display strings
      const displayScheduledStart = scheduledStart
        ? formatTimeFromAny(scheduledStart)
        : "";
      const displayScheduledEnd = scheduledEnd
        ? formatTimeFromAny(scheduledEnd)
        : "";
      const displayCheckIn = checkInTime ? formatTimeFromAny(checkInTime) : "";

          // duration actualOut - actualIn (minutes)
      let durationMins: number | null = null;

      // Parse incoming raw values; if they are full date strings we normalize to ignore seconds.
      const parseDateIgnoreSeconds = (v?: string | null) => {
        if (!v) return null;
        const d = new Date(v);
        if (isNaN(d.getTime())) return null;
        // create new Date with seconds/milliseconds zeroed so seconds won't affect calculations
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
      };

      const inDt = parseDateIgnoreSeconds(checkInRaw);
      const outDt = parseDateIgnoreSeconds(checkOutRaw);

      // Will hold a Date used for display when actualOut is missing (uses "now")
      let checkOutUsedForCalc: Date | null = outDt;

      if (inDt && outDt) {
        // both are full date-times -> simple difference (seconds ignored because we zeroed them)
        durationMins = Math.max(
          0,
          Math.round((outDt.getTime() - inDt.getTime()) / 60000)
        );
      } else {
        // try time-only parsing (HH:MM or HH:MM:SS) — timeToMinutesAny already ignores seconds
        const inMinutes = timeToMinutesAny(checkInRaw);
        const outMinutes = timeToMinutesAny(checkOutRaw);

        if (inMinutes !== null && outMinutes !== null) {
          // both are time-only strings -> difference in minutes (seconds ignored)
          durationMins = Math.max(0, outMinutes - inMinutes);
        } else if (inDt) {
          // check-in is full date but check-out missing/unparsable -> use current time
          const now = new Date();
          // zero seconds for consistency
          const nowRounded = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes(),
            0,
            0
          );
          checkOutUsedForCalc = nowRounded;
          durationMins = Math.max(
            0,
            Math.round((nowRounded.getTime() - inDt.getTime()) / 60000)
          );
        } else if (inMinutes !== null) {
          // check-in is time-only and check-out missing -> use current time-of-day (ignore seconds)
          const now = new Date();
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          durationMins = Math.max(0, nowMinutes - inMinutes);
          // create a pseudo Date for display (seconds=0)
          checkOutUsedForCalc = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes(),
            0,
            0
          );
        } else {
          durationMins = null; // cannot compute
        }
      }

      // compute diffVsScheduleText as duration (format "HHh MMm")
      let diffVsScheduleText = "";
      if (durationMins !== null && durationMins > 0) {
        diffVsScheduleText = minutesToDurationText(durationMins);
      }

      // display check-out: use actualOut if present, otherwise the computed "now" pseudo-checkout
      const displayCheckOut = checkOutRaw
        ? formatTimeFromAny(checkOutRaw)
        : checkOutUsedForCalc
        ? formatTimeFromAny(checkOutUsedForCalc.toISOString())
        : "";

      // status normalized (start status)
      let status = "no-schedule";
      const scheduleMins = scheduledStart
        ? timeToMinutesAny(scheduledStart)
        : null;
      const checkInMins = checkInTime ? timeToMinutesAny(checkInTime) : null;

      if (scheduleMins !== null && checkInMins !== null) {
        if (checkInMins < scheduleMins) status = "early";
        else if (checkInMins > scheduleMins) status = "late";
        else status = "on_time";
      } else if (startStatus && typeof startStatus === "string") {
        const s = startStatus.toLowerCase();
        if (s.includes("early")) status = "early";
        else if (s.includes("late")) status = "late";
        else if (
          s.includes("on") ||
          s.includes("ontime") ||
          s.includes("on_time")
        )
          status = "on_time";
      }

      return {
        raw: r,
        id:
          r.employeeId ??
          Math.random().toString(36).slice(2),
        name: r.fullname ?? r.username ?? "Unknown",
        username: r.username ?? "",
        branchId: r.branchId ?? "",
        branchName: r.branchName ?? "",
        date: dateYmd,
        scheduledStart,
        scheduledEnd,
        scheduledStartDisplay: displayScheduledStart,
        scheduledEndDisplay: displayScheduledEnd,
        checkInRaw,
        checkOutRaw,
        checkInTime: displayCheckIn,
        checkOutTime: displayCheckOut,
        durationMins,
        durationText:
          durationMins !== null ? minutesToDurationText(durationMins) : "",
        diffVsScheduleText,
        status,
      } as EnrichedRecord;
    });
  }, [attendanceData]);

  // determine selected-date range -> filter enriched accordingly
  const todayRecords = useMemo(() => {
    if (!selectedRange) return [];

    // ✅ Step 1: Keep only users who have a real check-in (not empty, not "No Schedule")
    const onlyCheckedIn = enriched.filter((item) => {
      const checkIn = item.checkInRaw || "";
      return checkIn.trim() !== "";
    });

    // ✅ Step 2: Filter by selected range (Day / Week / Month)
    const getRecordDate = (item: EnrichedRecord): Date | null => {
      const d = new Date(item.date);
      return isNaN(d.getTime()) ? null : d;
    };

    if (selectedRange.type === "day") {
      const target = new Date(selectedRange.ymd);
      target.setHours(0, 0, 0, 0);

      return onlyCheckedIn.filter((item) => {
        const d = getRecordDate(item);
        return d && d.toDateString() === target.toDateString();
      });
    }

    if (selectedRange.type === "week") {
      const s = new Date(selectedRange.startYmd);
      const e = new Date(selectedRange.endYmd);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);

      return onlyCheckedIn.filter((item) => {
        const d = getRecordDate(item);
        return d && d >= s && d <= e;
      });
    }

    if (selectedRange.type === "month") {
      return onlyCheckedIn.filter((item) => {
        const d = getRecordDate(item);
        return (
          d &&
          d.getFullYear() === selectedRange.year &&
          d.getMonth() === selectedRange.monthIndex
        );
      });
    }

    // Default fallback (safety)
    return onlyCheckedIn;
  }, [enriched, selectedRange]);

  // search filter (by name/username)
  const displayedRecords = useMemo(() => {
    const q = (query || "").trim().toLowerCase();

    return (
      todayRecords
        // absolute safety: only records with checkInRaw
        .filter((r) => !!r.checkInRaw && String(r.checkInRaw).trim() !== "")
        // also make sure status is not the 'no-schedule' fallback
        .filter((r) => r.status !== "no-schedule")
        // apply search
        .filter(
          (r) =>
            !q ||
            (r.name || "").toLowerCase().includes(q) ||
            (r.username || "").toLowerCase().includes(q)
        )
    );
  }, [todayRecords, query]);

  // UI handlers
  const onShowNativeDatePicker = () => { setShowDatePicker(true); };
  const onNativeDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(0, 0, 0, 0);
      setSelectedDateObj(selectedDate);
      if (mode === "day") {
        const wd = WEEKDAYS[selectedDate.getDay()];
        const mon = MONTHS[selectedDate.getMonth()];
        setDateInput(`${wd}, ${mon} ${selectedDate.getDate()}`);
      } else if (mode === "week") {
        const s = getStartOfWeekSunday(selectedDate);
        const e = getEndOfWeekSaturday(selectedDate);
        setDateInput(
          `${WEEKDAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()} - ${WEEKDAYS[e.getDay()]
          }, ${MONTHS[e.getMonth()]} ${e.getDate()}`
        );
      } else {
        setDateInput(
          `${FULL_MONTHS[selectedDate.getMonth()]
          } ${selectedDate.getFullYear()}`
        );
      }
    }
  };

  const onSelectNow = () => {
    setMode("day");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDateObj(today);
    setDateInput(
      `${WEEKDAYS[today.getDay()]}, ${MONTHS[today.getMonth()]
      } ${today.getDate()}`
    );
  };
  const onSelectWeek = () => {
    setMode("week");
    const dt = selectedDateObj ?? new Date();
    const s = getStartOfWeekSunday(dt);
    const e = getEndOfWeekSaturday(dt);
    setDateInput(
      `${WEEKDAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()} - ${WEEKDAYS[e.getDay()]
      }, ${MONTHS[e.getMonth()]} ${e.getDate()}`
    );
  };
  const onSelectMonth = () => {
    setMode("month");
    const dt = selectedDateObj ?? new Date();
    setDateInput(`${FULL_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`);
  };

  // ✅ Export only checked-in users to Excel
  const onGenerateXLSX = async () => {
    try {
      if (!todayRecords || todayRecords.length === 0) {
        showErrorToast("No attendance records available to export");
        return;
      }

      // ✅ Prepare data for Excel sheet (todayRecords already filtered)
      const checkedInRecords = todayRecords;

      if (checkedInRecords.length === 0) {
        showErrorToast("No checked-in users available to export");
        return;
      }

      // ✅ Prepare data for Excel sheet
      const sheetData = checkedInRecords.map((item) => ({
        Name: item.name || "",
        Date: item.date || "",
        "Scheduled Start": item.scheduledStartDisplay || "",
        "Scheduled End": item.scheduledEndDisplay || "",
        "Check In": item.checkInTime || "",
        "Check Out": item.checkOutTime || "",
        Status:
          item.status === "late"
            ? "Late"
            : item.status === "early"
              ? "Early"
              : item.status === "on_time"
                ? "On Time"
                : "",
        Difference: item.diffVsScheduleText || "",
      }));

      // ✅ Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");

      // ✅ Write to binary Excel format
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
      const buf = Buffer.from(wbout, "binary");
      const wboutBase64 = buf.toString("base64");

      // ✅ Filename based on mode and selected range
      let fileName = "";
      if (mode === "day" && selectedRange?.type === "day") {
        fileName = `attendance_day_${selectedRange.ymd}.xlsx`;
      } else if (mode === "week" && selectedRange?.type === "week") {
        fileName = `attendance_week_${selectedRange.startYmd}_to_${selectedRange.endYmd}.xlsx`;
      } else if (mode === "month" && selectedRange?.type === "month") {
        const monthPad = pad2(selectedRange.monthIndex + 1);
        fileName = `attendance_month_${selectedRange.year}-${monthPad}.xlsx`;
      } else {
        const now = new Date();
        const ymd = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
          now.getDate()
        )}`;
        fileName = `attendance_${ymd}.xlsx`;
      }

      // ✅ Use documentDirectory (trusted location)
      const fileUri = FileSystem.documentDirectory + fileName;

      // ✅ Save Excel file
      await FileSystem.writeAsStringAsync(fileUri, wboutBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // ✅ Share or show file location
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: fileName,
        });
        showSuccessToast(lang.csv_prepared);
      } else {
        showSuccessToast("File saved to: " + fileUri);
      }
    } catch (err: unknown) {
      const error = err as ErrorWithMessage;
      console.warn("XLSX Export Error:", error);
      showErrorToast(" Failed to export Excel file");
    }
  };

  // render
  return (
    <View style={styles.outer}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{
          type: "text",
          value: lang.Attendance_Record,
          color: colors.text,
        }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: () =>
            navigation.navigate("NotificationScreen", {
              userId,
              langId,
              branchId: currentBranchId,
            }),
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.Date_control_Buttons}>
            <Button1
              text={lang.Now}
              onPress={onSelectNow}
              width={"30%"}
              backgroundColor={mode === "day" ? undefined : colors.background}
              textStyle={{
                color: mode === "day" ? colors.secondary : colors.subtext,
              }}
            />
            <Button1
              text={lang.Week}
              onPress={onSelectWeek}
              width={"30%"}
              backgroundColor={mode === "week" ? undefined : colors.background}
              textStyle={{
                color: mode === "week" ? colors.secondary : colors.subtext,
              }}
            />
            <Button1
              text={lang.Month}
              onPress={onSelectMonth}
              width={"30%"}
              backgroundColor={mode === "month" ? undefined : colors.background}
              textStyle={{
                color: mode === "month" ? colors.secondary : colors.subtext,
              }}
            />
          </View>

          <View style={styles.searchWrap}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder={lang.search_name_position}
            />
          </View>

          <View style={styles.inputWrap}>
            <InputBox
              label={
                mode === "day"
                  ? lang.date_label
                  : mode === "week"
                    ? "Week"
                    : "Month"
              }
              placeholder={
                mode === "day"
                  ? "Thu, Aug 18"
                  : mode === "week"
                    ? "Sun, Oct 12 - Sat, Oct 18"
                    : "October 2025"
              }
              value={dateInput}
              setValue={setDateInput}
              onBlur={() => {
                setDateError("");
                // light handling already covered by selectedRange memo
              }}
              rightIcon={require("../../../assets/icons/calender_b.png")}
              onRightIconPress={onShowNativeDatePicker}
              errorMessage={dateError}
              rightIconStyle={{ tintColor: colors.primary }}
            />
          </View>

          <View style={styles.buttonWrap}>
            <Button1
              text={lang.generate_csv}
              width={"100%"}
              onPress={onGenerateXLSX}
            />
          </View>

          <ScrollView
            style={{ marginBottom: "15%" }}
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
              {loading ? (
                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : !Array.isArray(displayedRecords) ||
                displayedRecords.length === 0 ? (
                <Text style={styles.noDataText}>
                  {mode === "day"
                    ? "No records found for selected day"
                    : mode === "week"
                      ? "No records for selected week"
                      : "No records for selected month"}
                </Text>
              ) : (
                displayedRecords.map((r, index) => {
                  return (
                    <CartBox
                      key={`${r.id}-${r.date}-${index}-${r.checkInTime || r.checkOutTime || ''}`}
                      containerStyle={styles.detail_cartbox}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          {/* 🔹 Branch name row */}
                          {r.branchName &&
                            currentBranchId &&
                            r.branchId &&
                            r.branchId !== currentBranchId ? (
                            <View style={styles.branchRow}>
                              <Image
                                source={require("../../../assets/icons/branch.png")}
                                style={styles.branchIcon}
                              />
                              <Text
                                style={styles.branchName}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {r.branchName}
                              </Text>
                            </View>
                          ) : null}

                          {/* 🧑 Avatar + user info */}
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <View style={styles.avatarPlaceholder}>
                              <Image
                                source={require("../../../assets/images/profile2.png")}
                                style={styles.profileImage}
                              />
                            </View>

                            <View style={styles.name_position}>
                              <Text
                                style={styles.name}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {r.name}
                              </Text>

                              <Text style={styles.time}>
                                {r.scheduledStartDisplay
                                  ? `${r.scheduledStartDisplay} - ${r.scheduledEndDisplay}`
                                  : "No Schedule"}
                              </Text>

                              <Text style={styles.time}>
                                {r.date
                                  ? `${WEEKDAYS[new Date(r.date).getDay()]}, ${MONTHS[new Date(r.date).getMonth()]
                                  } ${new Date(r.date).getDate()}`
                                  : ""}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* ⏱️ Status */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-end",
                          }}
                        >
                          <Text
                            style={
                              r.status === "late"
                                ? styles.status_late
                                : r.status === "early"
                                  ? styles.status_early
                                  : r.status === "on_time"
                                    ? styles.status_on_time
                                    : { display: "none" }
                            }
                          >
                            {r.status === "late"
                              ? "Late"
                              : r.status === "early"
                                ? "Early"
                                : r.status === "on_time"
                                  ? "On Time"
                                  : ""}
                          </Text>

                          {r.diffVsScheduleText ? (
                            <Text style={[styles.time1, { marginTop: 6 }]}>
                              {r.diffVsScheduleText}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </CartBox>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={selectedDateObj ?? new Date()}
          mode={"date"}
          display={Platform.OS === "ios" ? "spinner" : "calendar"}
          onChange={onNativeDateChange}
        />
      )}
      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.secondary },
  container: { marginHorizontal: 20, flex: 1 },
  body: { flex: 1, paddingTop: 20 },
  Date_control_Buttons: {
    marginBottom: 20,
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
  },
  searchWrap: { marginBottom: 12 },
  inputWrap: { paddingBottom: 8 },
  buttonWrap: { paddingBottom: 20 },
  recordCard: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 12,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  details: {},
  detail_cartbox: {
    width: "100%",
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    justifyContent: "flex-start",
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  name_position: { marginLeft: 10, width: "65%" },
  name: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
  },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 6 },
  time1: { fontSize: fonts.size.s, color: colors.primary, marginTop: 6 },
  duration: {
    color: colors.primary,
    fontWeight: "500",
    fontSize: 14,
    marginLeft: 8,
  },
  status_early: {
    fontWeight: fonts.weight.regular,
    color: colors.status_early,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_early_bg,
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  status_late: {
    fontWeight: fonts.weight.regular,
    color: colors.status_late,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_late_bg,
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  status_on_time: {
    fontWeight: fonts.weight.regular,
    color: colors.status_early,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_early_bg,
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  status_noschedule: {
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: "#00000006",
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  noDataText: { textAlign: "center", color: colors.subtext, marginTop: 12 },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: "cover",
  },
  branchHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignSelf: "flex-start",
    width: "90%",
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  branchIcon: {
    width: 14,
    height: 14,
    marginRight: 5,
    tintColor: colors.text, // make it match theme color
  },

  branchName: {
    color: colors.text,
    fontSize: fonts.size.m,
  },
});

export default AttendancerecordScreen;
