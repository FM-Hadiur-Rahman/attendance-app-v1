// screens/admin/main/more/AddScheduleScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { RefreshControl } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { users, User } from "../../../../api/Users";
import { schedules } from "../../../../api/Schedule";
import Header from "../../../../components/Header";
import colors from "../../../../styles/Colors";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import fonts from "../../../../styles/Fonts";
import InputBox from "../../../../components/InputBox";
import translations from "../../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../../components/Toast";

export default function AddScheduleScreen(props: any) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
    // support prop-based or route-based injection (Footer/WorkSchedule passes these)
  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;

  const userId = propUserId || routeUserId || null;
  const langId = propLangId || routeLangId || "en";

  // translation dictionary for this screen
  const lang = (translations as any)[langId] || (translations as any)["en"];

  // log what we received when screen mounts
  useEffect(() => {
    console.log("AddScheduleScreen opened", {
      userId,
      langId: langId,
      editingId,
      routeParams: route.params,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  
  // If route.params.id is provided -> edit mode
  const editingId: string | undefined = route.params?.id;

  // page state
  const [refreshing, setRefreshing] = useState(false);

  // Staff selection
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>(""); // display name
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string>("");

  // Date
  const prevDateRef = useRef<string>("");
  const [dateInput, setDateInput] = useState<string>(""); // human-friendly "Thu, Aug 18"
  const [dateError, setDateError] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null); // keeps real date

  // Time
  const [timeFrom, setTimeFrom] = useState<string>("");
  const [timeFromError, setTimeFromError] = useState<string>("");
  const [timeTo, setTimeTo] = useState<string>("");
  const [timeToError, setTimeToError] = useState<string>("");

  // helpers
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const WEEKDAYS_LOWER = WEEKDAYS.map((w) => w.toLowerCase());
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const MONTH_INDEX: Record<string, number> = MONTHS.reduce((acc, m, i) => {
    acc[m.toLowerCase()] = i;
    return acc;
  }, {} as Record<string, number>);

  const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = (monthIndex: number, year: number) =>
    [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIndex];

  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  // convert Date -> "Thu, Aug 18"
  const formatDateFromJSDate = (d: Date) => {
    const wd = WEEKDAYS[d.getDay()];
    const mon = MONTHS[d.getMonth()];
    const day = d.getDate();
    return `${wd}, ${mon} ${day}`;
  };

  //time state 
  const [showTimePicker, setShowTimePicker] = useState(false);
// which field the time picker is for: 'from' or 'to'
const [timePickerTarget, setTimePickerTarget] = useState<'from' | 'to' | null>(null);

// convert JS Date -> "HH:MM:SS"
const formatJSDateToTimeHHMMSS = (d: Date) => {
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds ? d.getSeconds() : 0);
  return `${hh}:${mm}:${ss}`;
};

// parse "HH:MM:SS" -> Date object (today with that time)
const timeStringToDate = (timeStr: string) => {
  const now = new Date();
  now.setSeconds(0, 0);
  if (!timeStr) return now;
  const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
  now.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
  return now;
};

// open native time picker for a given target
const onShowNativeTimePicker = (target: 'from' | 'to') => {
  setTimePickerTarget(target);
  setShowTimePicker(true);
};

  // convert display date "Thu, Aug 18" -> YYYY-MM-DD (assume current year)
  const dateInputToYMD = (display: string): { ok: boolean; ymd?: string; message?: string } => {
    if (!display || display.trim() === "") return { ok: false, message: lang.Empty_date};
    const cleaned = display.replace(",", "").trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length !== 3) return { ok: false, message: "Use format: Ddd, Mmm DD" };
    const [wd, mon, dayStr] = parts;
    const wdLower = wd.slice(0, 3).toLowerCase();
    const monLower = mon.slice(0, 3).toLowerCase();
    if (!WEEKDAYS_LOWER.includes(wdLower)) return { ok: false, message: "Weekday must be 3-letter" };
    if (!(monLower in MONTH_INDEX)) return { ok: false, message: "Month must be 3-letter" };
    const day = parseInt(dayStr, 10);
    if (isNaN(day) || day <= 0) return { ok: false, message: "Invalid day" };
    const year = new Date().getFullYear();
    const monIdx = MONTH_INDEX[monLower];
    const maxDay = daysInMonth(monIdx, year);
    if (day > maxDay) return { ok: false, message: `${MONTHS[monIdx]} has only ${maxDay} days` };
    const dt = new Date(year, monIdx, day);
    if (isNaN(dt.getTime())) return { ok: false, message: "Invalid date" };
    const actualWd = WEEKDAYS[dt.getDay()].toLowerCase();
    if (actualWd !== wdLower) return { ok: false, message: `Weekday mismatch (expected ${WEEKDAYS[dt.getDay()]})` };
    const ymd = `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
    return { ok: true, ymd };
  };

  // time validation HH:MM:SS
  const validateTime = (txt: string) => {
    const re = /^(\d{2}):(\d{2}):(\d{2})$/;
    const m = re.exec(txt);
    if (!m) return { ok: false, message: "Format HH:MM:SS" };
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = parseInt(m[3], 10);
    if (hh < 0 || hh > 23) return { ok: false, message: "Hour must be 00-23" };
    if (mm < 0 || mm > 59) return { ok: false, message: "Minutes must be 00-59" };
    if (ss < 0 || ss > 59) return { ok: false, message: "Seconds must be 00-59" };
    return { ok: true };
  };

  // clear inputs
  const clearAllInputs = () => {
    setSelectedStaff("");
    setSelectedStaffId(null);
    setStaffError("");
    setDateInput("");
    setDateError("");
    setSelectedDateObj(null);
    setTimeFrom("");
    setTimeFromError("");
    setTimeTo("");
    setTimeToError("");
    prevDateRef.current = "";
  };

  // Refresh -> clear inputs
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1200));
    clearAllInputs();
    setRefreshing(false);
  };

  // -----------------------
  // Auto-format handlers (kept similar to what you had)
  // -----------------------
  const handleDateTextChange = (raw: string) => {
    const prev = prevDateRef.current || "";
    const isDeleting = raw.length < prev.length;
    let s = raw.replace(/[^A-Za-z0-9, ]/g, "");
    s = s.replace(/^\s+/, "");
    if (isDeleting) {
      setDateInput(s);
      prevDateRef.current = s;
      const maybe = dateInputToYMD(s);
      if (maybe.ok) setDateError("");
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
    const maybe = dateInputToYMD(formatted);
    if (maybe.ok) setDateError("");
  };

  const formatTimeAuto = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    let out = "";
    if (digits.length <= 2) out = digits;
    else if (digits.length <= 4) out = digits.slice(0, 2) + ":" + digits.slice(2);
    else out = digits.slice(0, 2) + ":" + digits.slice(2, 4) + ":" + digits.slice(4, 6);
    return out;
  };

  const handleTimeFromChange = (txt: string) => {
    const formatted = formatTimeAuto(txt);
    setTimeFrom(formatted);
    const r = validateTime(formatted);
    if (r.ok) setTimeFromError("");
  };

  const handleTimeToChange = (txt: string) => {
    const formatted = formatTimeAuto(txt);
    setTimeTo(formatted);
    const r = validateTime(formatted);
    if (r.ok) setTimeToError("");
  };

  // -----------------------
  // Staff modal handlers
  // -----------------------
  const openStaffModal = () => setStaffModalVisible(true);
  const selectStaff = (u: User) => {
    setSelectedStaff(`${u.firstname} ${u.lastname}`);
    setSelectedStaffId(u.id);
    setStaffError("");
    setStaffModalVisible(false);
  };

  // -----------------------
  // Native date picker handlers
  // -----------------------
  const onShowNativeDatePicker = () => setShowDatePicker(true);
  const onNativeDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(0, 0, 0, 0);
      setSelectedDateObj(selectedDate);
      setDateInput(formatDateFromJSDate(selectedDate));
      setDateError("");
      prevDateRef.current = formatDateFromJSDate(selectedDate);
    }
  };

  //time
  const onNativeTimeChange = (event: any, selected?: Date) => {
  // hide picker on Android (iOS spinner will stay if you want)
  setShowTimePicker(false);

  // user cancelled on Android -> selected will be undefined
  if (!selected) {
    setTimePickerTarget(null);
    return;
  }

  const formatted = formatJSDateToTimeHHMMSS(selected);

  if (timePickerTarget === 'from') {
    setTimeFrom(formatted);
    setTimeFromError("");
  } else if (timePickerTarget === 'to') {
    setTimeTo(formatted);
    setTimeToError("");
  }

  // reset target
  setTimePickerTarget(null);
};

  // -----------------------
  // When opened in edit mode: prefill from schedules[] by id
  // -----------------------
  useEffect(() => {
    if (!editingId) return;
    const s = schedules.find((sch) => sch.id === editingId);
    if (!s) return;
    // find user
    const u = users.find((usr) => usr.id === s.user_id) || null;
    if (u) {
      setSelectedStaff(`${u.firstname} ${u.lastname}`);
      setSelectedStaffId(u.id);
    }
    // date: input expects "Thu, Aug 18" but schedule.date is "YYYY-MM-DD"
    const [y, m, d] = s.date.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    setSelectedDateObj(dt);
    setDateInput(formatDateFromJSDate(dt));
    prevDateRef.current = formatDateFromJSDate(dt);
    // times
    setTimeFrom(s.start_time);
    setTimeTo(s.end_time);
  }, [editingId]);

  // -----------------------
  // Save handler: convert to { id?, user_id, start_time, end_time, date(YYYY-MM-DD) }
  // -----------------------
  const onSavePress = () => {
    let hasError = false;
    if (!selectedStaffId) {
      setStaffError(lang.Select_staff);
      showErrorToast(lang.Please_select_staff);
      hasError = true;
    }
    // compute ymd date either from selectedDateObj or dateInput
    let ymd: string | null = null;
    if (selectedDateObj) {
      const dt = selectedDateObj;
      ymd = `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
    } else {
      const conv = dateInputToYMD(dateInput);
      if (!conv.ok) {
        setDateError(conv.message || "Invalid date");
        showErrorToast(conv.message || "Invalid date");
        hasError = true;
      } else {
        ymd = conv.ymd!;
      }
    }

    if (!timeFrom || timeFrom.trim() === "") {
      setTimeFromError(lang.Required);
      showErrorToast(lang.Please_enter_start_time);
      hasError = true;
    } else {
      const tf = validateTime(timeFrom);
      if (!tf.ok) {
        setTimeFromError(tf.message || "Invalid start time");
        showErrorToast(tf.message || "Invalid start time");
        hasError = true;
      }
    }

    if (!timeTo || timeTo.trim() === "") {
      setTimeToError(lang.Required);
      showErrorToast(lang.Please_fill_all_inputs);
      hasError = true;
    } else {
      const tt = validateTime(timeTo);
      if (!tt.ok) {
        setTimeToError(tt.message || "Invalid end time");
        showErrorToast(tt.message || "Invalid end time");
        hasError = true;
      }
    }

    if (hasError) return;

    const payload: any = {
      user_id: selectedStaffId,
      start_time: timeFrom,
      end_time: timeTo,
      date: ymd,
    };
    if (editingId) payload.id = editingId;

    // call back to parent (WorkScheduleScreen). Parent will insert/update schedules[] and refresh.
    if (typeof route.params?.onSave === "function") {
      try {
        route.params.onSave(payload);
        showSuccessToast(editingId ? "Schedule updated" : "Schedule added");
      } catch (e) {
        console.warn("onSave callback threw:", e);
      }
      clearAllInputs();
      navigation.goBack();
      return;
    }

    // fallback: push into local schedules if no callback was provided (keeps local mock consistent)
    if (!editingId) {
      const id = `S${(schedules.length + 1).toString().padStart(3, "0")}`;
      schedules.push({
        id,
        user_id: payload.user_id,
        start_time: payload.start_time,
        end_time: payload.end_time,
        date: payload.date,
        createDate: new Date().toISOString(),
        updateDate: new Date().toISOString(),
      } as any);
      showSuccessToast("Schedule added");
    } else {
      // update existing
      const idx = schedules.findIndex((sch) => sch.id === editingId);
      if (idx !== -1) {
        schedules[idx] = {
          ...schedules[idx],
          user_id: payload.user_id,
          start_time: payload.start_time,
          end_time: payload.end_time,
          date: payload.date,
          updateDate: new Date().toISOString(),
        };
        showSuccessToast("Schedule updated");
      }
    }
    clearAllInputs();
        // log and pass back params to the previous screen
    console.log("AddScheduleScreen -> navigating back to WorkScheduleScreen", { userId, langId: langId, payload });
    try {
      // send params back (also available in console). Navigating to WorkScheduleScreen with params.
      navigation.navigate("WorkScheduleScreen" as any, { userId, langId: langId });
    } catch (e) {
      // navigation may fail quietly in some stacks — still goBack
    }
    navigation.goBack();
  };

  // show only employees
  const employeeList = users.filter((u) => u.role === "employee");

  // UI label depending on create/edit
  const isEditMode = !!editingId;
  const headerTitle = isEditMode ? (lang.Edit_Schedule) : (lang.Add_Schedule);
  const buttonText = isEditMode ? (lang.Save_Changes) : (lang.Add_Schedule);

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: headerTitle, color: colors.text }}
        left={[
          {
            type: "image",
            url: require("../../../../assets/icons/back_b.png"),
            width: 23,
            height: 23,
            onPress: () => navigation.goBack(),
          },
        ]}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <View style={styles.scrollBody}>
          <View style={styles.group1}>
            <Text style={styles.groupTitle}>{lang.Schedule_details}</Text>
            <Text style={styles.groupSubtitle}>{lang.Create_new_work_schedule}</Text>
          </View>

          <InputBox
            label={"Staff member"}
            placeholder={lang.Select_staff_member}
            value={selectedStaff}
            setValue={(v) => {
              setSelectedStaff(v);
              if (v && v.trim() !== "") setStaffError("");
            }}
            onPress={openStaffModal}
            rightIcon={require("../../../../assets/icons/a_staffrecord_b.png")}
            rightIconStyle={{ tintColor: colors.primary }}
            onRightIconPress={openStaffModal}
            errorMessage={staffError}
          />

          <InputBox
            label={lang.date_label}
            placeholder={"Thu, Aug 18"}
            value={dateInput}
            setValue={handleDateTextChange}
            onBlur={() => {
              // on blur validate and clear selectedDateObj if required
              if (!dateInput || dateInput.trim() === "") {
                setDateError(lang.Date_is_required);
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
              // set selectedDateObj (use current year)
              const [y, m, d] = conv.ymd!.split("-").map((n) => parseInt(n, 10));
              const dt = new Date(y, m - 1, d);
              dt.setHours(0, 0, 0, 0);
              setSelectedDateObj(dt);
            }}
            rightIcon={require("../../../../assets/icons/calender_b.png")}
            onRightIconPress={onShowNativeDatePicker}
            errorMessage={dateError}
            rightIconStyle={{ tintColor: colors.primary }}
          />

          <InputBox
            label={lang.Set_Time_From}
            placeholder={"00:00:00"}
            value={timeFrom}
            setValue={handleTimeFromChange}
            onBlur={() => {
              if (!timeFrom || timeFrom.trim() === "") {
                setTimeFromError(lang.Required);
                return;
              }
              const r = validateTime(timeFrom);
              if (!r.ok) {
                setTimeFromError(r.message || "Invalid time");
                setTimeFrom("");
                return;
              }
              setTimeFromError("");
            }}
            rightIcon={require("../../../../assets/icons/clock_b.png")}
            errorMessage={timeFromError}
            rightIconStyle={{ tintColor: colors.primary }}
            onRightIconPress={() => onShowNativeTimePicker('from')}
          />

          <InputBox
            label={lang.Set_Time_To}
            placeholder={"00:00:00"}
            value={timeTo}
            setValue={handleTimeToChange}
            onBlur={() => {
              if (!timeTo || timeTo.trim() === "") {
                setTimeToError(lang.Required);
                return;
              }
              const r = validateTime(timeTo);
              if (!r.ok) {
                setTimeToError(r.message || "Invalid time");
                setTimeTo("");
                return;
              }
              setTimeToError("");
            }}
            rightIcon={require("../../../../assets/icons/clock_b.png")}
            errorMessage={timeToError}
            rightIconStyle={{ tintColor: colors.primary }}
            onRightIconPress={() => onShowNativeTimePicker('to')}
          />

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      <View style={styles.footerButtonWrap}>
        <Button1 text={buttonText} width={"100%"} onPress={onSavePress} />
      </View>

      {/* Staff selection modal */}
      <Modal animationType="slide" transparent visible={staffModalVisible} onRequestClose={() => setStaffModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setStaffModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.Select_staff_member}</Text>

            <ScrollView style={{ marginTop: 8, maxHeight: 320 }}>
              {employeeList.map((u) => {
                const displayName = `${u.firstname} ${u.lastname}`;
                const isSelected = selectedStaffId === u.id;
                return (
                  <CartBox
                    key={u.id}
                    alignItems="flex-start"
                    paddingLeft={20}
                    paddingTop={10}
                    paddingBottom={10}
                    borderRadius={12}
                    borderWidth={1}
                    backgroundColor={colors.secondary}
                    borderColor={isSelected ? colors.primary : colors.border}
                    marginBottom={8}
                    onPress={() => selectStaff(u)}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontSize: fonts.size.m, fontWeight: fonts.weight.medium as any }}>
                        {displayName}
                      </Text>
                    </View>
                  </CartBox>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDateObj ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "calendar"}
          onChange={onNativeDateChange}
        />
      )}

      {/* Native Time Picker */}
{showTimePicker && (
  <DateTimePicker
    value={
      timePickerTarget === "from" ? timeStringToDate(timeFrom) : timeStringToDate(timeTo)
    }
    mode="time"
    is24Hour={true}
    display={Platform.OS === "ios" ? "spinner" : "clock"}
    onChange={onNativeTimeChange}
  />
)}
       <Toast config={toastConfig} />
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  scrollContainer: { paddingBottom: 0 },
  scrollBody: {
    backgroundColor: colors.secondary,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  group1: { marginBottom: 20 },
  groupTitle: {
    color: colors.text,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.m,
  },
  groupSubtitle: {
    color: colors.search,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.s,
    marginTop: 6,
  },

  /* modal styles reused from your other screens */
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContainer: {
    backgroundColor: colors.secondary,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHandle: { width: 40, height: 6, backgroundColor: colors.modal_line, borderRadius: 10, alignSelf: "center", marginBottom: 12 },
  modalTitle: { fontSize: fonts.size.l, fontWeight: fonts.weight.medium as any, textAlign: "center", marginBottom: 8 },

  footerButtonWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 30,
  },
});
