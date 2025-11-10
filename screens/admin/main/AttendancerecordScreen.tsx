// screens/admin/main/AttendancerecordScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useNavigation, useRoute } from "@react-navigation/native";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import { getAttendanceReport,AttendanceReportItem } from "../../../api/checkin_checkout";
import { getBranchId, getProfile } from "../../../api/profile";
import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

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

// --- helpers for parsing/formatting times & dates ---
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// time formatting: accept ISO, "HH:MM", "HH:MM:SS", return "h:mm AM/PM"
const formatTimeFromAny = (value?: string | null) => {
  if (!value) return "";
  try {
    // ISO-like?
    if (value.includes("T") || value.includes("-") && value.includes("Z")) {
      const dt = new Date(value);
      if (!isNaN(dt.getTime())) {
        let h = dt.getHours();
        const m = dt.getMinutes();
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
      }
    }
    // plain HH:MM or HH:MM:SS
    const parts = value.split(":").map(p => parseInt(p, 10) || 0);
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

// return minutes since midnight for HH:MM or ISO string (local)
const timeToMinutesAny = (value?: string | null) => {
  if (!value) return null;
  try {
    if (value.includes("T")) {
      const dt = new Date(value);
      if (!isNaN(dt.getTime())) return dt.getHours() * 60 + dt.getMinutes();
    }
    const parts = value.split(":").map(p => parseInt(p, 10) || 0);
    if (parts.length >= 2) return parts[0] * 60 + parts[1];
  } catch (e) { /* ignore */ }
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

// ---------------- component ----------------
const AttendancerecordScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  const [query, setQuery] = useState<string>("");
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  

  const defaultToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const WEEKDAY_FMT = `${WEEKDAYS[defaultToday.getDay()]}, ${MONTHS[defaultToday.getMonth()]} ${defaultToday.getDate()}`;
  const [dateInput, setDateInput] = useState<string>(WEEKDAY_FMT);
  const [dateError, setDateError] = useState<string>("");
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(defaultToday);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // main attendance data from server (array of rows)
  const [attendanceData, setAttendanceData] = useState<AttendanceReportItem[]>([]);

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
      const monIndex = MONTHS.findIndex(m => m.toLowerCase() === mon.toLowerCase());
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
        if (selectedDateObj) return { type: "day" as const, ymd: toYMD(selectedDateObj) };
        return null;
      } else if (mode === "week") {
        const conv = dateInputToYMD(dateInput.trim());
        if (conv.ok) {
          const [y, m, d] = conv.ymd!.split("-").map(x => parseInt(x, 10));
          const dt = new Date(y, m - 1, d);
          const s = getStartOfWeekSunday(dt);
          const e = getEndOfWeekSaturday(dt);
          return { type: "week" as const, startYmd: toYMD(s), endYmd: toYMD(e) };
        }
        const base = selectedDateObj ?? new Date();
        const s = getStartOfWeekSunday(base);
        const e = getEndOfWeekSaturday(base);
        return { type: "week" as const, startYmd: toYMD(s), endYmd: toYMD(e) };
      } else {
        // month
        const dt = selectedDateObj ?? new Date();
        return { type: "month" as const, year: dt.getFullYear(), monthIndex: dt.getMonth() };
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
      endDate = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
    }

    // --- get logged-in profile ---
    const prof = await getProfile(); // must be current logged-in user
    const userBranchId = typeof prof.branch === "string" ? prof.branch : prof.branch?._id;
    const userId = prof._id;
    const userRole = prof.role;

    // --- fetch attendance for branch ---
    const res = await getAttendanceReport(startDate, endDate, userBranchId);
    const rows = Array.isArray(res) ? res : (res?.rows ?? res?.data ?? []);
    const normalized = Array.isArray(rows) ? rows : [];

    // --- filter only logged-in user if not admin ---
    let filtered = normalized;
    if (userRole !== "admin") {
      filtered = normalized.filter(r => r.employeeId === userId || r.employee_id === userId);
    }

    setAttendanceData(filtered);

  } catch (err) {
    console.error("Failed to load attendance report:", err);
    showErrorToast("Failed to load attendance");
    setAttendanceData([]);
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, [selectedRange]);


  useEffect(() => {
    fetchAttendanceReport();
  }, [fetchAttendanceReport]);

  // onRefresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAttendanceReport();
    setRefreshing(false);
  };

  // ---------- transform raw rows into enriched items ----------
  const enriched = useMemo(() => {
    return (attendanceData || []).map((r) => {
      // r likely has:
      // { actualIn, actualOut, branchId, branchName, date, employeeId, endStatus, fullname, scheduledEnd, scheduledStart, startStatus, username }
      const dateYmd = normalizeDateToYMD(r.date ?? r.startDate ?? "");
      const checkInRaw = r.actualIn && r.actualIn !== "" ? r.actualIn : null;
      const checkOutRaw = r.actualOut && r.actualOut !== "" ? r.actualOut : null;
      const scheduledStart = r.scheduledStart ?? r.scheduledStart ?? r.scheduled_start ?? "";
      const scheduledEnd = r.scheduledEnd ?? r.scheduled_end ?? "";
      const startStatus = r.startStatus ?? r.start_status ?? r.startstatus ?? r.start_status;
      const endStatus = r.endStatus ?? r.end_status ?? r.endstatus;

      // compute checkIn/checkOut time strings (HH:MM or ISO)
      const checkInTime = checkInRaw ? checkInRaw : null;
      const checkOutTime = checkOutRaw ? checkOutRaw : null;

      // compute display strings
      const displayScheduledStart = scheduledStart ? formatTimeFromAny(scheduledStart) : "";
      const displayScheduledEnd = scheduledEnd ? formatTimeFromAny(scheduledEnd) : "";
      const displayCheckIn = checkInTime ? formatTimeFromAny(checkInTime) : "";
      const displayCheckOut = checkOutTime ? formatTimeFromAny(checkOutTime) : "";

      // duration actualOut - actualIn (minutes)
      let durationMins: number | null = null;
      const inMinutes = timeToMinutesAny(checkInTime);
      const outMinutes = timeToMinutesAny(checkOutTime);
      if (inMinutes !== null && outMinutes !== null) {
        // if actual times are ISO with date, difference could be across days;
        // prefer using Date when both are ISO
        if ((checkInTime || "").includes("T") && (checkOutTime || "").includes("T")) {
          const inD = new Date(checkInTime!);
          const outD = new Date(checkOutTime!);
          if (!isNaN(inD.getTime()) && !isNaN(outD.getTime())) {
            durationMins = Math.max(0, Math.round((outD.getTime() - inD.getTime()) / 60000));
          }
        } else {
          durationMins = Math.max(0, outMinutes - inMinutes);
        }
      }

      // compute diff vs scheduled start (minutes)
      let diffVsScheduleText = "";
      if (scheduledStart && checkInTime) {
        const scheduleM = timeToMinutesAny(scheduledStart);
        const checkM = timeToMinutesAny(checkInTime);
        if (scheduleM !== null && checkM !== null) {
          const diff = checkM - scheduleM; // positive => late
          diffVsScheduleText = `${diff >= 0 ? "" : " "}${minutesToDurationText(Math.abs(diff))}`;
        }
      }

      // status normalized
      let status = "no-schedule";
const scheduleMins = scheduledStart ? timeToMinutesAny(scheduledStart) : null;
const checkInMins = checkInRaw ? timeToMinutesAny(checkInRaw) : null;

if (scheduleMins !== null && checkInMins !== null) {
  if (checkInMins < scheduleMins) status = "early";
  else if (checkInMins > scheduleMins) status = "late";
  else status = "on_time";
} else if (startStatus && typeof startStatus === "string") {
  const s = startStatus.toLowerCase();
  if (s.includes("early")) status = "early";
  else if (s.includes("late")) status = "late";
  else if (s.includes("on") || s.includes("ontime") || s.includes("on_time")) status = "on_time";
}

      return {
        raw: r,
        id: r.employeeId ?? r.employee_id ?? r._id ?? Math.random().toString(36).slice(2),
        name: r.fullname ?? r.username ?? r.name ?? "Unknown",
        username: r.username ?? "",
        branchId: r.branchId ?? r.branch_id ?? "",
        branchName: r.branchName ?? r.branch_name ?? "",
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
        durationText: durationMins !== null ? minutesToDurationText(durationMins) : "",
        diffVsScheduleText,
        status,
      } as const;
    });
  }, [attendanceData]);

  // determine selected-date range -> filter enriched accordingly
