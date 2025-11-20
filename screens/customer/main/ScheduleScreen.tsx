import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  StyleSheet
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { getProfile } from "../../../api/profile";
import { getWeeklySchedules } from "../../../api/checkin_checkout";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";

export default function ScheduleScreen(props: any) {
  const route = useRoute<any>();
  const userId = props?.userId || route.params?.userId || route.params?.id || null;
  const langId = props?.langId || route.params?.langId || route.params?.language || "en";
  const currentLang = langId || "en";
  const lang = translations[currentLang as keyof typeof translations] || translations["en"];
  const [weeklySchedules, setWeeklySchedules] = useState<any[]>([]);
  const [localUsers, setLocalUsers] = useState<any[]>([]);
  const [localBranches, setLocalBranches] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  const dateToYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const formatTime12 = (hhmmss: string) => {
    if (!hhmmss) return "";
    const parts = hhmmss.split(":");
    if (parts.length < 2) return hhmmss;
    let hh = parseInt(parts[0], 10);
    const mm = parts[1];
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12 || 12;
    return `${hh}:${mm} ${ampm}`;
  };

  const computeEndTime = (startHHMMSS: string, durationHrs: number) => {
    const parts = startHHMMSS.split(":").map((p) => parseInt(p, 10) || 0);
    const dt = new Date();
    dt.setHours(parts[0], parts[1], parts[2] || 0, 0);
    dt.setTime(dt.getTime() + Math.round(durationHrs * 3600 * 1000));
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
  };

  const isBeforeToday = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dt.getTime() < today.getTime();
  };

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

  const fetchWeeklySchedules = useCallback(async () => {
    setRefreshing(true);
    try {
      const user = await getProfile();
      setLocalUsers([user]);
      
      // Fix the branch access by checking the type properly
      const branchObj = typeof user.branch === 'object' && user.branch !== null 
        ? { _id: user.branch, name: user.branch } 
        : typeof user.branch === 'string' 
          ? { _id: user.branch, name: '' } 
          : null;
      
      if (branchObj) {
        setLocalBranches([branchObj]);
      }
      
      setSelectedStaffId(user._id);

      const data = await getWeeklySchedules({ userId: user._id });
      setWeeklySchedules(data);
    } catch (err) {
      console.error("❌ Error fetching weekly schedules:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWeeklySchedules();
  }, [fetchWeeklySchedules]);

  // Derived: schedules grouped by date
  const localSchedulesByDate: Record<string, any[]> = weeklySchedules.reduce((acc, sched) => {
    const ymd = dateToYMD(new Date(sched.date));
    if (!acc[ymd]) acc[ymd] = [];
    acc[ymd].push(sched);
    return acc;
  }, {} as Record<string, any[]>);

  const onRefresh = async () => {
    await fetchWeeklySchedules();
  };

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

              // Get the schedule for the selected staff
              const staffSchedule = selectedStaffId
                ? daySchedules.find((s) => s.userId === selectedStaffId)
                : null;

              const hasScheduleForStaff = !!staffSchedule;
              const expired = isBeforeToday(ymd);
              const displayTime = hasScheduleForStaff
                ? `${formatTime12(staffSchedule.start_time)} – ${formatTime12(staffSchedule.end_time)}`
                : null;

              const userObj = localUsers.find((u) => u._id === selectedStaffId) || null;

              // Only show branch if schedule branch differs from user's branch
              let branchNameForSchedule = "";
              if (staffSchedule && userObj) {
                const scheduleBranchId = String(staffSchedule.branchId);
                const userBranchId = String(typeof userObj.branch === "string" ? userObj.branch : userObj.branch?._id);

                if (scheduleBranchId && scheduleBranchId !== userBranchId) {
                  branchNameForSchedule = staffSchedule.branchName ?? "";
                }
              }


              return (
                <View key={ymd} style={styles.each_day}>
                  <CartBox
                    width="auto"
                    containerStyle={[
                      styles.day,
                      expired || !hasScheduleForStaff
                        ? { backgroundColor: colors.background, borderColor: colors.background }
                        : {},
                    ]}
                  >
                    <Text
                      style={[
                        styles.day_text,
                        expired || !hasScheduleForStaff ? { color: colors.subtext } : {},
                      ]}
                    >
                      {`${dateNum}`}
                    </Text>
                    <Text
                      style={[
                        styles.day_text,
                        expired || !hasScheduleForStaff ? { color: colors.subtext } : {},
                      ]}
                    >
                      {`${wk}`}
                    </Text>
                  </CartBox>


                  <TouchableOpacity style={{ flex: 1 }} activeOpacity={expired ? 1 : 0.8}>
                    <CartBox
                      width="auto"
                      containerStyle={[
                        styles.time,
                        (expired || !hasScheduleForStaff)
                          ? { backgroundColor: colors.background, borderColor: colors.background }
                          : {},
                      ]}
                    >
                      <View style={{ alignItems: "center" }}>
                        {branchNameForSchedule || displayTime ? (
                          <>
                            {branchNameForSchedule && (
                              <View style={{ flexDirection: "row", marginBottom: 4, width: "80%" }}>
                                <Image
                                  source={
                                    expired
                                      ? require("../../../assets/icons/branch_ex.png")
                                      : require("../../../assets/icons/branch_b.png")
                                  }
                                  style={styles.branch}
                                />
                                <Text
                                  style={[
                                    styles.branch_name,
                                    (expired || !hasScheduleForStaff) ? { color: colors.subtext } : {},
                                  ]}
                                  ellipsizeMode="tail"
                                  numberOfLines={1}
                                >
                                  {branchNameForSchedule}
                                </Text>
                              </View>
                            )}

                            {displayTime && (
                              <View style={{ flexDirection: "row" }}>
                                <Image
                                  source={
                                    expired
                                      ? require("../../../assets/icons/clock.png")
                                      : require("../../../assets/icons/clock_b.png")
                                  }
                                  style={styles.clock}
                                />
                                <Text
                                  style={[
                                    styles.time_text,
                                    (expired || !hasScheduleForStaff) ? { color: colors.subtext } : {},
                                  ]}
                                >
                                  {displayTime}
                                </Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <Text
                            style={[
                              styles.noScheduleText,
                              { color: colors.subtext },
                            ]}
                          >
                            Schedule not added
                          </Text>
                        )}
                      </View>
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
  noScheduleText: {
    fontSize: 14,
    color: "#999",
    fontFamily: fonts.family.regular
  },
});
