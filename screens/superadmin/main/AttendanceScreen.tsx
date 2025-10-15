// screens/admin/main/AttendancerecordScreen.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Share,
  Platform,
  Image,
  Dimensions,
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
import { workHours } from "../../../api/WorkHours";
import { users } from '../../../api/Users';
import { workHours as workHoursArr } from "../../../api/WorkHours";
import { schedules as schedulesArr } from "../../../api/Schedule";
import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { Buffer } from "buffer";
import base64 from "base-64";

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
const formatMinutesDiff = (mins: number) => {
  const abs = Math.abs(Math.round(mins));
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
const formatYMDDisplay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
};

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

const AttendanceScreen: React.FC = (props: any) => {
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
  const [query, setQuery] = useState<string>("");

  // refresh
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // MODE: "day" | "week" | "month"
  const [mode, setMode] = useState<"day" | "week" | "month">("day");

  // i think delete
  // derive current admin user & branch id from incoming userId param
  const currentUser = usersArr.find(u => u.id === userId) || null;
  const currentBranchId = currentUser?.branch_id ?? null;

    // ---------- NEW: use passed branch params (superadmin passes branch_id & branch_name) ----------
  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const passedBranchName = route.params?.branch_name ?? route.params?.branchName ?? null;

  // activeBranchId = param branch_id (if provided) otherwise fallback to admin's branch (if any)
  const activeBranchId = passedBranchId || currentBranchId || null;

  // display name prefers passedBranchName, fallback to lookup by id, otherwise generic
  const branchDisplayName =
    passedBranchName ||
    (activeBranchId ? getBranchById(activeBranchId)?.name : "Branch") ||
    "Branch";
  // ----------------------------------------------------------------------------------------------

    // total employees for this selected branch (used in the small CartBox)
  const totalEmployeesForBranch = useMemo(
    () => {
      if (!activeBranchId) return 0;
      return usersArr.filter(u => u.role === "employee" && u.branch_id === activeBranchId).length;
    },
    [version, activeBranchId]
  );

  // today's unique working employees for this branch (filter workHours for today's date and this branch)
  const todaysWorkingForBranch = useMemo(() => {
    if (!activeBranchId) return 0;

    // compute today's Y-M-D locally (avoids ordering issues)
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const y = t.getFullYear();
    const m = (t.getMonth() + 1).toString().padStart(2, "0");
    const d = t.getDate().toString().padStart(2, "0");
    const todaysYMD = `${y}-${m}-${d}`;

    const set = new Set<string>();
    workHoursArr.forEach(w => {
      if (w.date === todaysYMD) {
        const u = usersArr.find(us => us.id === w.user_id);
        if (u && u.branch_id === activeBranchId) set.add(w.user_id);
      }
    });
    return set.size;
  }, [version, activeBranchId]);



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

      // total employees (global)
      const totalStaff = useMemo(
          () => users.filter((u) => u.role === "employee").length,
          [version]
      );

      
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMD = (d: Date) =>
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
          // today's date in local timezone (Y-M-D)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayYMD = toYMD(today);
          // staff work hours for today (global)
          const todaysWorkHours = useMemo(
              () => workHours.filter((w) => w.date === todayYMD),
              [todayYMD, version]
          );
      
  

  // native date picker handlers (simple show/hide)
  const onShowNativeDatePicker = () => setShowDatePicker(true);
  const onNativeDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(0, 0, 0, 0);
      setSelectedDateObj(selectedDate);
      // update display depending on mode
      if (mode === "day") {
        const wd = WEEKDAYS[selectedDate.getDay()];
        const mon = MONTHS[selectedDate.getMonth()];
        const day = selectedDate.getDate();
        const fmt = `${wd}, ${mon} ${day}`;
        setDateInput(fmt);
      } else if (mode === "week") {
        setDateInput(formatWeekDisplayFromDate(selectedDate));
      } else { // month
        setDateInput(formatMonthDisplayFromDate(selectedDate));
      }
      setDateError("");
      prevDateRef.current = dateInput;
    }
  };

  // pull to refresh — clear inputs, errors and force recompute
  const onRefresh = async () => {
    setRefreshing(true);
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

    if (!activeBranchId) return base; // if no branch passed, keep existing behavior (show everything)

    // filter base by branch logic + exclude admin users (only show employee records)
    return base.filter(w => {
      const emp = usersArr.find(u => u.id === w.user_id) || null;

      // skip if we couldn't find the user or if the user is an admin (only show employees)
      if (!emp || emp.role === "admin") return false;

      const sched = schedulesArr.find(s => s.user_id === w.user_id && s.date === w.date) || null;
      const empBranch = emp.branch_id ?? null;
      const schedBranch = sched?.branch_id ?? null;

      // include record if either employee's primary branch matches OR schedule branch matches
      return empBranch === activeBranchId || schedBranch === activeBranchId;
    });


  }, [selectedRange, version, activeBranchId]);

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
    if (!selectedRange) {
      setDateError(lang.please_select_valid_date);
      showErrorToast(lang.please_select_valid_date);
      return;
    }

    try {
      // build structured data
      const sheetData = entries.map(item => {
        const u = item.user || {};
        const wh = item.work || {};
        const status = item.status === "noschedule" ? "No schedule" : item.status === "early" ? "Early" : "Late";
        return {
          "Staff ID": u.id || "",
          "Name": u.fullname || "",
          "Position": u.position || "",
          "Check In": wh.check_in || "",
          "Check Out": wh.check_out || "",
          "Date": wh.date || "",
          "Status": status,
          "Diff": item.diffText || ""
        };
      });

      // create workbook + worksheet
      const ws = XLSX.utils.json_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");

      // prefer writing binary then converting via Buffer (more robust)
      const wboutBinary = XLSX.write(wb, { bookType: "xlsx", type: "binary" });

      // convert binary string to base64 using Buffer
      const buf = Buffer.from(wboutBinary, "binary");
      const wboutBase64 = buf.toString("base64");

      // filename
      let filename = "attendance.xlsx";
      if (selectedRange.type === "day") filename = `attendance_${selectedRange.ymd}.xlsx`;
      else if (selectedRange.type === "week") filename = `attendance_${selectedRange.startYmd}_to_${selectedRange.endYmd}.xlsx`;
      else filename = `attendance_${selectedRange.year}-${pad2(selectedRange.monthIndex + 1)}.xlsx`;

      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + filename;

      // DEBUG: log EncodingType if available
      console.log("FileSystem.EncodingType (debug):", (FileSystem as any).EncodingType);

      // choose encoding fallback (legacy import should have EncodingType)
      const enc: any =
        (FileSystem as any).EncodingType && (FileSystem as any).EncodingType.Base64
          ? (FileSystem as any).EncodingType.Base64
          : "base64";

      // write file
      await FileSystem.writeAsStringAsync(fileUri, wboutBase64, { encoding: enc });

      // share
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


  //---------------------------------------------------------------//
  // Search filtering for entries (optional)
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(({ user }) => {
      if (!user) return false;
      const full = `${user.fullname}  ${user.position}`.toLowerCase();
      return full.includes(q);
    });
  }, [entries, query]);

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

  // button background logic (active = primary, inactive = background)
  const nowBg = mode === "day" ? undefined : colors.background;
  const weekBg = mode === "week" ? undefined : colors.background;
  const monthBg = mode === "month" ? undefined : colors.background;

  // text color for each toggle: active -> colors.secondary, inactive -> colors.subtext
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
          <View style={{ flexDirection: 'row', marginBottom: 12, alignItems: "center",  width:'90%'  }}>
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
      <Text style={styles.total_count}>{totalEmployeesForBranch}</Text>
    </CartBox>

    <CartBox containerStyle={styles.staff}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Image
          source={require("../../../assets/icons/staff_tik_g.png")}
          style={styles.icon}
        />
        <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
      </View>

      <Text style={styles.shift_count}>{todaysWorkingForBranch}</Text>
    </CartBox>
  </View>
)}


          </View>

          <View style={styles.buttonWrap}>
            <Button1 text={lang.generate_csv} width={"100%"} onPress={onGenerateCSV} />
          </View>

          <ScrollView
            style={{  }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <View style={styles.details}>
              {filteredEntries.length === 0 ? (
                <Text style={styles.noDataText}>{mode === "day" ? lang.select_valid_date : (mode === "week" ? "No records for selected week" : "No records for selected month")}</Text>
              ) : null}

              {filteredEntries.map(({ work, user, schedule, status, diffText }) => {
                const displayName = user ? `${user.fullname}` : "Unknown";
                const position = user?.position ?? "";
                const timeStr = `${formatTime12(work.check_in)} - ${formatTime12(work.check_out)}`;
                const dateDisplay = formatYMDDisplay(work.date);

                // Decide whether to show branch header: only when schedule branch exists and differs from admin's branch
const schedBranchId = schedule?.branch_id ?? null;
const showBranchHeader = schedBranchId && activeBranchId && schedBranchId !== activeBranchId;

                const schedBranchName = showBranchHeader ? (getBranchById(schedBranchId)?.name || schedBranchId) : "";

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
                          {/* placeholder image */}
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
                        ) : (
                          <Text style={styles.status_noschedule}>{lang.no_schedule}</Text>
                        )}
                        {status !== "noschedule" ? (
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

      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.secondary },
  container: { marginHorizontal: 20, flex: 1 },
  body: { flex: 1, paddingTop: 20, },
  Date_control_Buttons: { marginBottom: 20, flexDirection: 'row', width: '100%', justifyContent: 'space-between',  },
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
        width: 30 ,
        height: 30,
        marginRight:8
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
        borderEndWidth:1
    },

});

export default AttendanceScreen;
