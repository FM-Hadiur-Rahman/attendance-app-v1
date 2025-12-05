// screens/admin/main/AttendanceScreen.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Platform,
  Image,
  Dimensions,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from "../../../styles/Colors";
import Header from "../../../components/Header";
import DateTimePicker from "@react-native-community/datetimepicker";
import SearchBar from "../../../components/SearchBar";
import { useNavigation, useRoute } from "@react-navigation/native";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";

import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Buffer } from "buffer";

import { getBranchById as getBranchByIdApi } from "../../../api/Branchs";
import { getUserById, fetchUsers, getUsers } from "../../../api/profile";
import { getSchedulesForDate } from "../../../api/schedules";
import { getAttendanceAllHistory } from "../../../api/attendanceAllHistory";
import { getBranchById } from "../../../api/Branchs";
import fonts from "../../../styles/Fonts";

// --------------------
// Lightweight domain types (explicit, no `any`)
// Use string | null for optional missing values (no `undefined`).
// Keep fields that this screen reads/writes only.
// --------------------

interface BranchRef {
  _id?: string;
  name?: string;
}
interface EmployeeRef {
  _id?: string;
  username?: string;
}
interface ScheduleItem {
  _id?: string;
  date: string;
  branch_id: string | BranchRef;
  employee_id: string | EmployeeRef;
  start_time?: string;
  end_time?: string;
  branch_name: string;
}
interface UserProfileItem {
  _id?: string;
  fullname?: string;
  username?: string;
  position?: string;
  branch?: string | BranchRef;
}
interface AttendanceItem {
  id?: string;
  In: string;
  Out?: string | null;
  user?: { id?: string } | null;
  branch?: { id?: string; name?: string } | null;
  branch_id?: string;
}
interface EnrichedEntry {
  attendance: AttendanceItem | null;
  userProfile: UserProfileItem | null;
  schedule: ScheduleItem | null;
  status: string;
  diffText: string;
  branchNameToShow: string | null;
  dateYmd?: string;
  empId?: string | number | null;
}

type DateConv = { ok: true; ymd: string } | { ok: false; message: string };
type SelectedRangeDay = { type: "day"; ymd: string };
type SelectedRangeWeek = { type: "week"; startYmd: string; endYmd: string };
type SelectedRangeMonth = { type: "month"; year: number; monthIndex: number };
type SelectedRange = SelectedRangeDay | SelectedRangeWeek | SelectedRangeMonth | null;

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// ------------------------
// Caching helpers
// ------------------------
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function readCache(key: string): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || typeof parsed.ts !== "number") {
      await AsyncStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.ts > CACHE_TTL) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn("readCache error", key, e);
    try { await AsyncStorage.removeItem(key); } catch (_) { }
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    console.warn("writeCache error", key, e);
  }
}

async function removeCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn("removeCache error", key, e);
  }
}

function cacheKeySchedules(branchId: string, startYmd?: string, endYmd?: string): string {
  return `schedules:${branchId}:${startYmd || "single"}:${endYmd || "single"}`;
}
function cacheKeyUsers(branchId: string): string {
  return `users:branch:${branchId}`;
}
function cacheKeyAttendance(branchId: string, startYmd?: string, endYmd?: string): string {
  return `attendance:${branchId}:${startYmd || "single"}:${endYmd || "single"}`;
}
// ------------------------
// Utility helpers
// ------------------------
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
const pad2Local = pad2;

