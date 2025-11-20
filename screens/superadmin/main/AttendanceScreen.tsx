// screens/admin/main/AttendanceScreen.tsx 
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  Image,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import colors from "../../../styles/Colors";
import Header from "../../../components/Header";
import DateTimePicker from "@react-native-community/datetimepicker";
import SearchBar from "../../../components/SearchBar";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";

import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Buffer } from "buffer";
import base64 from "base-64";

import { getBranchById as getBranchByIdApi } from "../../../api/Branchs";

import { getUserById, fetchUsers, getUsers } from "../../../api/profile";
import { getSchedulesForDate, ScheduleItem } from "../../../api/schedules";
import { getAttendanceAllHistory, AttendanceHistoryItem } from "../../../api/attendanceAllHistory";
import { getBranchById } from "../../../api/Branchs";

if (typeof (global as any).Buffer === "undefined") {
  (global as any).Buffer = Buffer;
}
if (typeof (global as any).atob === "undefined") {
  (global as any).atob = (str: string) => base64.decode(str);
}
if (typeof (global as any).btoa === "undefined") {
  (global as any).btoa = (str: string) => base64.encode(str);
}

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const pad2Local = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// helpers (copy from HomeScreen_A)
const hhmmToMinutes = (hhmm: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(x => parseInt(x || '0', 10));
  return (h || 0) * 60 + (m || 0);
};
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
  const pad2Local = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad2Local(h)}h ${pad2Local(m)}m`;
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

const formatYMDDisplay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
};

const getStartOfWeekSunday = (date: Date) => {
  const day = date.getDay();
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

const formatWeekDisplayFromDate = (date: Date) => {
  const s = getStartOfWeekSunday(date);
  const e = getEndOfWeekSaturday(date);
  const sFmt = `${WEEKDAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()}`;
  const eFmt = `${WEEKDAYS[e.getDay()]}, ${MONTHS[e.getMonth()]} ${e.getDate()}`;
  return `${sFmt} - ${eFmt}`;
};

const formatMonthDisplayFromDate = (date: Date) => {
  return `${FULL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

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

const toYMD = (d: Date) => `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;
// ---------------------------- Component ---------------------------- //
const AttendanceScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  const [version, setVersion] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [mode, setMode] = useState<"day" | "week" | "month">("day");

  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const passedBranchName = route.params?.branch_name ?? route.params?.branchName ?? null;
  const activeBranchId = passedBranchId || null;
  const [branchDisplayName, setBranchDisplayName] = useState<string>(passedBranchName ?? "Branch");

  // schedules & users (HomeScreen_A style)
  const [schedulesState, setSchedulesState] = useState<ScheduleItem[]>([]);
  const [usersState, setUsersState] = useState<any[]>([]);
  const [loadingShiftData, setLoadingShiftData] = useState<boolean>(false);

  // recent checkins (this will be rendered inside detail_cartbox)
  const [recentCheckins, setRecentCheckins] = useState<
    Array<{
      attendance: AttendanceHistoryItem;
      userProfile: any | null;
      schedule?: ScheduleItem | null;
      status: "early" | "late" | "noschedule" | "not_checked_in";
      diffText: string;
      branchNameToShow?: string | null;
    }>
  >([]);

  const [loadingAttendance, setLoadingAttendance] = useState<boolean>(false);

  const defaultToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const defaultDateDisplay = `${WEEKDAYS[defaultToday.getDay()]}, ${MONTHS[defaultToday.getMonth()]} ${defaultToday.getDate()}`;

  const prevDateRef = useRef<string>(defaultDateDisplay);
  const [dateInput, setDateInput] = useState<string>(defaultDateDisplay);
  const [dateError, setDateError] = useState<string>("");
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(defaultToday);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const handleDateTextChange = (raw: string) => {
    const prev = prevDateRef.current || "";
    const isDeleting = raw.length < prev.length;
    let s = raw.replace(/[^A-Za-z0-9, ]/g, "");
    s = s.replace(/^\s+/, "");
    if (isDeleting) {
      setDateInput(s);
      prevDateRef.current = s;
      if (mode === "day") {
        const conv = dateInputToYMD(s);
        if (conv.ok) setDateError("");
      } else if (mode === "month") {
        const conv = parseMonthInput(s);
        if (conv.ok) setDateError("");
      }
      return;
    }
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

  const onShowNativeDatePicker = () => setShowDatePicker(true);
  const onNativeDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(0, 0, 0, 0);
      setSelectedDateObj(selectedDate);
      if (mode === "day") {
        const wd = WEEKDAYS[selectedDate.getDay()];
        const mon = MONTHS[selectedDate.getMonth()];
        const day = selectedDate.getDate();
        const fmt = `${wd}, ${mon} ${day}`;
        setDateInput(fmt);
      } else if (mode === "week") {
        setDateInput(formatWeekDisplayFromDate(selectedDate));
      } else {
        setDateInput(formatMonthDisplayFromDate(selectedDate));
      }
      setDateError("");
      prevDateRef.current = dateInput;
    }
  };
  const [loadingData, setLoadingData] = useState<boolean>(false);

  const selectedRange = useMemo(() => {
    const baseDate = selectedDateObj ?? new Date();
    try {
      if (mode === "day") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) return { type: "day" as const, ymd: conv.ymd! };
        if (selectedDateObj) {
          return { type: "day" as const, ymd: `${selectedDateObj.getFullYear()}-${pad2(selectedDateObj.getMonth() + 1)}-${pad2(selectedDateObj.getDate())}` };
        }
        return null;
      } else if (mode === "week") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) {
          const [y, m, d] = conv.ymd!.split("-").map(x => parseInt(x, 10));
          const dt = new Date(y, m - 1, d);
          const s = getStartOfWeekSunday(dt);
          const e = getEndOfWeekSaturday(dt);
          return { type: "week" as const, startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
        }
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
        const s = getStartOfWeekSunday(baseDate);
        const e = getEndOfWeekSaturday(baseDate);
        return { type: "week" as const, startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
      } else {
        const pm = parseMonthInput(dateInput.trim());
        if (pm.ok) {
          return { type: "month" as const, year: pm.year!, monthIndex: pm.monthIndex! };
        }
        const dt = selectedDateObj ?? baseDate;
        return { type: "month" as const, year: dt.getFullYear(), monthIndex: dt.getMonth() };
      }
    } catch (e) {
      return null;
    }
  }, [mode, dateInput, selectedDateObj, version]);

  const rangeStartEnd = useMemo(() => {
    if (!selectedRange) return null;
    if (selectedRange.type === "day") return { startDate: selectedRange.ymd, endDate: selectedRange.ymd };
    if (selectedRange.type === "week") return { startDate: selectedRange.startYmd, endDate: selectedRange.endYmd };
    if (selectedRange.type === "month") {
      const y = selectedRange.year;
      const mi = selectedRange.monthIndex;
      const start = `${y}-${pad2(mi + 1)}-01`;
      const endDt = new Date(y, mi + 1, 0);
      const end = `${y}-${pad2(mi + 1)}-${pad2(endDt.getDate())}`;
      return { startDate: start, endDate: end };
    }
    return null;
  }, [selectedRange]);

  // REPLACE existing TotalstaffCount with this
  const TotalstaffCount = useMemo(() => {
    if (!Array.isArray(schedulesState) || schedulesState.length === 0 || !activeBranchId) return 0;

    const pad2Local = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMDLocal = (d: Date) =>
      `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;

    const uniqueEmpIds = new Set<string>();

    // Determine the target YMD for "day" mode; fall back to selectedDateObj or today
    let targetYmdForDay = toYMD(new Date());
    if (selectedRange && selectedRange.type === "day" && rangeStartEnd) {
      targetYmdForDay = rangeStartEnd.startDate;
    } else if (selectedDateObj) {
      targetYmdForDay = `${selectedDateObj.getFullYear()}-${pad2Local(selectedDateObj.getMonth() + 1)}-${pad2Local(selectedDateObj.getDate())}`;
    }

    schedulesState.forEach((s) => {
      if (!s?.date) return;

      const sDate = new Date(s.date);
      const sYMD = toYMDLocal(sDate);

      // branch id can be object or string
      const branchIdOfSchedule = typeof s.branch_id === 'object' && s.branch_id !== null ? (s.branch_id as any)._id || s.branch_id : s.branch_id ?? null;

      if (!branchIdOfSchedule) return;
      if (String(branchIdOfSchedule) !== String(activeBranchId)) return;

      // Only count schedules for the selected day (when in day mode)
      if (mode === "day") {
        if (sYMD !== targetYmdForDay) return;
      }

      const empId = typeof s.employee_id === 'object' && s.employee_id !== null 
        ? (s.employee_id as any)._id || s.employee_id
        : s.employee_id ?? null;
      if (empId) uniqueEmpIds.add(String(empId));
    });

    return uniqueEmpIds.size;
  }, [schedulesState, activeBranchId, selectedRange, rangeStartEnd, selectedDateObj, mode]);


  // Derived: total employees scheduled for the active branch (only role === 'user')
  const totalScheduledEmployees = useMemo(() => {
    const uniqueEmpIds = new Set<string>();
    schedulesState.forEach((s) => {
      const empId = typeof s.employee_id === 'object' && s.employee_id !== null 
        ? (s.employee_id as any)._id || s.employee_id
        : s.employee_id ?? null;
      if (empId) uniqueEmpIds.add(String(empId));
    });

    return uniqueEmpIds.size;
  }, [schedulesState, activeBranchId]);

  // helper to convert a start/end yyyy-mm-dd into an array of ymd strings
  const ymdRangeToArray = (startYmd: string, endYmd: string) => {
    const out: string[] = [];
    const [sy, sm, sd] = startYmd.split('-').map(n => parseInt(n, 10));
    const [ey, em, ed] = endYmd.split('-').map(n => parseInt(n, 10));
    let cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    while (cur.getTime() <= end.getTime()) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      out.push(`${y}-${pad(m)}-${pad(d)}`);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  };

  // fetch schedules + users for the given date range (array of ymd), populates schedulesState & usersState
  const fetchShiftData = async (branchIdToUse: string | null, targetDates: string[]): Promise<{ schedules: any[]; users: any[] }> => {
    if (!branchIdToUse) {
      setSchedulesState([]);
      setUsersState([]);
      return { schedules: [], users: [] };
    }
    setLoadingShiftData(true);
    try {
      // fetch schedules for each date in targetDates and flatten
      const promises = targetDates.map(d => getSchedulesForDate(d).catch(() => []));
      const results = await Promise.all(promises);
      const allScheds = ([] as any[]).concat(...results);
      setSchedulesState(allScheds ?? []);

      // fetch users list (getUsers or fetchUsers depending on your API)
      let usersArr: any[] = [];
      try {
        usersArr = await getUsers({ limit: 1000 });
      } catch (e) {
        try {
          const r = await fetchUsers({ branchId: branchIdToUse, role: "user", limit: 1000, page: 1 });
          usersArr = r?.users ?? [];
        } catch (er) {
          usersArr = [];
        }
      }
      setUsersState(usersArr ?? []);

      return { schedules: allScheds ?? [], users: usersArr ?? [] };
    } catch (e) {
      console.warn("fetchShiftData failed", e);
      setSchedulesState([]);
      setUsersState([]);
      return { schedules: [], users: [] };
    } finally {
      setLoadingShiftData(false);
    }
  };

  const fetchAttendanceAndEnrich = async (
    branchIdToUse: string | null,
    targetDates: string[],
    schedulesArg?: any[],
    usersArg?: any[]
  ) => {
    if (!branchIdToUse) {
      setRecentCheckins([]);
      return;
    }

    try {
      const all = await getAttendanceAllHistory();
      const now = new Date();
      const targetSet = new Set(targetDates);

      // Use passed-in schedules/users if provided, else fall back to state
      const schedulesLocal = Array.isArray(schedulesArg) ? schedulesArg : (schedulesState || []);
      const usersLocal = Array.isArray(usersArg) ? usersArg : (usersState || []);

      // small cache for branch lookups to avoid repeated network calls
      const branchCache = new Map<string, any>();

      const filtered = (all || []).filter((a) => {
        const aBranchId = a.branch?.id ?? a.branch_id ?? null;
        if (!aBranchId) return false;
        if (String(aBranchId) !== String(branchIdToUse)) return false;
        const inVal = a.In || a.In || a.In || a.In || a.In;
        if (!inVal) return false;
        const inDt = new Date(String(inVal).replace(' ', 'T'));
        if (isNaN(inDt.getTime())) return false;
        const inYMD = `${inDt.getFullYear()}-${(inDt.getMonth() + 1).toString().padStart(2, '0')}-${inDt.getDate().toString().padStart(2, '0')}`;
        if (!targetSet.has(inYMD)) return false;
        if (inDt.getTime() > now.getTime()) return false;
        return true;
      });

      // newest first
      filtered.sort((a, b) => (a.In < b.In ? 1 : -1));

      const enriched: Array<{
        attendance: AttendanceHistoryItem;
        userProfile: any | null;
        schedule?: ScheduleItem | null;
        status: "early" | "late" | "noschedule" | "not_checked_in";
        diffText: string;
        branchNameToShow?: string | null;
      }> = await Promise.all(filtered.map(async (att) => {
        const uid = att.user?.id ?? att.user;
        // try to get userProfile from the provided users list first
        let userProfile = usersLocal.find((u) => String(u._id) === String(uid) || String((u as any).id) === String(uid));
        if (!userProfile && uid) {
          try { userProfile = await getUserById(uid); } catch (e) { userProfile = null; }
        }

        // find schedule for this user on that date from schedulesLocal
        const inDt = new Date(String(att.In).replace(' ', 'T'));
        const inYMD = `${inDt.getFullYear()}-${(inDt.getMonth() + 1).toString().padStart(2, '0')}-${inDt.getDate().toString().padStart(2, '0')}`;
        const schedule = schedulesLocal.find((s: any) => {
          const empId = typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id._id : s.employee_id;
          const sDate = s.date ? (() => {
            try { const dd = new Date(s.date); return `${dd.getFullYear()}-${(dd.getMonth() + 1).toString().padStart(2, '0')}-${dd.getDate().toString().padStart(2, '0')}`; } catch (e) { return null; }
          })() : null;
          if (!empId || !uid || !sDate) return false;
          return String(empId) === String(uid) && sDate === inYMD;
        }) ?? null;

        // compute status & diffText
        let status: "early" | "late" | "noschedule" | "not_checked_in" = "noschedule";
        let diffText = "00h 00m";

        try {
          const parseStripSeconds = (ts?: string | null) => {
            if (!ts) return null;
            try {
              const d = new Date(String(ts).replace(' ', 'T'));
              if (isNaN(d.getTime())) return null;
              d.setSeconds(0, 0);
              return d;
            } catch (e) {
              return null;
            }
          };

          const inDT = parseStripSeconds(att.In);
          const outDT = parseStripSeconds(att.Out);
          const nowDT = new Date();
          nowDT.setSeconds(0, 0);

          if (!inDT) {
            status = "not_checked_in";
            diffText = formatMinutesDiff(0);
          } else {
            const endDt = outDT && !Number.isNaN(outDT.getTime()) ? outDT : nowDT;
            let diffMinutes = Math.floor((endDt.getTime() - inDT.getTime()) / 60000);
            if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) diffMinutes = 0;
            diffText = formatMinutesDiff(diffMinutes);

            if (schedule && schedule.start_time) {
              const schedMin = hhmmToMinutes(schedule.start_time);
              const inMin = datetimeToMinutes(att.In || String(inDT));
              if (isNaN(schedMin) || isNaN(inMin)) {
                status = "early";
              } else {
                const startDiff = inMin - schedMin;
                status = startDiff > 0 ? "late" : "early";
              }
            } else {
              status = "noschedule";
            }
          }
        } catch (err) {
          status = "noschedule";
          diffText = formatMinutesDiff(0);
        }

        // branchNameToShow logic with cache
        let branchNameToShow: string | null = null;
        try {
          if (userProfile) {
            const userBranchId = typeof userProfile.branch === "string" ? userProfile.branch : userProfile.branch?._id ?? null;
            const userBranchName = typeof userProfile.branch === "object" ? userProfile.branch?.name ?? null : null;
            if (userBranchId && String(userBranchId) !== String(branchIdToUse)) {
              if (branchCache.has(String(userBranchId))) {
                branchNameToShow = branchCache.get(String(userBranchId))?.name ?? userBranchName ?? null;
              } else {
                const b = await getBranchById(userBranchId).catch(() => null);
                if (b) branchCache.set(String(userBranchId), b);
                branchNameToShow = userBranchName || b?.name || null;
              }
            }
          } else if (att.branch_id) {
            const bid = String(att.branch_id);
            if (branchCache.has(bid)) {
              const b = branchCache.get(bid);
              if (b && String(b._id) !== String(branchIdToUse)) branchNameToShow = b?.name ?? null;
            } else {
              const b = await getBranchById(att.branch_id).catch(() => null);
              if (b) branchCache.set(bid, b);
              if (b && String(b._id) !== String(branchIdToUse)) branchNameToShow = b?.name ?? null;
            }
          }
        } catch (err) {
          branchNameToShow = null;
        }

        return { attendance: att, userProfile, schedule, status, diffText, branchNameToShow };
      }));

      setRecentCheckins(enriched);
    } catch (e) {
      console.warn("fetchAttendanceAndEnrich failed", e);
      setRecentCheckins([]);
    }
  };


  useEffect(() => {
    let mounted = true;
    (async () => {
      if (passedBranchName) return;
      if (!activeBranchId) return;
      try {
        const b = await getBranchByIdApi(activeBranchId);
        if (!mounted) return;
        if (b && b.name) setBranchDisplayName(b.name);
      } catch (e) {
        console.warn('getBranchByIdApi failed', e);
      }
    })();
    return () => { mounted = false; };
  }, [activeBranchId, passedBranchName]);

  // useEffect(() => {
  //   if (!activeBranchId || !rangeStartEnd) return;

  //   // build array of target ymd strings depending on rangeStartEnd
  //   let targetDates: string[] = [];
  //   if (selectedRange?.type === "day") {
  //     targetDates = [rangeStartEnd.startDate]; // single day
  //   } else if (selectedRange?.type === "week" || selectedRange?.type === "month") {
  //     targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
  //   } else {
  //     const todayYMDLocal = toYMD(new Date());
  //     targetDates = [todayYMDLocal];
  //   }

  //   let cancelled = false;
  //   (async () => {
  //     try {
  //       setLoadingData(true);
  //       setRefreshing(true);

  //       // 1) fetch schedules & users and get them back
  //       const { schedules, users } = await fetchShiftData(activeBranchId, targetDates);
  //       if (cancelled) return;

  //       // 2) enrich attendance with the freshly fetched schedules & users
  //       await fetchAttendanceAndEnrich(activeBranchId, targetDates, schedules, users);
  //     } catch (err) {
  //       console.warn("fetch data error", err);
  //     } finally {
  //       if (!cancelled) {
  //         setLoadingData(false);
  //         setRefreshing(false);
  //       }
  //     }
  //   })();

  //   return () => { cancelled = true; };
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [activeBranchId, rangeStartEnd, version]);

  useEffect(() => {
  if (!activeBranchId || !rangeStartEnd) return;

  // build array of target ymd strings depending on rangeStartEnd
  let targetDates: string[] = [];
  if (selectedRange?.type === "day") {
    targetDates = [rangeStartEnd.startDate]; // single day
  } else if (selectedRange?.type === "week" || selectedRange?.type === "month") {
    targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
  } else {
    const todayYMDLocal = toYMD(new Date());
    targetDates = [todayYMDLocal];
  }

  let cancelled = false;
  (async () => {
    try {
      setLoadingData(true);

      // 1) fetch schedules & users and get them back
      const { schedules, users } = await fetchShiftData(activeBranchId, targetDates);
      if (cancelled) return;

      // 2) enrich attendance with the freshly fetched schedules & users
      await fetchAttendanceAndEnrich(activeBranchId, targetDates, schedules, users);
    } catch (err) {
      console.warn("fetch data error", err);
    } finally {
      if (!cancelled) {
        setLoadingData(false);
      }
    }
  })();

  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeBranchId, rangeStartEnd, version]);


  // const onRefresh = async () => {
  //   setRefreshing(true);
  //   await new Promise((r) => setTimeout(r, 400));
  //   setQuery("");
  //   setDateError("");
  //   setSelectedDateObj(defaultToday);
  //   if (mode === "day") {
  //     setDateInput(defaultDateDisplay);
  //   } else if (mode === "week") {
  //     setDateInput(formatWeekDisplayFromDate(defaultToday));
  //   } else {
  //     setDateInput(formatMonthDisplayFromDate(defaultToday));
  //   }
  //   prevDateRef.current = "";
  //   setVersion((v) => v + 1);
  //   setRefreshing(false);
  // };

  const onRefresh = async () => {
  if (!activeBranchId || !rangeStartEnd) {
    return;
  }

  // build array of target ymd strings depending on rangeStartEnd
  let targetDates: string[] = [];
  if (selectedRange?.type === "day") {
    targetDates = [rangeStartEnd.startDate];
  } else if (selectedRange?.type === "week" || selectedRange?.type === "month") {
    targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
  } else {
    targetDates = [toYMD(new Date())];
  }

  try {
    setLoadingData(true);

    const { schedules, users } = await fetchShiftData(activeBranchId, targetDates);
    await fetchAttendanceAndEnrich(activeBranchId, targetDates, schedules, users);
  } catch (err) {
    console.warn("refresh error", err);
  } finally {
    setLoadingData(false);
  }
};


  // REPLACE your existing onGenerateCSV with this
  const onGenerateCSV = async () => {
    if (!rangeStartEnd) {
      setDateError(lang.please_select_valid_date || 'Select a valid date');
      showErrorToast(lang.please_select_valid_date || 'Select a valid date');
      return;
    }

    try {
      // Use scheduleEntries (not recentCheckins) so we include everyone scheduled (including no In)
      // scheduleEntries items: { schedule, userProfile, attendance, status, diffText, branchNameToShow, dateYmd, empId }
      const dataToExport = scheduleEntries || [];

      // Build rows. Always include Branch column (empty if same as activeBranchId)
      const sheetData = dataToExport.map((it) => {
        const sched = it.schedule || {};
        const user = it.userProfile || {};
        const att = it.attendance || {}; // may be null

        // Determine branch id/name candidates:
        const schedBranchId = sched.branch_id?._id ?? sched.branch_id ?? null;
        const schedBranchName = sched.branch_id?.name ?? sched.branch_name ?? "";
        const userBranchId = (user?.branch && typeof user.branch === "object") ? user.branch._id : (typeof user?.branch === "string" ? user.branch : null);
        const userBranchName = (user?.branch && typeof user.branch === "object") ? user.branch.name : null;
        // attendance branch
        const attBranchId = att?.branch_id ?? att?.branch?.id ?? null;
        const attBranchName = att?.branch?.name ?? null;

        // pick branch to show when different from activeBranchId
        let branchToShow = "";
        if (String(userBranchId || "") !== String(activeBranchId || "") && userBranchId) branchToShow = userBranchName || String(userBranchId);
        else if (String(attBranchId || "") !== String(activeBranchId || "") && attBranchId) branchToShow = attBranchName || String(attBranchId);
        else if (String(schedBranchId || "") !== String(activeBranchId || "") && schedBranchId) branchToShow = schedBranchName || String(schedBranchId);

        // Status string
        let statusStr = "";
        if (it.status === "not_checked_in") statusStr = lang.Havent_checked_in || "Haven't checked in";
        else if (it.status === "noschedule") statusStr = "No schedule";
        else if (it.status === "early") statusStr = "Early";
        else if (it.status === "late") statusStr = "Late";
        else statusStr = String(it.status || "");

        // Check-in/out values — attendance shape uses In/Out fields (from all-history)
        const checkIn = att?.In || att?.in || att?.InTime || "";
        const checkOut = att?.Out || att?.out || att?.OutTime || "";

        // Date -> prefer schedule dateYmd then attendance In date
        const dateVal = it.dateYmd || (checkIn ? String(checkIn).split(' ')[0] : "");

        return {
          "Staff ID": user._id || user.id || (sched.employee_id?._id ?? sched.employee_id ?? it.empId) || '',
          "Name": (user.fullname || user.full_name || user.username || sched.employee_id?.username || ""),
          "Position": user.position || "",
          "Scheduled Start": sched.start_time || "",
          "Scheduled End": sched.end_time || "",
          "Check In": checkIn,
          "Check Out": checkOut,
          "Date": dateVal || "",
          "Status": statusStr,
          "Diff": it.diffText || "00h 00m",
          "Branch": branchToShow || ""
        };
      });

      // create workbook + write (same as before)
      const ws = XLSX.utils.json_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      const wboutBinary = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
      const buf = Buffer.from(wboutBinary, "binary");
      const wboutBase64 = buf.toString("base64");

      let filename = "attendance.xlsx";
      if (selectedRange?.type === "day") filename = `attendance_${selectedRange.ymd}.xlsx`;
      else if (selectedRange?.type === "week") filename = `attendance_${selectedRange.startYmd}_to_${selectedRange.endYmd}.xlsx`;
      else if (selectedRange?.type === "month") filename = `attendance_${selectedRange.year}-${pad2(selectedRange.monthIndex + 1)}.xlsx`;

      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + filename;
      const enc: any =
        (FileSystem as any).EncodingType && (FileSystem as any).EncodingType.Base64
          ? (FileSystem as any).EncodingType.Base64
          : "base64";

      await FileSystem.writeAsStringAsync(fileUri, wboutBase64, { encoding: enc });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: filename,
        });
        showSuccessToast(lang.csv_prepared || "Excel prepared");
      } else {
        showSuccessToast("File saved to: " + fileUri);
      }
    } catch (err) {
      console.warn("XLSX/Expo error", err);
      showErrorToast("Failed to prepare Excel file");
    }
  };


  // Build schedule-based entries (show schedules even if no attendance In)
  const scheduleEntries = useMemo(() => {
    if (!Array.isArray(schedulesState) || !activeBranchId || !rangeStartEnd) return [];

    // create set of target dates (YMD) for the currently selected range
    let targetDates: string[] = [];
    if (selectedRange?.type === "day") {
      targetDates = [rangeStartEnd.startDate];
    } else if (selectedRange?.type === "week" || selectedRange?.type === "month") {
      targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
    } else {
      targetDates = [toYMD(new Date())];
    }
    const targetSet = new Set(targetDates);

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const ymdOf = (d: any) => {
      if (!d) return null;
      try {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      } catch (e) {
        return null;
      }
    };

    // helper to match attendance for a given employee & date
    const findAttendanceFor = (empId: any, ymd: string) => {
      if (!empId) return null;
      return (recentCheckins || []).find((r) => {
        const att = r.attendance;
        const uid = att?.user?.id ?? att?.user;
        if (!uid) return false;
        // match by id strings
        const empIdStr = String(empId);
        const uidStr = String(uid);
        if (empIdStr !== uidStr) return false;
        // match date
        const inVal = att?.In || att?.In || att?.In || att?.In || att?.In;
        if (!inVal) return false;
        const inYmd = String(inVal).split(' ')[0];
        return inYmd === ymd;
      }) || null;
    };

    const out: Array<any> = [];

    schedulesState.forEach((s: any) => {
      const sYMD = ymdOf(s.date);
      if (!sYMD || !targetSet.has(sYMD)) return;

      // schedule branch id can be object or string
      const schedBranchId = s.branch_id?._id ?? s.branch_id ?? null;
      if (!schedBranchId) return;
      if (String(schedBranchId) !== String(activeBranchId)) return;

      // employee id can be object or string
      const empId = typeof s.employee_id === 'object' && s.employee_id !== null 
        ? (s.employee_id as any)._id || s.employee_id
        : s.employee_id ?? null;
      // find optional attendance matching this schedule
      const matchedAttObj = findAttendanceFor(empId, sYMD); // may be null

      // attempt to resolve userProfile from usersState (if available)
      const userProfile = (usersState || []).find((u: any) => String(u._id) === String(empId) || String((u as any).id) === String(empId)) || null;

      // If matchedAttObj exists use its status/diffText, else mark as not_checked_in
      const status = matchedAttObj ? matchedAttObj.status : "not_checked_in";
      const diffText = matchedAttObj ? (matchedAttObj.diffText || "00h 00m") : "00h 00m";

      // determine branch name to show for header: if user's branch differs from activeBranchId
      let branchNameToShow: string | null = null;
      try {
        const userBranch = userProfile?.branch;
        const userBranchId = typeof userBranch === "string" ? userBranch : userBranch?._id ?? null;
        const userBranchName = typeof userBranch === "object" ? userBranch?.name ?? null : null;
        if (userBranchId && String(userBranchId) !== String(activeBranchId)) {
          branchNameToShow = userBranchName || null;
        }
      } catch (e) {
        branchNameToShow = null;
      }

      out.push({
        schedule: s,
        userProfile,
        attendance: matchedAttObj ? matchedAttObj.attendance : null,
        status,
        diffText,
        branchNameToShow,
        // convenience fields for rendering
        dateYmd: sYMD,
        empId: empId,
      });
    });

    // stable order: schedule start_time then employee username
    out.sort((a, b) => {
      const aMin = hhmmToMinutes(a.schedule?.start_time || "00:00");
      const bMin = hhmmToMinutes(b.schedule?.start_time || "00:00");
      if (aMin !== bMin) return aMin - bMin;
      const an = (a.userProfile?.fullname || a.userProfile?.username || a.schedule?.employee_id?.username || "").toLowerCase();
      const bn = (b.userProfile?.fullname || b.userProfile?.username || b.schedule?.employee_id?.username || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });

    return out;
  }, [schedulesState, recentCheckins, usersState, activeBranchId, rangeStartEnd]);


  const filteredScheduleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scheduleEntries;
    return scheduleEntries.filter((it) => {
      const name = (it.userProfile?.fullname || it.userProfile?.username || it.schedule?.employee_id?.username || "").toString().toLowerCase();
      const pos = (it.userProfile?.position || "").toString().toLowerCase();
      return name.includes(q) || pos.includes(q);
    });
  }, [scheduleEntries, query]);

  const filteredRecent = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentCheckins;
    return recentCheckins.filter(({ userProfile }) => {
      if (!userProfile) return false;
      const full = `${userProfile.fullname || ''} ${userProfile.position || ''} ${userProfile.username || ''}`.toLowerCase();
      return full.includes(q);
    });
  }, [recentCheckins, query]);

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

  const nowBg = mode === "day" ? undefined : colors.background;
  const weekBg = mode === "week" ? undefined : colors.background;
  const monthBg = mode === "month" ? undefined : colors.background;
  const nowTextColor = mode === "day" ? colors.secondary : colors.subtext;
  const weekTextColor = mode === "week" ? colors.secondary : colors.subtext;
  const monthTextColor = mode === "month" ? colors.secondary : colors.subtext;

  return (
    <View style={styles.outer}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: 'image',
          url: require('../../../assets/icons/back_b.png'),
          width: 24,
          height: 24,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: 'text', value: lang.Attendance, color: colors.text }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={{ flexDirection: 'row', marginBottom: 12, alignItems: "center", width: '90%' }}>
            <Image
              source={require("../../../assets/icons/branch_b_withbg.png")}
              style={styles.icon}
            />
            <Text style={styles.branchName} ellipsizeMode="tail" numberOfLines={1}> {branchDisplayName}</Text>
          </View>

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
              label={mode === "day" ? lang.date_label : (mode === "week" ? lang.Week : lang.Month)}
              placeholder={mode === "day" ? "Thu, Aug 18" : (mode === "week" ? "Sun, Oct 12 - Sat, Oct 18" : "October 2025")}
              value={dateInput}
              setValue={handleDateTextChange}
              onBlur={() => {
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
                  const conv = dateInputToYMD(dateInput.trim());
                  if (conv.ok) {
                    const [y, m, d] = conv.ymd!.split("-").map(x => parseInt(x, 10));
                    const dt = new Date(y, m - 1, d);
                    dt.setHours(0, 0, 0, 0);
                    setSelectedDateObj(dt);
                    setDateError("");
                    setDateInput(formatWeekDisplayFromDate(dt));
                    return;
                  }
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
                  const dt = new Date();
                  dt.setHours(0, 0, 0, 0);
                  setSelectedDateObj(dt);
                  setDateInput(formatWeekDisplayFromDate(dt));
                } else {
                  const pm = parseMonthInput(dateInput.trim());
                  if (!pm.ok) {
                    setDateError(pm.message || "Invalid month");
                    setSelectedDateObj(null);
                    return;
                  }
                  const dt = new Date(pm.year!, pm.monthIndex!, 1);
                  dt.setHours(0, 0, 0, 0);
                  setSelectedDateObj(dt);
                  setDateError("");
                  setDateInput(formatMonthDisplayFromDate(dt));
                }
              }}
              rightIcon={require("../../../assets/icons/calender_b.png")}
              onRightIconPress={onShowNativeDatePicker}
              errorMessage={dateError}
              rightIconStyle={{ tintColor: colors.primary }}
            />

            {mode === "day" && (
              <View style={styles.boxes}>
                <CartBox containerStyle={styles.staff}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Image
                      source={require("../../../assets/icons/totalstaff_b.png")}
                      style={styles.icon}
                    />
                    <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
                  </View>
                  <Text style={styles.total_count}>{loadingData ? "..." : TotalstaffCount}</Text>

                </CartBox>

                <CartBox containerStyle={styles.staff}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Image
                      source={require("../../../assets/icons/staff_tik_g.png")}
                      style={styles.icon}
                    />
                    <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
                  </View>

                  <Text style={styles.shift_count}>
                    {loadingData ? "..." : String(recentCheckins.length)}
                  </Text>

                </CartBox>
              </View>
            )}
          </View>

          <View style={styles.buttonWrap}>
            <Button1 text={lang.generate_csv} width={"100%"} onPress={onGenerateCSV} />
          </View>
          <ScrollView
            style={{}}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <View style={styles.details}>
              {loadingData ? (
                // show centered loader inside the scroll area while we fetch
                <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <>
                  {filteredScheduleEntries.length === 0 ? (
                    <Text style={styles.noDataText}>
                      {mode === "day" ? lang.select_valid_date : (mode === "week" ? lang.No_records_for_selected_week : lang.No_records_for_selected_month)}
                    </Text>
                  ) : null}

                  {!loadingData && filteredScheduleEntries.map(({ schedule, userProfile, attendance, status, diffText, branchNameToShow, dateYmd }) => {
                    const displayName = userProfile?.fullname ?? userProfile?.username ?? schedule?.employee_id?.username ?? 'Unknown';
                    const startTime = schedule?.start_time ? formatTime12(schedule.start_time) : "-";
                    const endTime = schedule?.end_time ? formatTime12(schedule.end_time) : "";
                    const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;
                    const dateDisplay = formatYMDDisplay(dateYmd || toYMD(new Date()));

                    // If attendance provided, attendance may be object with In/Out; else leave blank
                    const att = attendance || {};
                    const key = att?.id ?? `${displayName}_${dateYmd}`;

                    return (
                      <CartBox key={key} containerStyle={styles.detail_cartbox}>
                        {branchNameToShow ? (
                          <View style={styles.branchHeader}>
                            <Image source={require("../../../assets/icons/branch.png")} style={styles.branchIcon} resizeMode="contain" />
                            <Text style={styles.branchName} numberOfLines={1} ellipsizeMode="tail">{branchNameToShow}</Text>
                          </View>
                        ) : null}

                        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                          <View style={{ flexDirection: "row", alignItems: "flex-start", flex: 1 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden", justifyContent: "center", alignItems: "center" }}>
                              <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />
                            </View>

                            <View style={styles.name_position}>
                              <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
                              <Text style={styles.time}>{timeStr}</Text>
                              <Text style={styles.time}>{dateDisplay}</Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                            {status === "late" ? (
                              <Text style={styles.status_late} ellipsizeMode="tail" numberOfLines={1}>{lang.late}</Text>
                            ) : status === "early" ? (
                              <Text style={styles.status_early} ellipsizeMode="tail" numberOfLines={1}>{lang.early}</Text>
                            ) : (
                              <Text style={styles.status_noschedule} ellipsizeMode="tail" numberOfLines={1}>{lang.Havent_checked_in}</Text>
                            )}
                            <Text style={styles.duration} ellipsizeMode="tail" numberOfLines={1}>{diffText}</Text>
                          </View>
                        </View>
                      </CartBox>
                    );
                  })}
                </>
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
      {loading && (
        <View style={{ justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: '30%', right: 0, bottom: 0, }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.secondary },
  container: { marginHorizontal: 20, flex: 1 },
  body: { flex: 1, paddingTop: 20, },
  Date_control_Buttons: { marginBottom: 20, flexDirection: 'row', width: '100%', justifyContent: 'space-between', },
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
  name_position: { marginLeft: 10, width: "75%", },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 6, width: 150 },
  duration: { color: colors.primary, fontWeight: "500", fontSize: 14, marginLeft: 8, width: 50 },
  status_early: {
    fontWeight: fonts.weight.regular as any,
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
    fontWeight: fonts.weight.regular as any,
    color: colors.status_late,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_late_bg,
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
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
    width: 100

  },
  noDataText: { textAlign: "center", color: colors.subtext, marginTop: 12 },
  profileImage: { width: 40, height: 40, borderRadius: 20, resizeMode: "cover" },
  branchHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignSelf: 'flex-start',
    width: '90%',
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
  icon: {
    width: 30,
    height: 30,
    marginRight: 8
  },
  boxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  total_staff: {
    color: colors.search,
    fontWeight: fonts.weight.regular as any,
    fontSize: 14,
    width: "75%"
  },
  total_count: {
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.xxl,
    color: colors.primary,
    marginTop: 8,
  },
  shift_count: {
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.xxl,
    color: colors.text,
    marginTop: 8,
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
    borderEndWidth: 1
  },

});

export default AttendanceScreen;
