// screens/admin/main/AttendancerecordScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Share,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import colors from "../../../styles/Colors";
import Header from "../../../components/Header";
import DateTimePicker from "@react-native-community/datetimepicker";
import SearchBar from "../../../components/SearchBar";
import { useNavigation, useRoute } from "@react-navigation/native";
import { users as usersArr, User } from "../../../api/Users";
import { branches, getBranchById } from "../../../api/Branch";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import { workHours as workHoursArr } from "../../../api/WorkHours";
import { schedules as schedulesArr } from "../../../api/Schedule";

import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import { getAttendanceAllHistory, AttendanceHistoryItem } from "../../../api/attendanceAllHistory";
import { getAttendanceReport, AttendanceReportItem } from '../../../api/checkin_checkout';

import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { Buffer } from "buffer";
import base64 from "base-64";
import axiosInstance from "../../../api/axiosInstance";
import { getProfile, ProfileUser, getUserById } from '../../../api/profile';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSchedulesForDate } from "../../../api/schedules";
import moment from "moment"; // if you already use moment, otherwise use JS Date


function parseLocalDateTime(datetimeString) {
  if (!datetimeString) return null;
  const [datePart, timePart] = datetimeString.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

function formatTime12h(dateObj) {
  if (!dateObj) return "-";
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  const displayMinute = minutes.toString().padStart(2, "0");
  return `${displayHour}:${displayMinute} ${ampm}`;
}

if (typeof (global as any).Buffer === "undefined") {
  (global as any).Buffer = Buffer;
}
// ensure atob/btoa exist for some libs
if (typeof (global as any).atob === "undefined") {
  (global as any).atob = (str: string) => base64.decode(str);
}
if (typeof (global as any).btoa === "undefined") {
  (global as any).btoa = (str: string) => base64.encode(str);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// format hh:mm:ss -> minutes
const timeToMinutes = (hhmmss: string) => {
  if (!hhmmss) return 0;
  const parts = hhmmss.split(":").map((p) => parseInt(p, 10) || 0);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
};
// format minutes diff to "1h 30m" or "12m"
const formatMinutesDiff = (min: number) => {
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
// format hh:mm:ss -> "h:mm AM/PM"
const formatTime12 = (hhmmss: string) => {
  if (!hhmmss) return "";
  const [hhStr, mmStr] = hhmmss.split(":");
  const hh = parseInt(hhStr || "0", 10);
  const mm = mmStr || "00";
  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${ampm}`;
};

// convert displayed "Thu, Aug 18" -> YYYY-MM-DD (assume current year)
const dateInputToYMD = (display: string): { ok: boolean; ymd?: string; message?: string } => {
  if (!display || display.trim() === "") return { ok: false, message: "Empty date" };
  const cleaned = display.replace(",", "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length !== 3) return { ok: false, message: "Use format: Ddd, Mmm DD" };
  const [wd, mon, dayStr] = parts;
  const wdLower = wd.slice(0, 3).toLowerCase();
  const monLower = mon.slice(0, 3).toLowerCase();
  if (!["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(wdLower))
    return { ok: false, message: "Weekday must be 3-letter (Mon..Sun)" };
  const monIndex = MONTHS.findIndex(m => m.toLowerCase() === monLower);
  if (monIndex === -1) return { ok: false, message: "Month must be 3-letter (Jan..Dec)" };
  const day = parseInt(dayStr, 10);
  if (isNaN(day) || day <= 0) return { ok: false, message: "Invalid day" };
  const year = new Date().getFullYear();
  const maxDays = new Date(year, monIndex + 1, 0).getDate();
  if (day > maxDays) return { ok: false, message: `${FULL_MONTHS[monIndex]} has only ${maxDays} days` };
  const dt = new Date(year, monIndex, day);
  if (WEEKDAYS[dt.getDay()].toLowerCase() !== wdLower)
    return { ok: false, message: `Weekday mismatch (expected ${WEEKDAYS[dt.getDay()]})` };
  const ymd = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  return { ok: true, ymd };
};

// format YYYY-MM-DD -> "Thu, Aug 18"


const getStartOfWeekSunday = (date: Date) => {
  const day = date.getDay(); // 0 Sun ... 6 Sat
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
};
const getEndOfWeekSaturday = (date: Date) => {
  const start = getStartOfWeekSunday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

function formatWeekDisplayFromDate(date: Date): string {
  // Clone date
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  // Find Sunday (start of week)
  const day = d.getDay(); // Sunday = 0
  const start = new Date(d);
  start.setDate(d.getDate() - day);

  // Find Saturday (end of week)
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startStr = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const endStr = end.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return `${startStr} - ${endStr}`;
}



const getWeekRange = (date: Date) => {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};



const getMonthRange = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};


const formatMonthDisplayFromDate = (date: Date) => {
  return `${FULL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

// parse month display like "October 2025" or "Oct" or "Oct 2025" or "October"
const parseMonthInput = (display: string): { ok: boolean; year?: number; monthIndex?: number; message?: string } => {
  if (!display || display.trim() === "") return { ok: false, message: "Empty" };
  const tokens = display.trim().split(/\s+/);
  const mTok = tokens[0].slice(0, 3).toLowerCase();
  const monthIndex = MONTHS.findIndex(m => m.toLowerCase() === mTok);
  if (monthIndex === -1) return { ok: false, message: "Invalid month" };
  let year = new Date().getFullYear();
  if (tokens.length >= 2) {
    const y = parseInt(tokens[1], 10);
    if (!isNaN(y)) year = y;
  }
  return { ok: true, year, monthIndex };
};

const AttendancerecordScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // support both prop-based injection (from Footer) and route params
  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  // version to force recompute if underlying arrays mutated elsewhere
  const [version, setVersion] = useState<number>(0);

  // search (not strictly required here but keeps parity with Staff screens)
  const [query, setQuery] = useState<string>("")
   const [records, setRecords] = useState<AttendanceReportItem[]>([]);


  // MODE: "day" | "week" | "month"


  // derive current admin user & branch id from incoming userId param
  const currentUser = usersArr.find(u => u.id === userId) || null;
  const currentBranchId = currentUser?.branch_id ?? null;

  // date input & validation
  const defaultToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const defaultDateDisplay = `${WEEKDAYS[defaultToday.getDay()]}, ${MONTHS[defaultToday.getMonth()]} ${defaultToday.getDate()}`;
  const prevDateRef = useRef<string>(defaultDateDisplay);
  const [dateInput, setDateInput] = useState<string>(defaultDateDisplay); // shows today by default
  const [dateError, setDateError] = useState<string>("");
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(defaultToday);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [attendanceData, setAttendanceData] = useState<AttendanceHistoryItem[]>([]);
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceHistoryItem[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AttendanceHistoryItem[]>([]);
  const [filteredData, setFilteredData] = useState<AttendanceHistoryItem[]>([]);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [mode, setMode] = useState<"day" | "week" | "month">("day");

  const [weekRecords, setWeekRecords] = useState<any[]>([]);
  const [monthRecords, setMonthRecords] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const cached = await AsyncStorage.getItem("cachedProfile");
      if (cached) setProfile(JSON.parse(cached));

      try {
        const user = await getProfile();
        setProfile(user);
        await AsyncStorage.setItem("cachedProfile", JSON.stringify(user));
      } catch (err) {
        console.error("Profile fetch failed:", err);
      }
    };
    loadProfile();
  }, []);



  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAttendanceAllHistory();
      setAttendanceData(data);
      filterData(mode, data);
    } catch (error) {
      console.error("❌ Error fetching attendance history:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode]);




  const filterData = (filterMode: "now" | "week" | "month", data: AttendanceHistoryItem[]) => {
    const now = new Date();
    let filtered: AttendanceHistoryItem[] = [];

    if (filterMode === "now") {
      const today = now.toISOString().split("T")[0];
      filtered = data.filter((item) => item.In.startsWith(today));
    } else if (filterMode === "week") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      filtered = data.filter((item) => new Date(item.In) >= weekStart);
    } else if (filterMode === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = data.filter((item) => new Date(item.In) >= monthStart);
    }

    setFilteredData(filtered);
  };








  // helper: handle date text change (same permissive formatting)
  const handleDateTextChange = (raw: string) => {
    const prev = prevDateRef.current || "";
    const isDeleting = raw.length < prev.length;
    let s = raw.replace(/[^A-Za-z0-9, ]/g, "");
    s = s.replace(/^\s+/, "");
    if (isDeleting) {
      setDateInput(s);
      prevDateRef.current = s;
      // light validation only
      if (mode === "day") {
        const conv = dateInputToYMD(s);
        if (conv.ok) setDateError("");
      } else if (mode === "month") {
        const conv = parseMonthInput(s);
        if (conv.ok) setDateError("");
      }
      return;
    }
    // reuse your formatting logic (day-oriented)
    const hasComma = s.indexOf(",") !== -1;
    let wdPart = "";
    let rest = "";
    if (hasComma) {
      const split = s.split(",");
      wdPart = split[0].trim();
      rest = split.slice(1).join(",").trim();
    } else {
      const tokens = s.split(/\s+/).filter(Boolean);
      wdPart = tokens[0] ?? "";
      rest = tokens.slice(1).join(" ") ?? "";
    }
    if (wdPart.length > 0) {
      wdPart = wdPart.slice(0, 3);
      wdPart = wdPart.charAt(0).toUpperCase() + wdPart.slice(1).toLowerCase();
    }
    let formatted = wdPart;
    if (wdPart.length === 3) formatted = wdPart + ", ";
    else if (hasComma) formatted = wdPart + ", ";
    const restParts = rest.split(/\s+/).filter(Boolean);
    let monPart = restParts[0] ?? "";
    let dayPart = restParts[1] ?? "";
    if (monPart.length > 0) {
      monPart = monPart.slice(0, 3);
      monPart = monPart.charAt(0).toUpperCase() + monPart.slice(1).toLowerCase();
      formatted += monPart;
      if (monPart.length === 3 && !dayPart) formatted += " ";
    }
    if (dayPart.length > 0) {
      dayPart = dayPart.replace(/[^0-9]/g, "").slice(0, 2);
      if (!formatted.endsWith(" ")) formatted += " ";
      formatted += dayPart;
    }
    formatted = formatted.replace(/^\s+/, "");
    setDateInput(formatted);
    prevDateRef.current = formatted;
    const conv = dateInputToYMD(formatted);
    if (conv.ok) setDateError("");
  };

  // native date picker handlers (simple show/hide)
  const onShowNativeDatePicker = () => setShowDatePicker(true);
  const onNativeDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);

    if (selectedDate) {
      selectedDate.setHours(0, 0, 0, 0);
      setSelectedDateObj(selectedDate);
      setDateError("");

      if (mode === "day") {
        const wd = WEEKDAYS[selectedDate.getDay()];
        const mon = MONTHS[selectedDate.getMonth()];
        const day = selectedDate.getDate();
        const fmt = `${wd}, ${mon} ${day}`;
        setDateInput(fmt);

      } else if (mode === "week") {
        // ✅ Get Monday–Sunday range
        const { start, end } = getWeekRange(selectedDate);

        // ✅ Filter attendance entries
        const filtered = attendanceEntries.filter(item => {
          const entryDateStr = item.In ?? item.date ?? item.created_at;
          if (!entryDateStr) return false;
          const entryDate = new Date(entryDateStr);
          return entryDate >= start && entryDate <= end;
        });

        setFilteredData(filtered);

        // ✅ Update display text
        const startStr = `${WEEKDAYS[start.getDay()]}, ${MONTHS[start.getMonth()]} ${start.getDate()}`;
        const endStr = `${WEEKDAYS[end.getDay()]}, ${MONTHS[end.getMonth()]} ${end.getDate()}`;
        setDateInput(`${startStr} - ${endStr}`);

      } else {
        setDateInput(formatMonthDisplayFromDate(selectedDate));
      }

      prevDateRef.current = dateInput;
    }
  };



  // pull to refresh — clear inputs, errors and force recompute
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    await new Promise((r) => setTimeout(r, 600));
    // reset depending on mode: keep mode but reset date to today-week-month accordingly
    setQuery("");
    setDateError("");
    setSelectedDateObj(defaultToday);
    if (mode === "day") {
      setDateInput(defaultDateDisplay);
    } else if (mode === "week") {
      setDateInput(formatWeekDisplayFromDate(defaultToday));
    } else {
      setDateInput(formatMonthDisplayFromDate(defaultToday));
    }
    prevDateRef.current = "";
    setVersion((v) => v + 1);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 🔹 Converts a Date object → "YYYY-MM-DD"
  const toYMD = (d: Date) => d.toISOString().split("T")[0];


  // 🔹 Converts "HH:mm" string → total minutes
  const hhmmToMinutes = (t: string) => {
    if (!t) return 0;
    const [h, m, s] = t.split(":").map(Number);
    return h * 60 + m + (s ? s / 60 : 0);
  };

  // 🔹 Converts full datetime → minutes (from midnight)
  const datetimeToMinutes = (dt: string) => {
    const d = new Date(dt);
    return d.getHours() * 60 + d.getMinutes();
  };






  // 🔹 Formats time difference (e.g., "12m late" or "8m early")
  const formatMinutesDiff = (min: number) => {
    const abs = Math.abs(min);
    const sign = min > 0 ? "late" : "early";
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return hours > 0 ? `${hours}h ${minutes}m ${sign}` : `${minutes}m ${sign}`;
  };



  // derive the selection range depending on mode
  // returns an object: { type: 'day', ymd } | { type: 'week', startYmd, endYmd } | { type: 'month', year, monthIndex } or null
  const selectedRange = useMemo(() => {
    // prefer selectedDateObj if present
    const baseDate = selectedDateObj ?? new Date();
    try {
      if (mode === "day") {
        // attempt to parse typed dateInput first
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) return { type: "day" as const, ymd: conv.ymd! };
        // fallback to selectedDateObj
        if (selectedDateObj) {
          return { type: "day" as const, ymd: `${selectedDateObj.getFullYear()}-${pad2(selectedDateObj.getMonth() + 1)}-${pad2(selectedDateObj.getDate())}` };
        }
        return null;
      } else if (mode === "week") {
        // try to parse a single date from dateInput (day format) and compute the week
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) {
          const [y, m, d] = conv.ymd!.split("-").map(x => parseInt(x, 10));
          const dt = new Date(y, m - 1, d);
          const s = getStartOfWeekSunday(dt);
          const e = getEndOfWeekSaturday(dt);
          return { type: "week" as const, startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
        }
        // if user typed a week-range format like "Sun, Oct 12 - Sat, Oct 18" try to parse first date
        const dashIdx = dateInput.indexOf("-");
        if (dashIdx !== -1) {
          const left = dateInput.slice(0, dashIdx).trim();
          const conv2 = dateInputToYMD(left.replace(",", ""));
          if (conv2.ok) {
            const [y, m, d] = conv2.ymd!.split("-").map(x => parseInt(x, 10));
            const dt = new Date(y, m - 1, d);
            const s = getStartOfWeekSunday(dt);
            const e = getEndOfWeekSaturday(dt);
            return { type: "week" as const, startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
          }
        }
        // fallback to baseDate's week
        const s = getStartOfWeekSunday(baseDate);
        const e = getEndOfWeekSaturday(baseDate);
        return { type: "week" as const, startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
      } else { // month
        // try to parse typed month input
        const pm = parseMonthInput(dateInput.trim());
        if (pm.ok) {
          return { type: "month" as const, year: pm.year!, monthIndex: pm.monthIndex! };
        }
        // fallback to selectedDateObj or baseDate
        const dt = selectedDateObj ?? baseDate;
        return { type: "month" as const, year: dt.getFullYear(), monthIndex: dt.getMonth() };
      }
    } catch (e) {
      return null;
    }
  }, [mode, dateInput, selectedDateObj, version]);

  // work filtered by selected range (day, week, month). returns array of WorkHour matching range
  // IMPORTANT: filter by currentBranchId — include only records where either:
  //   - employee's own branch_id === currentBranchId OR
  //   - schedule.branch_id === currentBranchId (employee working at another branch that day)
  const workForRange = useMemo(() => {
    if (!selectedRange) return [];
    let base = [];
    if (selectedRange.type === "day") {
      base = workHoursArr.filter(w => w.date === selectedRange.ymd);
    } else if (selectedRange.type === "week") {
      const s = selectedRange.startYmd;
      const e = selectedRange.endYmd;
      base = workHoursArr.filter(w => w.date >= s && w.date <= e);
    } else {
      const y = selectedRange.year;
      const mi = selectedRange.monthIndex;
      const prefix = `${y}-${pad2(mi + 1)}-`;
      base = workHoursArr.filter(w => w.date.startsWith(prefix));
    }

    if (!currentBranchId) return base; // if we don't know admin's branch, show everything

    // filter base by branch logic + exclude admin users (only show employee records)
    return base.filter(w => {
      const emp = usersArr.find(u => u.id === w.user_id) || null;

      // skip if we couldn't find the user or if the user is an admin (we only show employees)
      if (!emp || emp.role === "admin") return false;

      const sched = schedulesArr.find(s => s.user_id === w.user_id && s.date === w.date) || null;
      const empBranch = emp.branch_id ?? null;
      const schedBranch = sched?.branch_id ?? null;

      // include record if either employee's primary branch matches OR schedule branch matches
      return empBranch === currentBranchId || schedBranch === currentBranchId;
    });

  }, [selectedRange, version, currentBranchId]);

  // Build UI list entries combining user, workHours, schedule and status/diff
  const entries = useMemo(() => {
    return workForRange
      .slice()
      .sort((a, b) => (a.check_in < b.check_in ? 1 : -1))
      .map(wh => {
        const user = usersArr.find(u => u.id === wh.user_id) || null;
        const sched = schedulesArr.find(s => s.user_id === wh.user_id && s.date === wh.date) || null;
        let status: "early" | "late" | "noschedule" = "noschedule";
        let diffText = "";
        if (sched) {
          const schedMin = timeToMinutes(sched.start_time);
          const checkMin = timeToMinutes(wh.check_in);
          const diff = checkMin - schedMin;
          if (diff > 0) {
            status = "late";
            diffText = formatMinutesDiff(diff);
          } else {
            status = "early";
            diffText = formatMinutesDiff(diff);
          }
        }
        return { work: wh, user, schedule: sched, status, diffText };
      });
  }, [workForRange, version]);

  //------------------------------------------------------------------//
  const onGenerateCSV = async () => {
    try {
      if (!todayRecords || todayRecords.length === 0) {
        showErrorToast("No attendance records available to export");
        return;
      }

      // Build structured data from the same array you display in UI
      const sheetData = todayRecords.map((item) => {
        const status =
          item.status === "late"
            ? "Late"
            : item.status === "early"
              ? "Early"
              : "On time";

        return {
          "Name": item.name || "",
          "Date": item.date || "",
          "Scheduled Start": item.start || "",
          "Scheduled End": item.end || "",
          "Check In": item.checkIn || "",
          "Check Out": item.checkOut || "",
          "Status": status,
          "Diff": item.diffText || "",
        };
      });

      // ✅ Create workbook + worksheet
      const ws = XLSX.utils.json_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");

      // Write binary Excel output
      const wboutBinary = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
      const buf = Buffer.from(wboutBinary, "binary");
      const wboutBase64 = buf.toString("base64");

      // ✅ Filename based on mode
      const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      let filename = "attendance.xlsx";
      const now = new Date();

      if (mode === "day" || mode === "now") {
        const ymd = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
        filename = `attendance_${ymd}.xlsx`;
      } else if (mode === "week") {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Sunday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const startYmd = `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
        const endYmd = `${weekEnd.getFullYear()}-${pad2(weekEnd.getMonth() + 1)}-${pad2(weekEnd.getDate())}`;
        filename = `attendance_${startYmd}_to_${endYmd}.xlsx`;
      } else if (mode === "month") {
        filename = `attendance_${now.getFullYear()}-${pad2(now.getMonth() + 1)}.xlsx`;
      }

      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + filename;

      // Choose encoding fallback
      const enc: any =
        (FileSystem as any).EncodingType && (FileSystem as any).EncodingType.Base64
          ? (FileSystem as any).EncodingType.Base64
          : "base64";

      // ✅ Write Excel file to device
      await FileSystem.writeAsStringAsync(fileUri, wboutBase64, { encoding: enc });

      // ✅ Share or save file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: filename,
        });
        showSuccessToast("✅ Excel file prepared successfully");
      } else {
        showSuccessToast("File saved to: " + fileUri);
      }
    } catch (err) {
      console.warn("XLSX/Expo error", err);
      showErrorToast("Failed to prepare Excel file");
    }
  };



  //---------------------------------------------------------------//
  // Search filtering for entries (optional

  // toggle handlers
  const onSelectNow = () => {
    setMode("day");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDateObj(today);
    const fmt = `${WEEKDAYS[today.getDay()]}, ${MONTHS[today.getMonth()]} ${today.getDate()}`;
    setDateInput(fmt);
    setDateError("");
    setVersion(v => v + 1);
  };

  const onSelectWeek = () => {
    setMode("week");
    // if a date is selected, use it; otherwise use today
    const dt = selectedDateObj ?? new Date();
    const fmt = formatWeekDisplayFromDate(dt);
    setDateInput(fmt);
    setDateError("");
    setVersion(v => v + 1);
  };

  const onSelectMonth = () => {
    setMode("month");
    const dt = selectedDateObj ?? new Date();
    const fmt = formatMonthDisplayFromDate(dt);
    setDateInput(fmt);
    setDateError("");
    setVersion(v => v + 1);
  };

  const fetchAttendanceData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAttendanceAllHistory();
      setAttendanceData(res);
      applyFilter(mode, res);
    } catch (error) {
      console.error("❌ Failed to fetch attendance history:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);


  const formatDateYMD = (d: Date) => {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };


  const applyFilter = (filterMode: "day" | "week" | "month", data: AttendanceHistoryItem[]) => {
    const now = new Date();
    let filtered: AttendanceHistoryItem[] = [];

    if (filterMode === "day") {
      const today = now.toISOString().split("T")[0];
      filtered = data.filter((item) => item.In.startsWith(today));
    } else if (filterMode === "week") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      filtered = data.filter((item) => new Date(item.In) >= weekStart);
    } else {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = data.filter((item) => new Date(item.In) >= monthStart);
    }


    const mapped = filtered.map((item) => ({
      work: {
        id: item.id,
        check_in: item.In,
        check_out: item.Out,
        date: item.In.split(" ")[0],
      },
      user: {
        fullname: item.user?.username ?? "-",
        position: item.user?.email ?? "",
      },
      schedule: {
        branch_id: item.branch_id,
      },
      status: "normal",
      diffText: item.Out ? calcDuration(item.In, item.Out) : "-",
    }));

    setFilteredEntries(mapped);
  };


  const calcDuration = (inTime: string, outTime: string) => {
    const inDate = new Date(inTime.replace(" ", "T"));
    const outDate = new Date(outTime.replace(" ", "T"));
    const diffMs = outDate.getTime() - inDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    return `${hours}h ${minutes}m`;
  };

  // button background logic (active = primary, inactive = background)
  const nowBg = mode === "day" ? undefined : colors.background;
  const weekBg = mode === "week" ? undefined : colors.background;
  const monthBg = mode === "month" ? undefined : colors.background;

  // text color for each toggle: active -> colors.secondary, inactive -> colors.subtext
  const nowTextColor = mode === "day" ? colors.secondary : colors.subtext;
  const weekTextColor = mode === "week" ? colors.secondary : colors.subtext;
  const monthTextColor = mode === "month" ? colors.secondary : colors.subtext;

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAttendanceAllHistory();
      setAttendanceData(data);
      applyFilter(mode, data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);


  useEffect(() => {
    fetchAttendance();
  }, [version, mode, selectedDateObj]);

  const filteredRecords = useMemo(() => {
    if (!filteredEntries?.length || !selectedDateObj) return [];

    const selectedDate = new Date(selectedDateObj);
    const modeLower = mode?.toLowerCase?.() ?? "week";

    let start = new Date(selectedDate);
    let end = new Date(selectedDate);

    // 🗓️ Determine start/end date range
    if (modeLower === "week") {
      const day = selectedDate.getDay(); // Sunday = 0
      start.setDate(selectedDate.getDate() - day); // Go to previous Sunday
      start.setHours(0, 0, 0, 0);

      end.setDate(start.getDate() + 6); // Saturday
      end.setHours(23, 59, 59, 999);
    } else if (modeLower === "month") {
      start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (modeLower === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    console.log(`🕒 Filter range (${modeLower}): ${start.toISOString()} → ${end.toISOString()}`);

    // 🧭 Filter records by selected date range
    let results = filteredEntries.filter(({ work }) => {
      const recordDate = new Date(work.date);
      return recordDate >= start && recordDate <= end;
    });

    // 🔍 Apply search filter if query exists
    if (query?.trim()) {
      const lower = query.trim().toLowerCase();
      results = results.filter(({ user }) => {
        const name = user?.fullname?.toLowerCase?.() || "";
        return name.includes(lower)
      });
    }

    return results;
  }, [filteredEntries, selectedDateObj, mode, query]);



  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        const allAttendance = await getAttendanceAllHistory();
        const todayYMD = toYMD(new Date());

        const schedulesState = []; // e.g. useSelector((s) => s.schedules.list)
        const usersState = []; // e.g. useSelector((s) => s.users.list)

        const enriched = await Promise.all(
          allAttendance.map(async (att) => {
            // ✅ Get user ID correctly from multiple possible keys
            const uid =
              att.user?._id ??
              att.user?.id ??
              att.user?.userId ??
              att.user_id ??
              null;

            // ✅ Find or fetch user profile
            let userProfile =
              usersState.find(
                (u) =>
                  String(u._id) === String(uid) ||
                  String(u.id) === String(uid)
              ) ?? null;

            if (!userProfile && uid) {
              try {
                userProfile = await getUserById(uid);
              } catch {
                userProfile = null;
              }
            }

            // ✅ Build proper display name (fullname → name → fallback)
            const displayName =
              userProfile?.fullname ??
              userProfile?.name ??
              att.user?.fullname ??
              att.user?.name ??
              "Unknown User";

            // ✅ Match today's schedule for this user
            const schedule =
              schedulesState.find((s) => {
                const empId =
                  s.employee_id?._id ??
                  s.employee_id?.id ??
                  s.employee_id ??
                  null;
                const sDate = s.date ? toYMD(new Date(s.date)) : null;
                return empId && uid && String(empId) === String(uid) && sDate === todayYMD;
              }) ?? null;

            // ✅ Determine status (early/late/noschedule)
            let status: "early" | "late" | "noschedule" = "noschedule";
            let diffText = "";

            if (schedule?.start_time && att.In) {
              const schedMin = hhmmToMinutes(schedule.start_time);
              const inMin = datetimeToMinutes(att.In);
              const diff = inMin - schedMin;
              if (diff > 0) {
                status = "late";
                diffText = formatMinutesDiff(diff);
              } else {
                status = "early";
                diffText = formatMinutesDiff(diff);
              }
            }

            // ✅ Branch name logic
            let branchNameToShow: string | null = null;

            if (att.branch?.name) {
              branchNameToShow = att.branch.name;
            } else if (att.branch_id) {
              try {
                const b = await getBranchById(att.branch_id);
                branchNameToShow = b?.name ?? "Unknown Branch";
              } catch {
                branchNameToShow = "Unknown Branch";
              }
            } else {
              branchNameToShow = "Default Branch";
            }

            return {
              userName: displayName, // ✅ fullname saved here
              scheduledTime: schedule?.start_time ?? "N/A",
              checkInTime: att.In ?? "N/A",
              status,
              diffText,
              branchNameToShow,
            };
          })
        );

        // ✅ Filter only today's records
        const todayRecords = enriched.filter((e) => {
          const inDate = e.checkInTime ? toYMD(new Date(e.checkInTime)) : "";
          return inDate === todayYMD;
        });

        // ✅ Pretty console output
        if (todayRecords.length === 0) {
          console.log("📭 No attendance records for today.");
        } else {
          todayRecords.forEach((item) => {
            console.log(`
📅 Today's Attendance Record:
-----------------------------
👤 User: ${userId}  
🕒 Status: ${item.status.toUpperCase()} ${item.diffText ? `(${item.diffText})` : ""}
📍 Scheduled Time: ${item.scheduledTime}
✅ Check-in Time: ${new Date(item.checkInTime).toLocaleTimeString()}
🏢 Branch: ${item.branchNameToShow || "Default Branch"}
-----------------------------
`);
          });
        }

        setAttendanceData(todayRecords);
      } catch (err) {
        console.error("Error fetching attendance data:", err);
      }
    };

    fetchAttendanceData();
  }, []);


  useEffect(() => {
    const fetchUsersForRecords = async () => {
      const updated = await Promise.all(
        filteredRecords.map(async r => {
          if (!r.user && r.work?.employee_id) {
            const u = await getUserById(r.work.employee_id);
            return { ...r, user: u };
          }
          return r;
        })
      );
      setFilteredRecords(updated);
    };
    fetchUsersForRecords();
  }, [filteredRecords]);

  useEffect(() => {
    const fetchTodaySchedules = async () => {
      try {
        const today = new Date();
        const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        const dateYMD = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

        const schedules = await getSchedulesForDate(dateYMD);

        console.log("📅 Today’s Date:", dateYMD);
        console.log("📋 Today’s Schedules:");

        schedules.forEach((s, index) => {
          const employeeName =
            typeof s.employee_id === "object"
              ? s.employee_id?.username || s.employee_id?.fullname || "Unknown"
              : s.employee_id;

          const start = s.start_time || "N/A";
          const end = s.end_time || "N/A";

          console.log(
            `#${index + 1} 👤 ${employeeName}\n🕒 ${start} - ${end}\n`
          );
        });
      } catch (err) {
        console.error("fetchTodaySchedules error:", err);
      }
    };

    fetchTodaySchedules();
  }, []);

  const [todayRecords, setTodayRecords] = useState<any[]>([]);

  useEffect(() => {
    const fetchAttendanceRecords = async () => {
      setLoading(true); // 👈 Start spinner
      try {
        const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        const formatYMD = (d: Date) =>
          `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        const allAttendance = await getAttendanceAllHistory();

        // ✅ Determine base date
        const baseDate = selectedDateObj ?? new Date(); // Use selected date if available

        let startDate = new Date(baseDate);
        let endDate = new Date(baseDate);

        // ✅ Decide range based on mode
        if (mode === "day") {
          // Exact date (selected date)
          startDate = new Date(baseDate);
          endDate = new Date(baseDate);
        } else if (mode === "week") {
          const dayOfWeek = baseDate.getDay(); // Sunday=0
          startDate = new Date(baseDate);
          startDate.setDate(baseDate.getDate() - dayOfWeek); // Start of week (Sunday)
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6); // End of week (Saturday)
        } else if (mode === "month") {
          startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
          endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
        }

        const startYMD = formatYMD(startDate);
        const endYMD = formatYMD(endDate);

        console.log(`📅 Mode: ${mode}`);
        console.log(`📆 Fetching attendance between ${startYMD} → ${endYMD}`);

        // ✅ Filter attendance records by selected range
        const filteredAttendances = allAttendance.filter((a) => {
          if (!a?.In) return false;
          const inDateStr = a.In.split(" ")[0].replace(/\//g, "-");
          if (!inDateStr) return false;

          const inDate = new Date(inDateStr);
          const sDate = new Date(startYMD);
          const eDate = new Date(endYMD);

          sDate.setHours(0, 0, 0, 0);
          eDate.setHours(23, 59, 59, 999);

          return inDate >= sDate && inDate <= eDate;
        });

        if (filteredAttendances.length === 0) {
          console.log("⚠️ No records found for this range.");
        }

        // ✅ Collect all unique attendance dates
        const uniqueDates = [
          ...new Set(filteredAttendances.map((a) => a.In.split(" ")[0])),
        ];

        // ✅ Fetch schedules for all those days
        const scheduleArrays = await Promise.all(
          uniqueDates.map((d) => getSchedulesForDate(d))
        );
        const allSchedules = scheduleArrays.flat();

        // ✅ Prepare final list for UI
        const finalList = filteredAttendances
          .map((att) => {
            const inDate = att.In.split(" ")[0].replace(/\//g, "-");
            const checkIn = att.In.split(" ")[1];
            const checkOut = att.Out ? att.Out.split(" ")[1] : null;

            const schedule = allSchedules.find((s) => {
              if (!s.employee_id) return false;
              const schedId =
                typeof s.employee_id === "object"
                  ? s.employee_id._id
                  : s.employee_id;
              return schedId === att.user.id;
            });

            if (!schedule) return null;

            const name =
              att.user?.fullname ||
              att.user?.username ||
              (typeof schedule.employee_id === "object" &&
                schedule.employee_id.username) ||
              "Unknown";

            const start = schedule.start_time || "N/A";
            const end = schedule.end_time || "N/A";

            // 🧮 Calculate early/late difference
            let status = "no_schedule";
            let diffText = "";

            if (start && checkIn && start !== "N/A") {
              const scheduleTime = new Date(`${inDate}T${start}:00`);
              const checkInTime = new Date(`${inDate}T${checkIn}`);
              const diffMinutes = Math.round((checkInTime - scheduleTime) / 60000);
              const absDiff = Math.abs(diffMinutes);
              const h = Math.floor(absDiff / 60);
              const m = absDiff % 60;
              const hhmm = `${h.toString().padStart(2, "0")}h ${m
                .toString()
                .padStart(2, "0")}m`; // 👈 Added space between h and m

              if (diffMinutes > 1) {
                status = "late";
                diffText = hhmm;
              } else if (diffMinutes < -1) {
                status = "early";
                diffText = hhmm;
              } else {
                status = "on_time";
                diffText = "00h 00m";
              }
            }

            console.log(`👤 ${name}
📅 Date: ${inDate}
🕒 Schedule: ${start} - ${end}
✅ Check-in: ${checkIn}
🏁 Check-out: ${checkOut || "N/A"}
📋 Status: ${status === "late"
                ? "⏰ Late"
                : status === "early"
                  ? "🕒 Early"
                  : "✅ On time"
              }
📏 Difference: ${diffText}
-----------------------------`);

            return {
              name,
              date: inDate,
              start,
              end,
              checkIn,
              checkOut,
              status,
              diffText,
            };
          })
          .filter(Boolean);

        setTodayRecords(finalList);
      } catch (err) {
        console.error("fetchAttendanceRecords error:", err);
      } finally {
        setLoading(false); // 👈 Stop spinner
      }
    };

    fetchAttendanceRecords();
  }, [mode, selectedDateObj]);





  return (
    <View style={styles.outer}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Attendance_Record, color: colors.text }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: () => {
            console.log("Navigate -> NotificationScreen", { userId, langId: langId, currentBranchId: currentBranchId });
            navigation.navigate("NotificationScreen" as any, { userId, langId: langId, currentBranchId });
          },
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.Date_control_Buttons}>
            <Button1 text={lang.Now}
              onPress={onSelectNow}
              width={'30%'}
              backgroundColor={nowBg}
              textStyle={{ color: nowTextColor }} />

            <Button1 text={lang.Week}
              onPress={onSelectWeek}
              width={'30%'}
              backgroundColor={weekBg}
              textStyle={{ color: weekTextColor }} />

            <Button1 text={lang.Month}
              onPress={onSelectMonth}
              width={'30%'}
              backgroundColor={monthBg}
              textStyle={{ color: monthTextColor }} />

          </View>

          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_name_position} />
          </View>

          <View style={styles.inputWrap}>
            <InputBox
              label={mode === "day" ? lang.date_label : (mode === "week" ? "Week" : "Month")}
              placeholder={mode === "day" ? "Thu, Aug 18" : (mode === "week" ? "Sun, Oct 12 - Sat, Oct 18" : "October 2025")}
              value={dateInput}
              setValue={handleDateTextChange}
              onBlur={() => {
                // validation & set selectedDateObj depending on mode
                if (!dateInput || dateInput.trim() === "") {
                  setDateError(lang.date_required);
                  return;
                }
                if (mode === "day") {
                  const conv = dateInputToYMD(dateInput.trim());
                  if (!conv.ok) {
                    setDateError(conv.message || "Invalid date");
                    setDateInput("");
                    prevDateRef.current = "";
                    setSelectedDateObj(null);
                    return;
                  }
                  setDateError("");
                  const [y, m, d] = conv.ymd!.split("-").map(x => parseInt(x, 10));
                  const dt = new Date(y, m - 1, d);
                  dt.setHours(0, 0, 0, 0);
                  setSelectedDateObj(dt);
                } else if (mode === "week") {
                  // try to parse a day inside the week
                  const conv = dateInputToYMD(dateInput.trim());
                  if (conv.ok) {
                    const [y, m, d] = conv.ymd!.split("-").map(x => parseInt(x, 10));
                    const dt = new Date(y, m - 1, d);
                    dt.setHours(0, 0, 0, 0);
                    setSelectedDateObj(dt);
                    setDateError("");
                    // normalize display
                    setDateInput(formatWeekDisplayFromDate(dt));
                    return;
                  }
                  // try to parse left side of " - "
                  const dashIdx = dateInput.indexOf("-");
                  if (dashIdx !== -1) {
                    const left = dateInput.slice(0, dashIdx).trim();
                    const conv2 = dateInputToYMD(left.replace(",", ""));
                    if (conv2.ok) {
                      const [y, m, d] = conv2.ymd!.split("-").map(x => parseInt(x, 10));
                      const dt = new Date(y, m - 1, d);
                      dt.setHours(0, 0, 0, 0);
                      setSelectedDateObj(dt);
                      setDateInput(formatWeekDisplayFromDate(dt));
                      setDateError("");
                      return;
                    }
                  }
                  // fallback: set to today-week
                  const dt = new Date();
                  dt.setHours(0, 0, 0, 0);
                  setSelectedDateObj(dt);
                  setDateInput(formatWeekDisplayFromDate(dt));
                } else { // month
                  const pm = parseMonthInput(dateInput.trim());
                  if (!pm.ok) {
                    setDateError(pm.message || "Invalid month");
                    // clear selected date
                    setSelectedDateObj(null);
                    return;
                  }
                  // set selectedDateObj to first day of month (useful for date picker)
                  const dt = new Date(pm.year!, pm.monthIndex!, 1);
                  dt.setHours(0, 0, 0, 0);
                  setSelectedDateObj(dt);
                  setDateError("");
                  // normalize display
                  setDateInput(formatMonthDisplayFromDate(dt));
                }
              }}
              rightIcon={require("../../../assets/icons/calender_b.png")}
              onRightIconPress={onShowNativeDatePicker}
              errorMessage={dateError}
              rightIconStyle={{ tintColor: colors.primary }}
            />
          </View>

          <View style={styles.buttonWrap}>
            <Button1 text={lang.generate_csv} width={"100%"} onPress={onGenerateCSV} />
          </View>

          <ScrollView
            style={{ marginBottom: '15%' }}
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
                // 🔹 Spinner while data loads
                <View style={{ alignItems: "center", }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ marginTop: 12, color: colors.text }}>
                    Loading attendance records...
                  </Text>
                </View>
              ) : todayRecords.length === 0 ? (
                // 🔹 Message for no data
                <Text style={styles.noDataText}>
                  {mode === "day"
                    ? "No records found for today"
                    : mode === "week"
                      ? "No records for selected week"
                      : "No records for selected month"}
                </Text>
              ) : (
                // 🔹 Render records
                todayRecords.map(
                  ({ name, start, end, checkIn, checkOut, status, date }, index) => {
                    // ✅ Format 24h → 12h
                    const formatTime12h = (time: string | null) => {
                      if (!time || !time.includes(":")) return "";
                      const [hourStr, minuteStr] = time.split(":");
                      let hour = parseInt(hourStr, 10);
                      const minute = parseInt(minuteStr, 10);
                      const ampm = hour >= 12 ? "PM" : "AM";
                      hour = hour % 12 || 12;
                      return `${hour.toString().padStart(2, "0")}:${minute
                        .toString()
                        .padStart(2, "0")} ${ampm}`;
                    };

                    // ✅ Format date → "Fri. Nov 7"
                    const formatYMDDisplay = (dateStr: string) => {
                      if (!dateStr) return "";
                      const d = new Date(dateStr);
                      if (isNaN(d.getTime())) return dateStr;
                      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                      const months = [
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
                      const dayName = days[d.getDay()];
                      const monthName = months[d.getMonth()];
                      const dateNum = d.getDate();
                      return `${dayName}. ${monthName} ${dateNum}`;
                    };

                    const dateDisplay = formatYMDDisplay(date);

                    // ✅ Time difference (hhmm)
                    const getTimeDifference = (scheduledTime: string, checkInTime: string) => {
                      if (!scheduledTime || !checkInTime) return "";
                      const [sH, sM] = scheduledTime.split(":").map(Number);
                      const [cH, cM] = checkInTime.split(":").map(Number);
                      const scheduleTotal = sH * 60 + sM;
                      const checkInTotal = cH * 60 + cM;
                      const diff = Math.abs(checkInTotal - scheduleTotal);
                      const diffHours = Math.floor(diff / 60);
                      const diffMinutes = diff % 60;
                      return `${diffHours.toString().padStart(2, "0")}h ${diffMinutes
                        .toString()
                        .padStart(2, "0")}m`; // 🔹 Added space between h and m
                    };

                    const scheduledTimeStr =
                      start && end
                        ? `${formatTime12h(start)} - ${formatTime12h(end)}`
                        : "No Schedule";

                    const actualInStr = checkIn ? formatTime12h(checkIn) : "N/A";
                    const actualOutStr = checkOut ? formatTime12h(checkOut) : "N/A";
                    const diffText = getTimeDifference(start, checkIn);

                    const statusDisplay =
                      status === "late"
                        ? "Late"
                        : status === "early"
                          ? "Early"
                          : status === "on_time"
                            ? "On Time"
                            : "No Schedule";

                    return (
                      <CartBox key={index} containerStyle={styles.detail_cartbox}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                              flex: 1,
                            }}
                          >
                            <View
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                overflow: "hidden",
                                backgroundColor: "#eee",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <Image
                                source={require("../../../assets/images/profile2.png")}
                                style={styles.profileImage}
                              />
                            </View>

                            <View style={styles.name_position}>
                              <Text style={styles.name}>{name}</Text>
                              <Text style={styles.time}>{scheduledTimeStr}</Text>
                              <Text style={styles.time}>{dateDisplay}</Text>
                            </View>
                          </View>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={
                                status === "late"
                                  ? styles.status_late
                                  : status === "early"
                                    ? styles.status_early
                                    : styles.time
                              }
                            >
                              {statusDisplay}
                            </Text>

                            {diffText ? (
                              <Text style={[styles.time1, { marginLeft: 8 }]}>
                                {diffText}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </CartBox>
                    );
                  }
                )
              )}
            </View>
          </ScrollView>

        </View>
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={selectedDateObj ?? new Date()}
          mode={mode === "month" ? ("date" as any) : "date"}
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
  Date_control_Buttons: { marginBottom: 20, flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  searchWrap: { marginBottom: 12, },
  inputWrap: { paddingBottom: 8, },
  buttonWrap: { paddingBottom: 20, },
  details: {},
  detail_cartbox: {
    width: "100%",
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    justifyContent: "flex-start"
  },
  name_position: { marginLeft: 10, width: "65%" },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 6 },
  time1: { fontSize: fonts.size.s, color: colors.primary, marginTop: 6 },
  duration: { color: colors.primary, fontWeight: fonts.weight.medium as any, fontSize: 14, marginLeft: 8 },
  status_early: {
    fontWeight: fonts.weight.medium as any,
    color: colors.status_early, // dark green text
    fontSize: fonts.size.xs,
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: colors.status_early_bg, // light green background
    borderRadius: 20, // makes it pill-shaped
    textAlign: "center",
    overflow: "hidden",
    alignSelf: "flex-start",
  },

  status_late: {
    fontWeight: fonts.weight.medium as any,
    color: colors.status_late, // dark orange/red text
    fontSize: fonts.size.xs,
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: colors.status_late_bg, // light orange/red background
    borderRadius: 20, // pill shape
    textAlign: "center",
    marginRight: 7,
    overflow: "hidden",
    alignSelf: "flex-start",
  },

  status_noschedule: {
    fontWeight: fonts.weight.regular as any,
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
  profileImage: { width: 40, height: 40, borderRadius: 20, resizeMode: "cover" },
  branchHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignSelf: 'flex-start',
    width: '90%'
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
  },
});

export default AttendancerecordScreen;
