// screens/admin/main/more/AddScheduleScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  findNodeHandle,
  UIManager,
} from "react-native";
import { RefreshControl } from "react-native";
import {  useRoute } from "@react-navigation/native";
import { users as importedUsers, User } from "../../../api/Users";
import { schedules as importedSchedules } from "../../../api/Schedule";
import { branches as importedBranches } from "../../../api/Branch";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";

export default function ScheduleScreen(props: any) {
  const route = useRoute<any>();
  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;

  const userId = propUserId || routeUserId || null;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  useEffect(() => {
    console.log("ScheduleScreen opened", { userId, langId, routeParams: route.params });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  // Local copies of API arrays so refresh can re-sync when the api files change
  const [localUsers, setLocalUsers] = useState<Array<User>>(() => [...importedUsers]);
  const [localBranches, setLocalBranches] = useState<Array<any>>(() => [...importedBranches]);
  const [localSchedules, setLocalSchedules] = useState<Array<any>>(() => [...importedSchedules]);

  // Derived map: schedules grouped by date (Y-M-D)
  const [localSchedulesByDate, setLocalSchedulesByDate] = useState<Record<string, any[]>>(() => {
    const map: Record<string, any[]> = {};
    for (const s of importedSchedules) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return map;
  });

  // Modal-level editing id: this prevents accidentally updating a different schedule
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);

  // Staff selection (typeable)
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffFilterOpen, setStaffFilterOpen] = useState<boolean>(false);

  // Branch selection (typeable)
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchFilterOpen, setBranchFilterOpen] = useState(false);

  // wrappers & layouts for overlays
  const staffInputWrapperRef = useRef<View | null>(null);
  const [staffInputLayout, setStaffInputLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // branch input layout relative to modal container (we capture via onLayout)
  const branchInputWrapperRef = useRef<View | null>(null);
  const [branchInputLayout, setBranchInputLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const [addScheduleModalVisible, setAddScheduleModalVisible] = useState(false);


  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  const formatTime12 = (hhmmss: string) => {
    if (!hhmmss) return "";
    const parts = hhmmss.split(":");
    if (parts.length < 2) return hhmmss;
    let hh = parseInt(parts[0], 10);
    const mm = parts[1];
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${ampm}`;
  };

  const timeStringToDate = (timeStr: string) => {
    const now = new Date();
    now.setSeconds(0, 0);
    if (!timeStr) return now;
    const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
    now.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    return now;
  };

  const dateToYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // prefill if navigation passed a user id (admin opened for a specific user)
  useEffect(() => {
    if (!userId) return;
    const prefillUser = localUsers.find((u) => u.id === userId) || null;
    if (prefillUser && prefillUser.role === "employee") {
      setSelectedStaff(prefillUser.fullname);
      setSelectedStaffId(prefillUser.id);
      const br = localBranches.find((b) => b.id === prefillUser.branch_id);
      if (br) {
        setSelectedBranch(br.name);
        setSelectedBranchId(br.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, localUsers, localBranches]);

  const getWeekDates = () => {
    const today = new Date();
    const dayIdx = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayIdx);
    sunday.setHours(0, 0, 0, 0);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  };
  const weekDates = getWeekDates();

  // Whenever localSchedules changes, rebuild the grouped-by-date map
  useEffect(() => {
    const map: Record<string, any[]> = {};
    for (const s of localSchedules) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    setLocalSchedulesByDate(map);
  }, [localSchedules]);

  const onRefresh = async () => {
    setRefreshing(true);
    // small delay for UX
    await new Promise((r) => setTimeout(r, 600));
    try {
      // re-sync with the imported arrays (someone mutated them externally)
      setLocalUsers([...importedUsers]);
      setLocalBranches([...importedBranches]);
      setLocalSchedules([...importedSchedules]);
      // showSuccessToast("Refreshed");
    } catch (e) {
      console.warn("refresh failed", e);
    } finally {
      setRefreshing(false);
    }
  };

  const computeEndTime = (startHHMMSS: string, durationHrs: number) => {
    const parts = startHHMMSS.split(":").map((p) => parseInt(p, 10) || 0);
    const dt = new Date();
    dt.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    dt.setTime(dt.getTime() + Math.round(durationHrs * 3600 * 1000));
    const hh = pad2(dt.getHours());
    const mm = pad2(dt.getMinutes());
    const ss = pad2(dt.getSeconds());
    return `${hh}:${mm}:${ss}`;
  };

  const isBeforeToday = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dt.getTime() < today.getTime();
  };

  useEffect(() => {
    if (branchFilterOpen) {
      setTimeout(() => {
        if (!branchInputLayout) {
          const handle = findNodeHandle(branchInputWrapperRef.current);
          if (handle) {
            UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
              setBranchInputLayout({ x: pageX, y: pageY, width, height });
            });
          }
        }
      }, 40);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilterOpen, selectedBranch, addScheduleModalVisible]);

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Schedule, color: colors.text }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scrollBody}>
          {/* Week row */}
          <View style={{ marginTop: 0 }}>
            {weekDates.map((d) => {
              const ymd = dateToYMD(d);
              const dateNum = d.getDate();
              const wk = WEEKDAYS[d.getDay()];
              const daySchedules = localSchedulesByDate[ymd] || [];
              const staffSchedule = selectedStaffId ? daySchedules.find((s) => s.user_id === selectedStaffId) : null;
              const hasScheduleForStaff = !!staffSchedule;
              const expired = isBeforeToday(ymd);
              const displayTime = hasScheduleForStaff ? `${formatTime12(staffSchedule.start_time)} – ${formatTime12(computeEndTime(staffSchedule.start_time, staffSchedule.duration))}` : null;
              const userObj = localUsers.find((uu) => uu.id === selectedStaffId) || null;
              const branchNameForSchedule = hasScheduleForStaff && userObj && staffSchedule.branch_id && (staffSchedule.branch_id !== userObj.branch_id)
                ? (localBranches.find((b) => b.id === staffSchedule.branch_id)?.name ?? "")
                : "";

              return (
                <View key={ymd} style={styles.each_day}>
                  <CartBox
                    width="auto"
                    containerStyle={[styles.day, expired ? { backgroundColor: colors.background, borderColor: colors.background } : {}]}
                  >
                    <Text style={[styles.day_text, expired ? { color: colors.subtext} : {}]}>{`${dateNum}`}</Text>
                    <Text style={[styles.day_text,  expired ? { color: colors.subtext} : {}]}>{`${wk}`}</Text>
                  </CartBox>

                  <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={expired ? 1 : 0.8}
                  >
                    <CartBox width="auto" containerStyle={[styles.time, expired ? { backgroundColor: colors.background, borderColor: colors.background } : {}]}>
                      {hasScheduleForStaff ? (
                        <View style={{ alignItems: 'center' }}>
                          {branchNameForSchedule ?
                            <View style={{ flexDirection: 'row', marginBottom: 4, width: '80%' }}>
                              <Image source={expired ? require("../../../assets/icons/branch_ex.png"): require("../../../assets/icons/branch_b.png") } style={styles.branch} />
                              <Text style={[styles.branch_name,  expired ? { color: colors.subtext} : {}]} ellipsizeMode="tail" numberOfLines={1}>{branchNameForSchedule}</Text>
                            </View>
                            : null}
                          <View style={{ flexDirection: 'row' }}>
                            <Image source={expired ? require("../../../assets/icons/clock.png"): require("../../../assets/icons/clock_b.png") } style={styles.clock} />
                            <Text style={[styles.time_text, expired ? { color: colors.subtext} : {}]}>{displayTime}</Text>
                          </View>
                        </View>
                      ) : (
                        <Image source={require("../../../assets/icons/plus_b.png")} style={styles.plus} />
                      )}
                    </CartBox>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          <View style={{ height: 0 }} />
        </View>
      </ScrollView>
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  scrollContainer: { paddingBottom: 0 },
  scrollBody: { backgroundColor: colors.secondary, paddingTop: 20, paddingHorizontal: 20, paddingBottom: "25%" },
  group1: { marginBottom: 20 },
  groupTitle: { color: colors.text, fontWeight: fonts.weight.regular as any, fontSize: fonts.size.m },
  groupSubtitle: { color: colors.search, fontWeight: fonts.weight.regular as any, fontSize: fonts.size.s, marginTop: 6 },

  /* modal styles reused from your other screens */
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalOverlayAbsolute: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
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

  footerButtonWrap: { position: "absolute", left: 20, right: 20, bottom: 0, paddingTop: 10, paddingBottom: 30, backgroundColor: colors.secondary },
  each_day: { flexDirection: "row", width: '100%', marginBottom: 20, alignItems: "center", },
  day: { borderColor: colors.primary, borderWidth: 1, borderRadius: 12, backgroundColor: colors.secondary, marginRight: 10, paddingTop: 11, paddingBottom: 11, width: 52, alignItems: "center" },
  day_text: { color: colors.primary, fontSize: fonts.size.s, fontWeight: fonts.weight.regular as any },
  time: {
    borderColor: colors.primary,
    borderWidth: 1, borderRadius: 12,
    backgroundColor: colors.secondary, flex: 1, justifyContent: "center", alignItems: 'center'
  },
  plus: { width: 16, height: 16 },

  // overlay (full-screen pressable backdrop)
  overlayBackdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  overlayContainer: {
    position: "absolute",
    backgroundColor: colors.secondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    // shadow
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  suggestionItemInline: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: { color: colors.text, fontSize: fonts.size.m },
  branch: {
    width: 16, height: 16, marginRight: 4
  },
  branch_name: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    color: colors.primary,

  },
  time_text: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    color: colors.primary,
  },
  clock: { width: 14, height: 14, marginRight: 4 },
});
