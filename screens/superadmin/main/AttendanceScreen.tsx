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

import { getAttendanceReport, getSchedulesForRange, getUsersForBranch } from "../../../api/attendanceReport";
import { getBranchById as getBranchByIdApi } from "../../../api/Branchs";
import { getUserById } from "../../../api/profile";
import { getAttendanceAllHistory, AttendanceHistoryItem } from "../../../api/attendanceAllHistory";

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

const timeToMinutes = (hhmmss: string) => {
  if (!hhmmss) return 0;
  const parts = String(hhmmss).split(":").map((p) => parseInt(p, 10) || 0);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
};
const formatMinutesDiff = (mins: number) => {
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
const formatTime12 = (hhmmss: string) => {
  if (!hhmmss) return "";
  const [hhStr, mmStr] = String(hhmmss).split(":");
  const hh = parseInt(hhStr || "0", 10);
  const mm = mmStr || "00";
  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${ampm}`;
};

const extractFullname = (u: any): string => {
  if (!u) return "";
  // common variants
  const byOrder = [
    u.fullname,
    u.full_name,
    u.name,
    // first+last combos
    (u.firstName || u.first_name) ? `${u.firstName || u.first_name}${u.lastName || u.last_name ? ` ${u.lastName || u.last_name}` : ""}` : "",
    u.username,
    u.userName,
    u.displayName,
  ];
  for (const v of byOrder) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
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

// Helper: compute check-ins for a given branch & ymd from attendance history
const computeCheckinsForBranchAndDay = (all: AttendanceHistoryItem[] | undefined, branchId: string | null, targetYMD: string) => {
  if (!Array.isArray(all) || !branchId) return 0;
  let cnt = 0;
  const now = Date.now();
  (all || []).forEach(a => {
    const aBranchId = a.branch?.id ?? a.branch_id ?? null;
    if (!aBranchId) return;
    if (String(aBranchId) !== String(branchId)) return;
    const inVal = a.In || a.in || a.InTime || a.check_in || a.checkIn;
    if (!inVal) return;
    // normalize In to Date
    const inDt = new Date(String(inVal).replace(' ', 'T'));
    if (isNaN(inDt.getTime())) return;
    const inYMD = toYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate()));
    if (inYMD !== targetYMD) return;
    if (inDt.getTime() > now) return;
    cnt += 1;
  });
  return cnt;
};

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

  const [totalEmployeesForBranch, setTotalEmployeesForBranch] = useState<number>(0);
  const [todaysWorkingForBranch, setTodaysWorkingForBranch] = useState<number>(0);

  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [branchAttendanceCount, setBranchAttendanceCount] = useState<number>(0);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    // poll every 15s while the screen is visible (adjust ms as needed)
    const POLL_MS = 15000;
    const id = setInterval(() => {
      setVersion(v => v + 1); // triggers fetchDataForRange via your existing deps
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isFocused]);


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
  const [entries, setEntries] = useState<any[]>([]);
  const [schedulesCache, setSchedulesCache] = useState<any[]>([]);
  const [usersCache, setUsersCache] = useState<any[]>([]);

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

  const fetchDataForRange = async () => {
    if (!rangeStartEnd) return;
    if (!activeBranchId) {
      showErrorToast('Missing branchId');
      return;
    }
    setLoading(true);
    try {
      const { startDate, endDate } = rangeStartEnd;
      const [reportRows, schedules, users] = await Promise.all([
        getAttendanceReport({ branchId: activeBranchId, startDate, endDate }),
        getSchedulesForRange(startDate, endDate),
        getUsersForBranch(activeBranchId),
      ]);

      setSchedulesCache(schedules || []);
      setUsersCache(users || []);
      const reportMap = new Map<string, any>();
      const reportRowsArr = Array.isArray(reportRows) ? reportRows : (reportRows?.rows || []);
      (reportRowsArr || []).forEach((r: any) => {
        const employeeIdRaw = r.employeeId ?? r.employee_id ?? r._id ?? r.id;
        if (!employeeIdRaw) return;
        const empId = String(employeeIdRaw);
        const dateYMD = (typeof r.date === 'string' && r.date.length >= 10) ? r.date.slice(0, 10) : (r.date ? (() => {
          try { return toYMD(new Date(r.date)); } catch (e) { return ""; }
        })() : "");
        if (!dateYMD) {
          // still store by employee-only key as fallback
          reportMap.set(`${empId}:*`, r);
        } else {
          reportMap.set(`${empId}:${dateYMD}`, r);
        }
      });


      const scheduleItems = (schedules || []).map((s: any) => {
        let sDateYMD = "";
        try {
          const d = new Date(s.date);
          sDateYMD = toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        } catch (e) {
          if (typeof s.date === 'string' && s.date.length >= 10) sDateYMD = s.date.slice(0, 10);
        }
        return { raw: s, dateYMD: sDateYMD };
      }).filter((s: any) => {
        if (!s.dateYMD) return false;
        return s.dateYMD >= startDate && s.dateYMD <= endDate;
      }).map((s: any) => s.raw);

      const schedulesToShow = scheduleItems.filter((s: any) => {
        const schedBranchId = s.branch_id?._id ?? s.branch_id;
        const empBranch = s.employee_id?.branch;
        return String(schedBranchId) === String(activeBranchId) || String(empBranch) === String(activeBranchId);
      });

      const otherBranchIds = new Set<string>();
      schedulesToShow.forEach((s: any) => {
        const schedBranchId = s.branch_id?._id ?? s.branch_id;
        const empBranch = s.employee_id?.branch;
        if (empBranch && String(empBranch) !== String(schedBranchId)) {
          otherBranchIds.add(String(empBranch));
        }
      });

      const branchNameMap = new Map<string, string>();
      if (otherBranchIds.size > 0) {
        try {
          const promises: Promise<any>[] = [];
          otherBranchIds.forEach((bid) => {
            promises.push(getBranchByIdApi(bid).catch((e) => null));
          });
          const results = await Promise.all(promises);
          Array.from(otherBranchIds).forEach((bid, idx) => {
            const res = results[idx];
            if (res && res.name) branchNameMap.set(bid, res.name);
          });
        } catch (e) {
          console.warn('failed to fetch other branch names', e);
        }
      }

      const uiEntries = schedulesToShow.map((s: any, idx: number) => {
        const employeeObj = s.employee_id || s.employee || null;
        const employeeId = employeeObj?._id ?? employeeObj?.id ?? employeeObj ?? s.employee_id;
        // derive dateYMD from schedule robustly — prefer raw string slice if available
        let dateYMD = "";
        if (typeof s.date === 'string' && s.date.length >= 10) {
          dateYMD = s.date.slice(0, 10);
        } else if (s.date) {
          try {
            const d = new Date(s.date);
            dateYMD = toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
          } catch (e) {
            dateYMD = "";
          }
        }

        const empIdStr = String(employeeId ?? "");

        // find matching row (report) using map and fallbacks (reportMap built earlier)
        let row: any = null;
        if (dateYMD) row = reportMap.get(`${empIdStr}:${dateYMD}`) || null;
        if (!row) row = reportMap.get(`${empIdStr}:*`) || null;
        if (!row && Array.isArray(reportRowsArr)) {
          row = reportRowsArr.find((r: any) => {
            const rid = r.employeeId ?? r.employee_id ?? r._id ?? r.id;
            return rid && String(rid) === empIdStr;
          }) || null;
        }

        // Prefer report-provided ISO times but allow legacy keys:
        const isoIn = row?.actualIn || row?.actualInTime || row?.In || row?.InTime || row?.In || null;
        const isoOut = row?.actualOut || row?.actualOutTime || row?.Out || row?.OutTime || null;

        const makeTimeStrFromISO = (iso?: string) => {
          if (!iso) return "";
          try {
            const dt = new Date(iso);
            if (isNaN(dt.getTime())) {
              // API may already return HH:MM or ISO — return as-is if Date parsing fails
              return String(iso);
            }
            const hh = pad2Local(dt.getHours());
            const mm = pad2Local(dt.getMinutes());
            const ss = pad2Local(dt.getSeconds());
            return `${hh}:${mm}:${ss}`;
          } catch (e) {
            return String(iso || "");
          }
        };

        const work: any = {
          id: `${employeeId}_${dateYMD}_${s._id ?? s.id ?? idx}`,
          date: dateYMD || (row?.date ? String(row.date).slice(0, 10) : ""),
          check_in: makeTimeStrFromISO(isoIn),
          check_out: makeTimeStrFromISO(isoOut),
          rawActualIn: isoIn,
          rawActualOut: isoOut,
        };

        // Build schedule object — prefer schedule endpoint, fallback to report row fields
        const schedule = {
          start_time:
            s.start_time ?? s.startTime ?? s.start ??
            row?.scheduledStart ?? row?.scheduled_start ?? "00:00",
          end_time:
            s.end_time ?? s.endTime ?? s.end ??
            row?.scheduledEnd ?? row?.scheduled_end ?? "00:00",
          // keep original schedule branch shape if present
          branch_id: s.branch_id ?? s.branchId ?? null,
        };

        // Compute entry-level branch info. Prefer schedule branch, fall back to row.branchId
        const rowBranchId = row?.branchId ?? row?.branch_id ?? (row?.branch?.id ?? null);
        const rowBranchName = row?.branchName ?? row?.branchName ?? row?.branch?.name ?? row?.branch_name ?? "";

        // Determine status/diffText robustly using row.startStatus if present
        let status: "early" | "late" | "noschedule" | "not_checked_in" = "noschedule";
        let diffText = "";

        // --- compute status by comparing scheduledStart vs actualIn (robust fallback) ---
        const scheduledStartStr =
          schedule?.start_time ??
          schedule?.startTime ??
          schedule?.start ??
          rawReportRow?.scheduledStart ??
          rawReportRow?.scheduled_start ??
          row?.scheduledStart ??
          row?.scheduled_start ??
          "";

        const actualInRaw =
          work?.rawActualIn ??
          work?.check_in ??
          rawReportRow?.actualIn ??
          rawReportRow?.In ??
          rawReportRow?.InTime ??
          rawReportRow?.actualInTime ??
          "";

        const actualInStr = makeTimeStrFromISO(actualInRaw);

        // Per your rule: if either scheduled start OR actualIn is missing -> "No schedule"
        if (!scheduledStartStr || !actualInStr) {
          status = "noschedule";
          diffText = "";
        } else {
          const schedMin = timeToMinutes(scheduledStartStr);
          const checkMin = timeToMinutes(actualInStr);

          if (isNaN(schedMin) || isNaN(checkMin)) {
            // If parsing fails for either, treat as no schedule
            status = "noschedule";
            diffText = "";
          } else {
            // positive diff => employee is LATE (checked in after scheduledStart)
            // negative diff => employee is EARLY (checked in before scheduledStart)
            const diff = checkMin - schedMin;
            if (diff > 0) {
              status = "late";
              diffText = formatMinutesDiff(diff);
            } else if (diff < 0) {
              status = "early";
              diffText = formatMinutesDiff(-diff);
            } else {
              // exact on-time — choose how to display; here we treat as early with 0m
              status = "early";
              diffText = formatMinutesDiff(0);
            }
          }
        }
        // --- end replacement ---

        // Build final user object (prefer employee object fields, then users cache, then report row)
        let user = null;
        const rowName = (row?.fullname || row?.full_name || row?.name || "").toString().trim();

        if (employeeObj && typeof employeeObj === "object" && (employeeObj._id || employeeObj.id)) {
          const empNameParts = [
            employeeObj.fullname,
            employeeObj.full_name,
            employeeObj.name,
            (employeeObj.firstName || employeeObj.first_name) ? `${employeeObj.firstName || employeeObj.first_name}${employeeObj.lastName || employeeObj.last_name ? ` ${employeeObj.lastName || employeeObj.last_name}` : ""}` : ""
          ];
          const empName = (empNameParts.find(p => typeof p === 'string' && p?.trim() !== "") || "").toString().trim();
          const finalName = rowName || empName || (employeeObj.username || employeeObj.userName || "").toString().trim() || "";

          user = {
            id: employeeObj._id ?? employeeObj.id,
            _id: employeeObj._id ?? employeeObj.id,
            fullname: finalName,
            position: employeeObj.position ?? "",
            branch: employeeObj.branch ?? null,
          };
        } else {
          user = (users || []).find((u: any) => (String(u._id) === String(employeeId) || String(u.id) === String(employeeId))) || {
            id: employeeId,
            _id: employeeId,
            fullname: rowName || "",
            position: "",
            branch: null,
          };
        }

        if (!user.fullname || user.fullname.trim() === "") {
          // eslint-disable-next-line no-console
          console.warn("Attendance entry missing fullname", { employeeId: empIdStr, employeeObj, row });
        }

        // attach entry branch id/name for simple checks during render
        const entryBranchId = schedule.branch_id?._id ?? schedule.branch_id ?? s.branchId ?? s.branch_id ?? rowBranchId ?? null;
        const entryBranchName =
          (s.branchName || s.branch_name || s.branch_id?.name) ||
          rowBranchName ||
          (schedule.branch_id?.name || "") ||
          "";

        return {
          work,
          user,
          schedule,
          status,
          diffText,
          rawSchedule: s,
          rawReportRow: row,
          entryBranchId,
          entryBranchName,
        };
      });

      // Prioritise entries with actualIn (rawActualIn) — most recent actualIn first.
      // Then fall back to previous sort (schedule start_time then name).
      const sorted = uiEntries.slice().sort((a, b) => {
        const aHasIn = Boolean(a.work?.rawActualIn || a.work?.check_in);
        const bHasIn = Boolean(b.work?.rawActualIn || b.work?.check_in);

        // If one has a check-in and the other doesn't -> the one with check-in goes first
        if (aHasIn !== bHasIn) return aHasIn ? -1 : 1;

        // If both have check-ins, order by actualIn timestamp (most recent first)
        if (aHasIn && bHasIn) {
          const aTs = (() => {
            try { return new Date(a.work.rawActualIn || a.work.check_in).getTime() || 0; } catch (e) { return 0; }
          })();
          const bTs = (() => {
            try { return new Date(b.work.rawActualIn || b.work.check_in).getTime() || 0; } catch (e) { return 0; }
          })();
          if (aTs !== bTs) return bTs - aTs; // newer first
        }

        // Otherwise fallback to schedule start_time then name (original behaviour)
        const aMin = timeToMinutes(a.schedule.start_time || "00:00");
        const bMin = timeToMinutes(b.schedule.start_time || "00:00");
        if (aMin !== bMin) return aMin - bMin;

        const an = (a.user?.fullname || a.user?.username || "").toLowerCase();
        const bn = (b.user?.fullname || b.user?.username || "").toLowerCase();
        return an < bn ? -1 : (an > bn ? 1 : 0);
      });


      const totalEmployees = (users || []).filter((u: any) => u.role === 'user' || u.role === 'employee' || !u.role).length;
      setTotalEmployeesForBranch(totalEmployees);

      // compute number of scheduled staff for the selected day (only for day mode)
      const targetYMD = (rangeStartEnd && rangeStartEnd.startDate) ? rangeStartEnd.startDate : (selectedDateObj ? toYMD(selectedDateObj) : toYMD(new Date()));
      const todaySet = new Set<string>();
      (scheduleItems || []).forEach((s: any) => {
        let sDateYMD = "";
        try {
          const d = new Date(s.date);
          sDateYMD = toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        } catch (e) {
          if (typeof s.date === 'string' && s.date.length >= 10) sDateYMD = s.date.slice(0, 10);
        }
        if (sDateYMD !== targetYMD) return;
        const rid = s.employee_id?._id ?? s.employee_id;
        if (!rid) return;
        const schedBranchId = s.branch_id?._id ?? s.branch_id;
        const empBranch = s.employee_id?.branch;
        if (String(schedBranchId) === String(activeBranchId) || String(empBranch) === String(activeBranchId)) {
          todaySet.add(String(rid));
        }
      });
      setTodaysWorkingForBranch(todaySet.size);

      try {
        setAttendanceLoading(true);
        const allAttendance = await getAttendanceAllHistory();
        const todayCount = computeCheckinsForBranchAndDay(allAttendance, activeBranchId, targetYMD);
        setBranchAttendanceCount(todayCount);
      } catch (e) {
        console.warn('fetch attendance for branch failed', e);
        setBranchAttendanceCount(0);
      } finally {
        setAttendanceLoading(false);
      }

      setEntries(sorted);
    } catch (err) {
      console.warn('fetchDataForRange failed', err);
      showErrorToast('Failed to load attendance data');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeBranchId) return;
    fetchDataForRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, rangeStartEnd, version]);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
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

  const onGenerateCSV = async () => {
    if (!rangeStartEnd) {
      setDateError(lang.please_select_valid_date || 'Select a valid date');
      showErrorToast(lang.please_select_valid_date || 'Select a valid date');
      return;
    }
    try {
      // decide whether we need a Branch column:
      const includeBranchColumn = (entries || []).some((it: any) => {
        const bid = it.entryBranchId ?? it.rawReportRow?.branchId ?? null;
        return bid && String(bid) !== String(activeBranchId);
      });

      const sheetData = (entries || []).map((item: any) => {
        const u = item.user || {};
        const wh = item.work || {};
        const status = item.status === "noschedule"
          ? "No schedule"
          : item.status === "early"
            ? "Early"
            : (item.status === "not_checked_in" ? "No check-in" : "Late");

        // compute branch name to show only when branch is different from activeBranchId
        const entryBranchId = item.entryBranchId ?? item.rawReportRow?.branchId ?? null;
        const entryBranchName = item.entryBranchName ?? item.rawReportRow?.branchName ?? item.rawReportRow?.branch_name ?? "";
        const showBranch = entryBranchId && String(entryBranchId) !== String(activeBranchId);

        const baseRow: any = {
          "Staff ID": u._id || u.id || '',
          "Name": u.fullname || "",
          "Position": u.position || "",
          "Scheduled Start": item.schedule?.start_time || "",
          "Scheduled End": item.schedule?.end_time || "",
          "Check In": wh.check_in || "",
          "Check Out": wh.check_out || "",
          "Date": wh.date || "",
          "Status": status,
          "Diff": item.diffText || ""
        };

        if (includeBranchColumn) {
          baseRow["Branch"] = showBranch ? (entryBranchName || String(entryBranchId)) : "";
        }

        return baseRow;
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
      else filename = `attendance_${selectedRange.year}-${pad2(selectedRange.monthIndex + 1)}.xlsx`;

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

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(({ user }) => {
      if (!user) return false;
      const full = `${user.fullname || ''}  ${user.position || ''}`.toLowerCase();
      return full.includes(q);
    });
  }, [entries, query]);

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
                  <Text style={styles.total_count}>{todaysWorkingForBranch}</Text>
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
                    {attendanceLoading ? "..." : String(branchAttendanceCount)}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <View style={styles.details}>
              {filteredEntries.length === 0 ? (
                <Text style={styles.noDataText}>{mode === "day" ? lang.select_valid_date : (mode === "week" ? lang.No_records_for_selected_week : lang.No_records_for_selected_month)}</Text>
              ) : null}

              {filteredEntries.map(({ work, user, schedule, status, diffText, rawSchedule, rawReportRow, entryBranchId: entryBranchIdFromEntry, entryBranchName: entryBranchNameFromEntry }) => {
                const rawName = extractFullname(user);
                const displayName = rawName || "Unknown";

                const position = user?.position ?? "";
                const timeStr = `${schedule?.start_time || ''} - ${schedule?.end_time || ''}`;
                const dateDisplay = formatYMDDisplay(work.date);

                // prefer entryBranch values returned from uiEntries, but fall back to schedule/rawReportRow shapes
                const entryBranchId =
                  entryBranchIdFromEntry ??
                  (rawSchedule?.branch_id?._id ?? rawSchedule?.branch_id ?? rawSchedule?.branchId ?? rawReportRow?.branchId ?? null);

                const entryBranchName =
                  entryBranchNameFromEntry ??
                  (rawSchedule?.branchName ?? rawSchedule?.branch_name ?? rawReportRow?.branchName ?? rawReportRow?.branch_name ?? (schedule?.branch_id?.name ?? ""));

                // show header only when entry has a non-empty branch id and it's different from activeBranchId
                const showBranchHeader = entryBranchId && activeBranchId && String(entryBranchId) !== String(activeBranchId);
                let schedBranchName = "";
                if (showBranchHeader) {
                  schedBranchName = entryBranchName || String(entryBranchId);
                }

                // preserve the original "different employee branch" logic but make sure empBranchId is defined
                const schedBranchId = schedule?.branch_id?._id ?? schedule?.branch_id ?? null;
                const empBranchId = rawSchedule?.employee_id?.branch ?? rawSchedule?.employee_id?.branch_id ?? null;
                const showDifferentEmployeeBranch = empBranchId && String(empBranchId) !== String(schedBranchId);
                const differentBranchName = showDifferentEmployeeBranch ? (rawSchedule?.employee_id?.branchName || rawSchedule?.employee_id?.branch_name || "") : "";

                return (
                  <CartBox key={work.id} containerStyle={styles.detail_cartbox}>
                    {showBranchHeader ? (
                      <View style={styles.branchHeader}>
                        <Image
                          source={require("../../../assets/icons/branch.png")}
                          style={styles.branchIcon}
                          resizeMode="contain"
                        />
                        <Text style={styles.branchName} ellipsizeMode="tail" numberOfLines={1}>{schedBranchName}</Text>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: "row", alignItems: "flex-start", }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", flex: 1 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden", backgroundColor: "#eee", justifyContent: "center", alignItems: "center" }}>
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
                          <Text style={styles.status_late}>{lang.late}</Text>
                        ) : status === "early" ? (
                          <Text style={styles.status_early}>{lang.early}</Text>
                        ) : status === "not_checked_in" ? (
                          <Text style={styles.status_noschedule}>{lang.Havent_checked_in}</Text>
                        ) : (
                          <Text style={styles.status_noschedule}>{lang.no_schedule}</Text>
                        )}
                        {status !== "noschedule" && status !== "not_checked_in" ? (
                          <Text style={styles.duration}>{diffText}</Text>
                        ) : null}
                      </View>
                    </View>
                  </CartBox>
                );
              })}
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
  name_position: { marginLeft: 10, width: "65%" },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 6 },
  duration: { color: colors.primary, fontWeight: "500", fontSize: 14, marginLeft: 8 },
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