const hhmmToMinutes = (hhmm?: string | null): number => {
  if (!hhmm) return 0;
  const parts = hhmm.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
const datetimeToMinutes = (datetime?: string | Date | null): number => {
  if (!datetime) return 0;
  const parts = String(datetime).split(' ');
  if (parts.length < 2) return 0;
  const time = parts[1].split(':');
  const h = parseInt(time[0] || '0', 10);
  const m = parseInt(time[1] || '0', 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

const formatMinutesDiff = (minsInput?: number): string => {
  const mins = Math.abs(Math.round(minsInput || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(h)}h ${pad(m)}m`;
};

const formatTime12 = (t?: string | Date | null): string => {
  if (!t) return "";
  let hh = 0;
  let mm = "00";
  if (String(t).includes(' ')) {
    const timePart = String(t).split(' ')[1];
    const [h, m] = timePart.split(':');
    hh = parseInt(h || "0", 10);
    mm = m || "00";
  } else {
    const [h, m] = String(t).split(':');
    hh = parseInt(h || "0", 10);
    mm = m || "00";
  }
  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${ampm}`;
};

const dateInputToYMD = (display?: string): DateConv => {
  if (!display || display.trim() === "") return { ok: false, message: "Empty date" };
  const cleaned = display.replace(",", "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length !== 3) return { ok: false, message: "Use format: Ddd, Mmm DD" };
  const [wd, mon, dayStr] = parts;
  const wdLower = wd.slice(0, 3).toLowerCase();
  const monLower = mon.slice(0, 3).toLowerCase();
  if (!["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(wdLower))
    return { ok: false, message: "Weekday must be 3-letter (Mon..Sun)" };
  const monIndex = MONTHS.findIndex((m) => m.toLowerCase() === monLower);
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

const formatYMDDisplay = (ymd: string | null | undefined) => {
  if (!ymd) return "";
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

const formatMonthDisplayFromDate = (date: Date) => `${FULL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;

const parseMonthInput = (display: string | undefined): { ok: false; message: string } | { ok: true; year: number; monthIndex: number } => {
  if (!display || display.trim() === "") return { ok: false, message: "Empty" };
  const tokens = display.trim().split(/\s+/);
  const mTok = tokens[0].slice(0, 3).toLowerCase();
  const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === mTok);
  if (monthIndex === -1) return { ok: false, message: "Invalid month" };
  let year = new Date().getFullYear();
  if (tokens.length >= 2) {
    const y = parseInt(tokens[1], 10);
    if (!isNaN(y)) year = y;
  }
  return { ok: true, year, monthIndex };
};

const toYMD = (d: Date) => `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;

interface Props { langId?: string }

const AttendanceScreen: React.FC<Props> = (props: Props) => {
  const navigation = useNavigation();
  const route = useRoute<any>();

  const propLangId = props?.langId;
  const routeLangId = route?.params?.langId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as Record<string, any>)[langId];

  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"day" | "week" | "month">("day");

  const passedBranchId = route?.params?.branch_id ?? route?.params?.branchId ?? null;
  const passedBranchName = route?.params?.branch_name ?? route?.params?.branchName ?? null;
  const activeBranchId = passedBranchId || null;
  const [branchDisplayName, setBranchDisplayName] = useState(passedBranchName ?? "Branch");

  const [schedulesState, setSchedulesState] = useState<ScheduleItem[]>([]);
  const [usersState, setUsersState] = useState<UserProfileItem[]>([]);

  const [recentCheckins, setRecentCheckins] = useState<EnrichedEntry[]>([]);
  const defaultToday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const defaultDateDisplay = `${WEEKDAYS[defaultToday.getDay()]}, ${MONTHS[defaultToday.getMonth()]} ${defaultToday.getDate()}`;

  const prevDateRef = useRef<string>(defaultDateDisplay);
  const [dateInput, setDateInput] = useState<string>(defaultDateDisplay);
  const [dateError, setDateError] = useState<string>("");
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(defaultToday); // allow null
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Selected range memo
  const selectedRange = useMemo<SelectedRange | null>(() => {
    const baseDate = selectedDateObj || new Date();
    try {
      if (mode === "day") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) return { type: "day", ymd: conv.ymd };
        if (selectedDateObj) return { type: "day", ymd: `${selectedDateObj.getFullYear()}-${pad2(selectedDateObj.getMonth() + 1)}-${pad2(selectedDateObj.getDate())}` };
        return null;
      } else if (mode === "week") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) {
          const [y, m, d] = conv.ymd.split("-").map((x) => parseInt(x, 10));
          const dt = new Date(y, m - 1, d);
          const s = getStartOfWeekSunday(dt);
          const e = getEndOfWeekSaturday(dt);
          return { type: "week", startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
        }
        const dashIdx = dateInput.indexOf("-");
        if (dashIdx !== -1) {
          const left = dateInput.slice(0, dashIdx).trim();
          const conv2 = dateInputToYMD(left.replace(",", ""));
          if (conv2.ok) {
            const [y, m, d] = conv2.ymd.split("-").map((x) => parseInt(x, 10));
            const dt = new Date(y, m - 1, d);
            const s = getStartOfWeekSunday(dt);
            const e = getEndOfWeekSaturday(dt);
            return { type: "week", startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
          }
        }
        const s = getStartOfWeekSunday(baseDate);
        const e = getEndOfWeekSaturday(baseDate);
        return { type: "week", startYmd: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`, endYmd: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` };
      } else {
        const pm = parseMonthInput(dateInput.trim());
        if (pm.ok) return { type: "month", year: pm.year, monthIndex: pm.monthIndex };
        const dt = selectedDateObj || baseDate;
        return { type: "month", year: dt.getFullYear(), monthIndex: dt.getMonth() };
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
      // assert month shape
      const sr = selectedRange as SelectedRangeMonth;
      const y = sr.year;
      const mi = sr.monthIndex;
      const start = `${y}-${pad2(mi + 1)}-01`;
      const endDt = new Date(y, mi + 1, 0);
      const end = `${y}-${pad2(mi + 1)}-${pad2(endDt.getDate())}`;
      return { startDate: start, endDate: end };
    }
    return null;
  }, [selectedRange]);

  // Convert start/end into array of YMD
  const ymdRangeToArray = (startYmd: string, endYmd: string): string[] => {
    const out: string[] = [];
    const [sy, sm, sd] = startYmd.split('-').map((n) => parseInt(n, 10));
    const [ey, em, ed] = endYmd.split('-').map((n) => parseInt(n, 10));
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

  // Total staff count memo (based on schedulesState)
  const TotalstaffCount = useMemo(() => {
    if (!Array.isArray(schedulesState) || schedulesState.length === 0 || !activeBranchId) return 0;
    const uniqueEmpIds = new Set<string>();
    let targetYmdForDay = toYMD(new Date());
    if (selectedRange && selectedRange.type === "day" && rangeStartEnd) {
      targetYmdForDay = rangeStartEnd.startDate;
    } else if (selectedDateObj) {
      targetYmdForDay = `${selectedDateObj.getFullYear()}-${pad2Local(selectedDateObj.getMonth() + 1)}-${pad2Local(selectedDateObj.getDate())}`;
    }

    schedulesState.forEach((s: ScheduleItem) => {
      if (!s?.date) return;
      const sDate = new Date(s.date);
      const sYMD = `${sDate.getFullYear()}-${pad2Local(sDate.getMonth() + 1)}-${pad2Local(sDate.getDate())}`;
      const branchIdOfSchedule = (typeof s.branch_id === 'object' && s.branch_id !== null) ? (s.branch_id as BranchRef)._id : String(s.branch_id);
      if (!branchIdOfSchedule) return;
      if (String(branchIdOfSchedule) !== String(activeBranchId)) return;
      if (mode === "day") {
        if (sYMD !== targetYmdForDay) return;
      }
      const empId = (typeof s.employee_id === 'object' && s.employee_id !== null) ? (s.employee_id as EmployeeRef)._id : String(s.employee_id);
      if (empId) uniqueEmpIds.add(String(empId));
    });

    return uniqueEmpIds.size;
  }, [schedulesState, activeBranchId, selectedRange, rangeStartEnd, selectedDateObj, mode]);

  // ----- fetchShiftData uses caching for schedules + users -----
  const fetchShiftData = async (branchIdToUse: string | null, targetDates: string[]): Promise<{ schedules: ScheduleItem[]; users: UserProfileItem[] }> => {
    if (!branchIdToUse) {
      setSchedulesState([]);
      setUsersState([]);
      return { schedules: [], users: [] };
    }
    try {
      const start = targetDates[0];
      const end = targetDates[targetDates.length - 1] || start;
      const schedulesCacheKey = cacheKeySchedules(branchIdToUse, start, end);
      const cached = await readCache(schedulesCacheKey);
      let fetchedSchedules: ScheduleItem[] = Array.isArray(cached) ? (cached as ScheduleItem[]) : [];

      if (!Array.isArray(fetchedSchedules) || fetchedSchedules.length === 0) {
        // fetch schedules for each date
        const promises = targetDates.map((d: string) => getSchedulesForDate(d).catch(() => [] as unknown));
        const results = await Promise.all(promises);
        // flatten results, assert to ScheduleItem[]
        const flat = ([] as unknown[]).concat(...results);
        fetchedSchedules = flat as ScheduleItem[];
        await writeCache(schedulesCacheKey, fetchedSchedules);
      }
      setSchedulesState(fetchedSchedules || []);

      // users cache per branch
      const usersCacheKey = cacheKeyUsers(branchIdToUse);
      const usersCached = await readCache(usersCacheKey);
      let usersArr: UserProfileItem[] = Array.isArray(usersCached) ? (usersCached as UserProfileItem[]) : [];

      if (!Array.isArray(usersArr) || usersArr.length === 0) {
        // try getUsers with big limit first
        try {
          const r = await getUsers({ limit: 1000 }) as UserProfileItem[] | { users: UserProfileItem[] };
          usersArr = Array.isArray(r) ? (r as UserProfileItem[]) : (r && 'users' in r ? (r.users as UserProfileItem[]) : []);
        } catch (err) {
          // fallback to fetchUsers
          try {
            const r = await fetchUsers({ branchId: branchIdToUse, role: "user,staff", limit: 1000, page: 1 });
            usersArr = Array.isArray(r?.users) ? (r.users as UserProfileItem[]) : [];
          } catch (er) {
            usersArr = [];
          }
        }
        await writeCache(usersCacheKey, usersArr);
      }
      setUsersState(usersArr || []);
      return { schedules: fetchedSchedules || [], users: usersArr || [] };
    } catch (e) {
      console.warn("fetchShiftData failed", e);
      setSchedulesState([]);
      setUsersState([]);
      return { schedules: [], users: [] };
    }
  };

  // ----- fetchAttendanceAndEnrich uses caching for attendance filtered per branch+range -----
  const fetchAttendanceAndEnrich = async (branchIdToUse: string | null, targetDates: string[], schedulesArg?: ScheduleItem[], usersArg?: UserProfileItem[]) => {
    if (!branchIdToUse) {
      setRecentCheckins([]);
      return;
    }
    try {
      const start = targetDates[0];
      const end = targetDates[targetDates.length - 1] || start;
      const attendanceCacheKey = cacheKeyAttendance(branchIdToUse, start, end);
      const cached = await readCache(attendanceCacheKey);
      let filtered: AttendanceItem[] = Array.isArray(cached) ? (cached as AttendanceItem[]) : [];

      if (!Array.isArray(filtered) || filtered.length === 0) {
        const allRaw = await getAttendanceAllHistory();
        const all = Array.isArray(allRaw) ? (allRaw as unknown[]) : [];
        const now = new Date();
        const targetSet = new Set(targetDates);

        filtered = (all as unknown[]).filter((aRaw) => {
          const a = aRaw as AttendanceItem;
          const aBranchId = (a.branch && typeof a.branch === "object") ? (a.branch as { id?: string }).id : (a.branch_id ? ((a.branch_id as BranchRef)._id ?? String(a.branch_id)) : null);
          if (!aBranchId) return false;
          if (String(aBranchId) !== String(branchIdToUse)) return false;
          const inVal = a.In;
          if (!inVal) return false;
          const inDt = new Date(String(inVal).replace(' ', 'T'));
          if (isNaN(inDt.getTime())) return false;
          const inYMD = `${inDt.getFullYear()}-${(inDt.getMonth() + 1).toString().padStart(2, '0')}-${inDt.getDate().toString().padStart(2, '0')}`;
          if (!targetSet.has(inYMD)) return false;
          if (inDt.getTime() > now.getTime()) return false;
          return true;
        }).map((x) => x as AttendanceItem);

        // newest first
        filtered.sort((a: AttendanceItem, b: AttendanceItem) => {
          const ai = a.In ?? "";
          const bi = b.In ?? "";
          return ai < bi ? 1 : -1;
        });
        await writeCache(attendanceCacheKey, filtered);
      }

      // Use schedulesArg/usersArg if provided otherwise from state
      const schedulesLocal = Array.isArray(schedulesArg) ? schedulesArg : (schedulesState || []);
      const usersLocal = Array.isArray(usersArg) ? usersArg : (usersState || []);

      // small cache for branch lookups locally
      const branchCache = new Map<string, BranchRef | null>();

      const enriched: EnrichedEntry[] = await Promise.all((filtered || []).map(async (att: AttendanceItem) => {
        const uid = (att.user && typeof att.user === "object") ? att.user.id : (typeof att.user === "string" ? att.user : null);
        let userProfile = (usersLocal || []).find((u) => u._id === String(uid ?? "")) ?? null;
        if (!userProfile && uid) {
          try { userProfile = await getUserById(uid) as UserProfileItem; } catch (e) { userProfile = null; }
        }

        const inDt = new Date(String(att.In).replace(' ', 'T'));
        const inYMD = `${inDt.getFullYear()}-${(inDt.getMonth() + 1).toString().padStart(2, '0')}-${inDt.getDate().toString().padStart(2, '0')}`;

        const schedule = (schedulesLocal || []).find((s) => {
          const empId = (typeof s.employee_id === 'object' && s.employee_id !== null) ? (s.employee_id as EmployeeRef)._id : String(s.employee_id);
          let sDate: string | null = null;
          if (s.date) {
            try {
              const dd = new Date(s.date);
              sDate = `${dd.getFullYear()}-${(dd.getMonth() + 1).toString().padStart(2, '0')}-${dd.getDate().toString().padStart(2, '0')}`;
            } catch (err) { sDate = null; }
          }
          if (!empId || !uid || !sDate) return false;
          return String(empId) === String(uid) && sDate === inYMD;
        }) || null;

        let status = "noschedule";
        let diffText = "00h 00m";

        try {
          const parseStripSeconds = (ts: string | undefined | null): Date | null => {
            if (!ts) return null;
            try {
              const d = new Date(String(ts).replace(' ', 'T'));
              if (isNaN(d.getTime())) return null;
              d.setSeconds(0, 0);
              return d;
            } catch (e) { return null; }
          };
          const inDT = parseStripSeconds(att.In);
          const outDT = parseStripSeconds(att.Out ?? null);
          const nowDT = new Date();
          nowDT.setSeconds(0, 0);

          if (!inDT) {
            status = "not_checked_in";
            diffText = formatMinutesDiff(0);
          } else {
            const endDt = (outDT && !Number.isNaN(outDT.getTime())) ? outDT : nowDT;
            let diffMinutes = Math.floor((endDt.getTime() - inDT.getTime()) / 60000);
            if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) diffMinutes = 0;
            diffText = formatMinutesDiff(diffMinutes);

            if (schedule && schedule.start_time) {
              const schedMin = hhmmToMinutes(schedule.start_time);
              const inMin = datetimeToMinutes(att.In ?? String(inDT));
              if (Number.isNaN(schedMin) || Number.isNaN(inMin)) {
                status = "early";
              } else {
                const startDiff = inMin - schedMin;
                if (startDiff > 0) status = "late";
                else if (startDiff === 0) status = "ontime";
                else status = "early";
              }
            } else {
              status = "noschedule";
            }
          }
        } catch (err) {
          status = "noschedule";
          diffText = formatMinutesDiff(0);
        }

        // branchNameToShow logic
        let branchNameToShow: string | null = null;
        try {
          if (userProfile) {
            const userBranchId = (typeof userProfile.branch === "string") ? userProfile.branch : (userProfile.branch && userProfile.branch._id) ?? null;
            const userBranchName = (typeof userProfile.branch === "object") ? userProfile.branch.name ?? null : null;
            if (userBranchId && String(userBranchId) !== String(branchIdToUse)) {
              if (branchCache.has(String(userBranchId))) {
                branchNameToShow = branchCache.get(String(userBranchId))?.name ?? userBranchName ?? null;
              } else {
                const b = await getBranchById(String(userBranchId)).catch(() => null);
                if (b) branchCache.set(String(userBranchId), b as BranchRef);
                branchNameToShow = userBranchName || b?.name || null;
              }
            }
          } else if (att.branch_id) {
            const bid = String(att.branch_id);
            if (branchCache.has(bid)) {
              const b = branchCache.get(bid);
              if (b && String(b._id) !== String(branchIdToUse)) branchNameToShow = b?.name ?? null;
            } else {
              const b = await getBranchById(att.branch_id as string).catch(() => null);
              if (b) branchCache.set(bid, b as BranchRef);
              if (b && String((b as BranchRef)._id) !== String(branchIdToUse)) branchNameToShow = (b as BranchRef)?.name ?? null;
            }
          }
        } catch (err) {
          branchNameToShow = null;
        }

        return { attendance: att, userProfile: userProfile || null, schedule, status, diffText, branchNameToShow };
      }));

      setRecentCheckins(enriched);
    } catch (e) {
      console.warn("fetchAttendanceAndEnrich failed", e);
      setRecentCheckins([]);
    }
  };

  // When branch display name missing, try to fetch
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (passedBranchName) return;
      if (!activeBranchId) return;
      try {
        const b = await getBranchByIdApi(activeBranchId);
        if (!mounted) return;
        if (b && (b as BranchRef).name) setBranchDisplayName((b as BranchRef).name ?? branchDisplayName);
      } catch (e) {
        console.warn('getBranchByIdApi failed', e);
      }
    })();
    return () => { mounted = false; };
  }, [activeBranchId, passedBranchName]);

  // Main data loading effect (respects cache)
  useEffect(() => {
    if (!activeBranchId || !rangeStartEnd) return;

    let targetDates: string[] = [];
    if (selectedRange?.type === "day") {
      targetDates = [rangeStartEnd.startDate];
    } else if (selectedRange?.type === "week" || selectedRange?.type === "month") {
      targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
    } else {
      targetDates = [toYMD(new Date())];
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadingData(true);
        const { schedules, users } = await fetchShiftData(activeBranchId, targetDates);
        if (cancelled) return;
        await fetchAttendanceAndEnrich(activeBranchId, targetDates, schedules, users);
      } catch (err) {
        console.warn("fetch data error", err);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeBranchId, rangeStartEnd, version]);

  // onRefresh clears relevant caches and reloads fresh data
  const onRefresh = async () => {
    if (!activeBranchId || !rangeStartEnd) return;
    let targetDates: string[] = [];
    if (selectedRange?.type === "day") targetDates = [rangeStartEnd.startDate];
    else if (selectedRange?.type === "week" || selectedRange?.type === "month") targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
    else targetDates = [toYMD(new Date())];

    const start = targetDates[0];
    const end = targetDates[targetDates.length - 1] || start;

    // clear schedules/users/attendance caches for this range/branch
    await removeCache(cacheKeySchedules(activeBranchId, start, end));
    await removeCache(cacheKeyAttendance(activeBranchId, start, end));
    // optionally clear users cache for branch so we get fresh users
    await removeCache(cacheKeyUsers(activeBranchId));

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

  // CSV / Excel export (kept largely same)
  const onGenerateCSV = async () => {
    if (!rangeStartEnd) {
      setDateError(lang.please_select_valid_date || 'Select a valid date');
      showErrorToast(lang.please_select_valid_date || 'Select a valid date');
      return;
    }
    try {
      const dataToExport = scheduleEntries || [];

      const sheetData = dataToExport.map((it: any, rowIndex: number) => {
        const sched = it.schedule || {};
        const user = it.userProfile || {};
        const att = it.attendance || {};

        const checkIn = att?.In || "";
        const dateVal = it.dateYmd || (checkIn ? String(checkIn).split(' ')[0] : "");

        return {
          "Staff ID": (rowIndex + 1).toString(),
          "Name": user.fullname || "",
          "Position": user.position || "",
          "Scheduled Start": sched.start_time || "",
          "Scheduled End": sched.end_time || "",
          "Check In": checkIn,
          "Check Out": att?.Out || "",
          "Date": dateVal || "",
          "Status": (() => {
            if (it.status === "not_checked_in") return "Absent";
            if (it.status === "noschedule") return "No schedule";
            if (it.status === "early") return "Early";
            if (it.status === "late") return "Late";
            if (it.status === "ontime") return "On Time";
            return String(it.status || "");
          })(),
          "Duration": it.diffText || "00h 00m",
          "From": it.branchNameToShow || ""
        };
      });

      const ws = XLSX.utils.json_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      const wboutBinary = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
      const buf = Buffer.from(wboutBinary, "binary");
      const wboutBase64 = buf.toString("base64");

      let filename = "attendance.xlsx";
      if (selectedRange?.type === "day") filename = `attendance_${selectedRange.ymd}.xlsx`;
      else if (selectedRange?.type === "week") filename = `attendance_${selectedRange.startYmd}_to_${selectedRange.endYmd}.xlsx`;
      else if (selectedRange?.type === "month") {
        const sr = selectedRange as SelectedRangeMonth;
        filename = `attendance_${sr.year}-${pad2(sr.monthIndex + 1)}.xlsx`;
      }

      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + filename;
      const enc = (FileSystem.EncodingType && FileSystem.EncodingType.Base64 as any) ? FileSystem.EncodingType.Base64 : "base64";

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
  const scheduleEntries = useMemo<EnrichedEntry[]>(() => {
    if (!Array.isArray(schedulesState) || !activeBranchId || !rangeStartEnd) return [];

    let targetDates: string[] = [];
    if (selectedRange?.type === "day") targetDates = [rangeStartEnd.startDate];
    else if (selectedRange?.type === "week" || selectedRange?.type === "month") targetDates = ymdRangeToArray(rangeStartEnd.startDate, rangeStartEnd.endDate);
    else targetDates = [toYMD(new Date())];
    const targetSet = new Set(targetDates);

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const ymdOf = (d: string | Date | null | undefined): string | null => {
      if (!d) return null;
      try {
        const dt = new Date(d as string);
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      } catch (e) {
        return null;
      }
    };

    const findAttendanceFor = (empId: string | number | null, ymd: string) => {
      if (!empId) return null;
      return (recentCheckins || []).find((r) => {
        const att = r.attendance;
        const uid = att
          ? ((att.user && typeof att.user === "object") ? att.user.id : (typeof att.user === "string" ? att.user : null))
          : null;
        if (!uid) return false;
        const empIdStr = String(empId);
        const uidStr = String(uid);
        if (empIdStr !== uidStr) return false;
        const inVal = att?.In;
        if (!inVal) return false;
        const inYmd = String(inVal).split(' ')[0];
        return inYmd === ymd;
      }) || null;
    };

    const out: EnrichedEntry[] = [];
    schedulesState.forEach((s: ScheduleItem) => {
      const sYMD = ymdOf(s.date);
      if (!sYMD || !targetSet.has(sYMD)) return;

      const schedBranchId = (s.branch_id && typeof s.branch_id === "object") ? s.branch_id._id : String(s.branch_id);
      if (!schedBranchId) return;
      if (String(schedBranchId) !== String(activeBranchId)) return;

      const empId = (typeof s.employee_id === 'object' && s.employee_id !== null) ? s.employee_id._id : String(s.employee_id);
      const matchedAttObj = findAttendanceFor(empId ?? null, sYMD);
      const userProfile = (usersState || []).find((u) => String(u._id) === String(empId)) || null;

      const status = matchedAttObj ? matchedAttObj.status : "not_checked_in";
      const diffText = matchedAttObj ? (matchedAttObj.diffText || "00h 00m") : "00h 00m";

      let branchNameToShow: string | null = null;
      try {
        const userBranch = userProfile?.branch;
        const userBranchId = (typeof userBranch === "string") ? userBranch : (userBranch && (userBranch as BranchRef)._id) ?? null;
        const userBranchName = (typeof userBranch === "object") ? (userBranch as BranchRef).name ?? null : null;
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
        dateYmd: sYMD,
        empId: empId,
      });
    });

    out.sort((a: EnrichedEntry, b: EnrichedEntry) => {
      const aMin = hhmmToMinutes(a.schedule?.start_time || "00:00");
      const bMin = hhmmToMinutes(b.schedule?.start_time || "00:00");
      if (aMin !== bMin) return aMin - bMin;
      const an = (a.userProfile?.fullname || (a.schedule && typeof a.schedule.employee_id === "object" ? a.schedule.employee_id.username : "")) || "";
      const bn = ((b.userProfile?.fullname || (b.schedule && typeof b.schedule.employee_id === "object" ? b.schedule.employee_id.username : "")) || "").toLowerCase();
      return an.toLowerCase() < bn ? -1 : an.toLowerCase() > bn ? 1 : 0;
    });

    return out;
  }, [schedulesState, recentCheckins, usersState, activeBranchId, rangeStartEnd]);

  const filteredScheduleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scheduleEntries;
    return scheduleEntries.filter((it) => {
      const name = (it.userProfile?.fullname || "").toString().toLowerCase();
      const pos = (it.userProfile?.position || "").toString().toLowerCase();
      return name.includes(q) || pos.includes(q);
    });
  }, [scheduleEntries, query]);

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
  const onNativeDateChange = (event: unknown, selectedDate?: Date) => {
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
    const dt = selectedDateObj || new Date();
    const fmt = formatWeekDisplayFromDate(dt);
    setDateInput(fmt);
    setDateError("");
    setVersion(v => v + 1);
  };

  const onSelectMonth = () => {
    setMode("month");
    const dt = selectedDateObj || new Date();
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
          onPress: () => (navigation as any).goBack(),
        }}
        center={{ type: 'text', value: lang.Attendance, color: colors.text }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={{ flexDirection: 'row', marginBottom: 12, alignItems: "center", width: '90%' }}>
            <Image source={require("../../../assets/icons/branch_b_withbg.png")} style={styles.icon} />
            <Text style={styles.branchName} ellipsizeMode="tail" numberOfLines={1}> {branchDisplayName}</Text>
          </View>

          <View style={styles.Date_control_Buttons}>
            <Button1 text={lang.Now} onPress={onSelectNow} width={'30%'} backgroundColor={nowBg} textStyle={{ color: nowTextColor }} />
            <Button1 text={lang.Week} onPress={onSelectWeek} width={'30%'} backgroundColor={weekBg} textStyle={{ color: weekTextColor }} />
            <Button1 text={lang.Month} onPress={onSelectMonth} width={'30%'} backgroundColor={monthBg} textStyle={{ color: monthTextColor }} />
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
                  const [y, m, d] = conv.ymd.split("-").map((x) => parseInt(x, 10));
                  const dt = new Date(y, m - 1, d);
                  dt.setHours(0, 0, 0, 0);
                  setSelectedDateObj(dt);
                } else if (mode === "week") {
                  const conv = dateInputToYMD(dateInput.trim());
                  if (conv.ok) {
                    const [y, m, d] = conv.ymd.split("-").map((x) => parseInt(x, 10));
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
                      const [y, m, d] = conv2.ymd.split("-").map((x) => parseInt(x, 10));
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
                  const dt = new Date(pm.year, pm.monthIndex, 1);
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
                    <Image source={require("../../../assets/icons/totalstaff_b.png")} style={styles.icon} />
                    <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
                  </View>
                  <Text style={styles.total_count}>{loadingData ? "..." : TotalstaffCount}</Text>
                </CartBox>

                <CartBox containerStyle={styles.staff}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Image source={require("../../../assets/icons/staff_tik_g.png")} style={styles.icon} />
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
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <View style={styles.details}>
              {loadingData ? (
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

                  {!loadingData && filteredScheduleEntries.map(({ schedule, userProfile, attendance, status, diffText, branchNameToShow, dateYmd }, idx) => {
                    const displayName = (userProfile && (userProfile.fullname || userProfile.username)) ?? (schedule && (typeof schedule.employee_id === "object" ? (schedule.employee_id as EmployeeRef).username : String(schedule.employee_id))) ?? 'Unknown';
                    const startTime = schedule?.start_time ? formatTime12(schedule.start_time) : "-";
                    const endTime = schedule?.end_time ? formatTime12(schedule.end_time) : "";
                    const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;
                    const dateDisplay = formatYMDDisplay(dateYmd || toYMD(new Date()));
                    const att = attendance || ({} as AttendanceItem);
                    const idPart = att?.id ?? userProfile?._id ?? (schedule && (typeof schedule.employee_id === "object" ? (schedule.employee_id as EmployeeRef)._id : String(schedule.employee_id))) ?? displayName;
                    const key = `${String(idPart)}_${String(dateYmd)}_${idx}`;

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
                              <Text style={styles.status_late} ellipsizeMode="tail" numberOfLines={1}>
                                {lang.late}
                              </Text>
                            ) : status === "early" || status === "ontime" ? (
                              <Text style={styles.status_early} ellipsizeMode="tail" numberOfLines={1}>
                                {status === "ontime" ? (lang.on_time || "On Time") : lang.early}
                              </Text>
                            ) : (
                              <Text style={styles.status_noschedule} ellipsizeMode="tail" numberOfLines={1}>
                                {lang.Absent}
                              </Text>
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
          mode={mode === "month" ? "date" : "date"}
          display={Platform.OS === "ios" ? "spinner" : "calendar"}
          onChange={onNativeDateChange}
        />
      )}
      {loading && (
        <View style={{ justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: '30%', right: 0, bottom: 0 }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <Toast config={toastConfig} />
    </View>
  );
};

export default AttendanceScreen;

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
  name_position: { marginLeft: 10, width: "70%" },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 6, width: 150 },
  duration: { color: colors.primary, fontWeight: "500", fontSize: 14, marginLeft: 12, width: 70, },
  status_early: {
    fontWeight: fonts.weight.regular,
    color: colors.status_early,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_early_bg,
    borderRadius: 10,
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
    textAlign: "center",
  },
  noDataText: { textAlign: "center", color: colors.subtext, marginTop: 12 },
  profileImage: { width: 40, height: 40, borderRadius: 20, resizeMode: "cover" },
  branchHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignSelf: 'flex-start',
    alignItems: "center",
    width: '90%',
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 4,
    alignSelf: "center",
  },
  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
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
    fontWeight: fonts.weight.regular,
    fontSize: 14,
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


