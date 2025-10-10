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
} from "react-native";
import colors from "../../../styles/Colors";
import Header from "../../../components/Header";
import DateTimePicker from "@react-native-community/datetimepicker";
import SearchBar from "../../../components/SearchBar";
import { useNavigation, useRoute } from "@react-navigation/native";
import { users as usersArr, User } from "../../../api/Users";
import InputBox from "../../../components/InputBox";
import { Button1 } from "../../../components/Button";
import { workHours as workHoursArr } from "../../../api/WorkHours";
import { schedules as schedulesArr } from "../../../api/Schedule";
import CartBox from "../../../components/CartBox";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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
  if (!["sun","mon","tue","wed","thu","fri","sat"].includes(wdLower))
    return { ok: false, message: "Weekday must be 3-letter (Mon..Sun)" };
  const monIndex = MONTHS.findIndex(m => m.toLowerCase() === monLower);
  if (monIndex === -1) return { ok: false, message: "Month must be 3-letter (Jan..Dec)" };
  const day = parseInt(dayStr, 10);
  if (isNaN(day) || day <= 0) return { ok: false, message: "Invalid day" };
  const year = new Date().getFullYear();
  const maxDays = new Date(year, monIndex + 1, 0).getDate();
  if (day > maxDays) return { ok: false, message: `${MONTHS[monIndex]} has only ${maxDays} days` };
  const dt = new Date(year, monIndex, day);
  if (WEEKDAYS[dt.getDay()].toLowerCase() !== wdLower)
    return { ok: false, message: `Weekday mismatch (expected ${WEEKDAYS[dt.getDay()]})` };
  const ymd = `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
  return { ok: true, ymd };
};

// format YYYY-MM-DD -> "Thu, Aug 18"
const formatYMDDisplay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
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
  const [query, setQuery] = useState<string>("");

  // refresh
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // date input & validation
  // date input & validation (default to today's date, editable by user)
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


  // helper: handle date text change (light formatting, permissive)
  const handleDateTextChange = (raw: string) => {
    const prev = prevDateRef.current || "";
    const isDeleting = raw.length < prev.length;
    let s = raw.replace(/[^A-Za-z0-9, ]/g, "");
    s = s.replace(/^\s+/, "");
    if (isDeleting) {
      setDateInput(s);
      prevDateRef.current = s;
      const conv = dateInputToYMD(s);
      if (conv.ok) setDateError("");
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

  // native date picker handlers (simple show/hide)
  const onShowNativeDatePicker = () => setShowDatePicker(true);
  const onNativeDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(0,0,0,0);
      setSelectedDateObj(selectedDate);
      // format to "Thu, Aug 18"
      const wd = WEEKDAYS[selectedDate.getDay()];
      const mon = MONTHS[selectedDate.getMonth()];
      const day = selectedDate.getDate();
      const fmt = `${wd}, ${mon} ${day}`;
      setDateInput(fmt);
      setDateError("");
      prevDateRef.current = fmt;
    }
  };

  // pull to refresh — clear inputs, errors and force recompute
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 900));
      // clear UI inputs/errors
      setQuery(""); 
      setDateInput(defaultDateDisplay); // reset to today on pull-to-refresh
      setDateError(""); 
      setSelectedDateObj(null);
      prevDateRef.current = ""; 
  // force all memoized derived lists to recompute
    setVersion((v) => v + 1);
    // clear search & input? keep search but keep date input as is (you could clear it if you want)
    setRefreshing(false);
  };

  // derive selected YMD (if any)
  const selectedYMD = useMemo(() => {
    if (selectedDateObj) {
      return `${selectedDateObj.getFullYear()}-${pad2(selectedDateObj.getMonth()+1)}-${pad2(selectedDateObj.getDate())}`;
    }
    const conv = dateInputToYMD(dateInput);
    if (conv.ok) return conv.ymd;
    return null;
  }, [selectedDateObj, dateInput, version]);

  // get workHours filtered by selected date (if none selected -> empty)
  const workForDate = useMemo(() => {
    if (!selectedYMD) return [];
    return workHoursArr.filter(w => w.date === selectedYMD);
  }, [selectedYMD, version]);

  // Build UI list entries combining user, workHours, schedule and status/diff
  const entries = useMemo(() => {
    return workForDate
      .slice()
      .sort((a,b) => (a.check_in < b.check_in ? 1 : -1))
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
  }, [workForDate, version]);

  // CSV generation and share
  const onGenerateCSV = async () => {
    // require date
    if (!selectedYMD) {
      setDateError(lang.please_select_valid_date);
      showErrorToast(lang.please_select_valid_date);
      return;
    }

    const rows = [];
    // header
    rows.push(["Staff ID","First Name","Last Name","Position","Check In","Check Out","Date","Status","Diff"].join(","));

    // If no work records -> produce header only (or notify)
    if (workForDate.length === 0) {
      showErrorToast(lang.no_attendance_records);
      // still produce a CSV with header
    }

    for (const item of entries) {
      const wh = item.work;
      const u = item.user;
      const status = item.status === "noschedule" ? "No schedule" : item.status === "early" ? "Early" : "Late";
      const row = [
        u ? u.id : "",
        u ? (u.firstname || "") : "",
        u ? (u.lastname || "") : "",
        u ? (u.position || "") : "",
        wh.check_in,
        wh.check_out,
        wh.date,
        status,
        item.diffText || "",
      ].map(field => {
        // sanitize commas / quotes by wrapping in quotes and escaping internal quotes
        if (field == null) field = "";
        const s = String(field);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }).join(",");
      rows.push(row);
    }

    const csv = rows.join("\n");

    const filename = `attendance_${selectedYMD}.csv`;

    try {
      // Try to share as data URI (works in many cases)
      await Share.share({
        title: filename,
        message: csv,
        url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
      });
      showSuccessToast(lang.csv_prepared);
    } catch (err) {
      console.warn("Share error", err);
      // fallback: just open share with message (some platforms prefer message)
      try {
        await Share.share({ title: filename, message: csv });
        showSuccessToast(lang.csv_prepared);
      } catch (e) {
        console.warn("Second share fallback failed", e);
        showErrorToast("Unable to share CSV on this device");
      }
    }
  };

  // Search filtering for entries (optional)
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(({ user }) => {
      if (!user) return false;
      const full = `${user.firstname} ${user.lastname} ${user.position}`.toLowerCase();
      return full.includes(q);
    });
  }, [entries, query]);

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
            console.log("Navigate -> NotificationScreen", { userId, langId: langId });
            navigation.navigate("NotificationScreen" as any, { userId, langId: langId});
         },
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_name_position } />
          </View>

          <View style={styles.inputWrap}>
            <InputBox
              label={lang.date_label}
              placeholder={"Thu, Aug 18"}
              value={dateInput}
              setValue={handleDateTextChange}
              onBlur={() => {
                if (!dateInput || dateInput.trim() === "") {
                  setDateError(lang.date_required);
                  return;
                }
                const conv = dateInputToYMD(dateInput.trim());
                if (!conv.ok) {
                  setDateError(conv.message || "Invalid date");
                  setDateInput("");
                  prevDateRef.current = "";
                  setSelectedDateObj(null);
                  return;
                }
                setDateError("");
                const [y,m,d] = conv.ymd!.split("-").map(x => parseInt(x,10));
                const dt = new Date(y, m-1, d);
                dt.setHours(0,0,0,0);
                setSelectedDateObj(dt);
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
            style={{ marginBottom: '15%'  }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <View style={styles.details}>
              {filteredEntries.length === 0 ? (
                <Text style={styles.noDataText}>{lang.select_valid_date}</Text>
              ) : null}

              {filteredEntries.map(({ work, user, schedule, status, diffText }) => {
                const displayName = user ? `${user.firstname} ${user.lastname}` : "Unknown";
                const position = user?.position ?? "";
                const timeStr = `${formatTime12(work.check_in)} - ${formatTime12(work.check_out)}`;
                const dateDisplay = formatYMDDisplay(work.date);
                return (
                  <CartBox key={work.id} containerStyle={styles.detail_cartbox}>
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
          mode="date"
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
  container: {  marginHorizontal: 20, flex: 1 },
  body: { flex: 1, paddingTop: 20 },
  searchWrap: { marginBottom: 12 },
  inputWrap: { paddingBottom: 8 ,  },
  buttonWrap: { paddingBottom: 20 , },
  details: { },
  detail_cartbox: {
    width: "100%",
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name_position: { marginLeft: 10, width: "65%" },
  name: { fontSize: 14, fontWeight: "400" as any, color: colors.text },
  time: { fontSize: 12, color: colors.subtext, marginTop: 6 },
  duration: { color: "#2196F3", fontWeight: "500", fontSize: 14, marginLeft: 8 },
  status_early: {
    fontWeight: "400",
    color: "#4CAF50",
    fontSize: 10,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: "#4CAF501A",
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  status_late: {
    fontWeight: "400",
    color: "#F59300",
    fontSize: 10,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: "#F593001A",
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  status_noschedule: {
    fontWeight: "400",
    color: colors.subtext,
    fontSize: 10,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: "#00000006",
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  noDataText: { textAlign: "center", color: colors.subtext, marginTop: 12 },
    profileImage: { width: 40, height: 40, borderRadius: 20, resizeMode: "cover" },

});

export default AttendancerecordScreen;