const todayRecords = useMemo(() => {
  if (!selectedRange) return [];

  const getRecordDate = (item: any): Date | null => {
    if (item.checkInRaw) {
      const d = new Date(item.checkInRaw);
      if (!isNaN(d.getTime())) return d;
    }
    if (item.date) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const onlyCheckedIn = enriched || [];

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
      return d && d.getFullYear() === selectedRange.year && d.getMonth() === selectedRange.monthIndex;
    });
  }

  return onlyCheckedIn;
}, [enriched, selectedRange]);




  // search filter (by name/username)
const displayedRecords = useMemo(() => {
  const q = (query || "").trim().toLowerCase();
  return todayRecords
    .filter(r => !!r.checkInRaw) // ✅ only checked-in users
    .filter(r =>
      !q || (r.name || "").toLowerCase().includes(q) || (r.username || "").toLowerCase().includes(q)
    );
}, [todayRecords, query]);

  // UI handlers
  const onShowNativeDatePicker = () => setShowDatePicker(true);
  const onNativeDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(0,0,0,0);
      setSelectedDateObj(selectedDate);
      if (mode === "day") {
        const wd = WEEKDAYS[selectedDate.getDay()];
        const mon = MONTHS[selectedDate.getMonth()];
        setDateInput(`${wd}, ${mon} ${selectedDate.getDate()}`);
      } else if (mode === "week") {
        const s = getStartOfWeekSunday(selectedDate);
        const e = getEndOfWeekSaturday(selectedDate);
        setDateInput(`${WEEKDAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()} - ${WEEKDAYS[e.getDay()]}, ${MONTHS[e.getMonth()]} ${e.getDate()}`);
      } else {
        setDateInput(`${FULL_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`);
      }
    }
  };

  const onSelectNow = () => {
    setMode("day");
    const today = new Date();
    today.setHours(0,0,0,0);
    setSelectedDateObj(today);
    setDateInput(`${WEEKDAYS[today.getDay()]}, ${MONTHS[today.getMonth()]} ${today.getDate()}`);
  };
  const onSelectWeek = () => {
    setMode("week");
    const dt = selectedDateObj ?? new Date();
    const s = getStartOfWeekSunday(dt);
    const e = getEndOfWeekSaturday(dt);
    setDateInput(`${WEEKDAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()} - ${WEEKDAYS[e.getDay()]}, ${MONTHS[e.getMonth()]} ${e.getDate()}`);
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

    // ✅ Only include checked-in users
    const checkedInRecords = todayRecords.filter((item) => !!item.checkInRaw);

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
          : "No Schedule",
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

    // ✅ Filename based on mode
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();
    const ymd = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

    let fileName = `attendance_${ymd}.xlsx`;
    if (mode === "week") fileName = `attendance_week_${ymd}.xlsx`;
    else if (mode === "month") fileName = `attendance_month_${ymd}.xlsx`;

    // ✅ Use documentDirectory (trusted location)
    const fileUri = FileSystem.documentDirectory + fileName;

    // ✅ Save Excel file
    await FileSystem.writeAsStringAsync(fileUri, wboutBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // ✅ Share or show file location
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: fileName,
      });
      showSuccessToast("✅ Excel file exported successfully");
    } else {
      showSuccessToast("📂 File saved to: " + fileUri);
    }
  } catch (err) {
    console.warn("XLSX Export Error:", err);
    showErrorToast("❌ Failed to export Excel file");
  }
};




  // render
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
          onPress: () => navigation.navigate("NotificationScreen" as any, { userId, langId }),
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.Date_control_Buttons}>
            <Button1 text={lang.Now} onPress={onSelectNow} width={'30%'} backgroundColor={mode==='day' ? undefined : colors.background} textStyle={{ color: mode==='day' ? colors.secondary : colors.subtext }} />
            <Button1 text={lang.Week} onPress={onSelectWeek} width={'30%'} backgroundColor={mode==='week' ? undefined : colors.background} textStyle={{ color: mode==='week' ? colors.secondary : colors.subtext }} />
            <Button1 text={lang.Month} onPress={onSelectMonth} width={'30%'} backgroundColor={mode==='month' ? undefined : colors.background} textStyle={{ color: mode==='month' ? colors.secondary : colors.subtext }} />
          </View>

          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_name_position} />
          </View>

          <View style={styles.inputWrap}>
            <InputBox
              label={mode === "day" ? lang.date_label : (mode === "week" ? "Week" : "Month")}
              placeholder={mode === "day" ? "Thu, Aug 18" : (mode === "week" ? "Sun, Oct 12 - Sat, Oct 18" : "October 2025")}
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
            style={{ marginBottom: '15%' }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <View style={styles.details}>
              {loading ? (
                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ marginTop: 12, color: colors.text }}>Loading attendance records...</Text>
                </View>
              ) : !Array.isArray(displayedRecords) || displayedRecords.length === 0 ? (
                <Text style={styles.noDataText}>
                  {mode === "day" ? "No records found for selected day" : mode === "week" ? "No records for selected week" : "No records for selected month"}
                </Text>
              ) : (
                displayedRecords.map((r, index) => {
                  return (
                    <CartBox key={r.id ?? index} containerStyle={styles.detail_cartbox}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", flex: 1 }}>
                          <View style={styles.avatarPlaceholder}>
                            <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />
                          </View>

                          <View style={styles.name_position}>
                            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{r.name}</Text>
                            <Text style={styles.time}>{r.scheduledStartDisplay ? `${r.scheduledStartDisplay} - ${r.scheduledEndDisplay}` : "No Schedule"}</Text>
                           <Text style={styles.time}>{r.date ? `${WEEKDAYS[new Date(r.date).getDay()]}, ${MONTHS[new Date(r.date).getMonth()]} ${new Date(r.date).getDate()}` : ""}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                          <Text style={ r.status === "late" ? styles.status_late : r.status === "early" ? styles.status_early : styles.status_on_time }>
                            { r.status === "late" ? "Late" : r.status === "early" ? "Early" : r.status === "on_time" ? "On Time" : "No Schedule" }
                          </Text>
                          {r.diffVsScheduleText ? <Text style={[styles.time1, { marginTop: 6 }]}>{r.diffVsScheduleText}</Text> : null}
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
  Date_control_Buttons: { marginBottom: 20, flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  searchWrap: { marginBottom: 12, },
  inputWrap: { paddingBottom: 8, },
  buttonWrap: { paddingBottom: 20, },
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
    justifyContent: "flex-start"
  },
  name_position: { marginLeft: 10, width: "65%" },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 6 },
   time1: { fontSize: fonts.size.s, color: colors.primary, marginTop: 6 },
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
});

export default AttendancerecordScreen;
