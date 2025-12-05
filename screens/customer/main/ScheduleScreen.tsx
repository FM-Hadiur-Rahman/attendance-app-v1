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
import { useRoute, RouteProp } from "@react-navigation/native";
import { getProfile, ProfileUser } from "../../../api/profile";
import { getWeeklySchedules } from "../../../api/checkin_checkout";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import translations from "../../../assets/translations.json";
import fonts from "../../../styles/Fonts";

type ScheduleRouteParams = {
  userId?: string;
  id?: string;
  langId?: string;
  language?: string;
};

type ScheduleScreenProps = {
  userId?: string;
  langId?: string;
};

type BranchField = string | { _id?: string; name?: string } | null | undefined;
type BranchInfo = { _id: string; name: string };

type WeeklySchedule = {
  id: string;
  userId: string;
  username?: string;
  branchId?: string;
  branchName?: string;
  date: string;
  start_time: string;
  end_time: string;
  day_of_week: string;
};

const isBranchObject = (value: BranchField): value is { _id?: string; name?: string } =>
  typeof value === "object" && value !== null;

export default function ScheduleScreen({ userId: propUserId, langId: propLangId }: ScheduleScreenProps) {
  const route = useRoute<RouteProp<Record<string, ScheduleRouteParams>, string>>();
  const userId = propUserId || route.params?.userId || route.params?.id || null;
  const langId = propLangId || route.params?.langId || route.params?.language || "en";
  const currentLang = langId || "en";
  const lang = translations[currentLang as keyof typeof translations] || translations["en"];
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [localUsers, setLocalUsers] = useState<ProfileUser[]>([]);
  const [localBranches, setLocalBranches] = useState<BranchInfo[]>([]);
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
      const branchField: BranchField = (user as typeof user & { branch?: BranchField }).branch;

      let branchObj: BranchInfo | null = null;
      if (isBranchObject(branchField)) {
        const id = branchField._id;
        if (id) {
          branchObj = { _id: String(id), name: String(branchField.name ?? id) };
        }
      } else if (typeof branchField === "string") {
        branchObj = { _id: branchField, name: "" };
      }
      
      if (branchObj) {
        setLocalBranches([branchObj]);
      }
      
      setSelectedStaffId(user._id);

      const data = await getWeeklySchedules({ userId: user._id });
      setWeeklySchedules(data as WeeklySchedule[]);
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
  const localSchedulesByDate: Record<string, WeeklySchedule[]> = weeklySchedules.reduce((acc, sched) => {
    const ymd = dateToYMD(new Date(sched.date));
    if (!acc[ymd]) acc[ymd] = [];
    acc[ymd].push(sched);
    return acc;
  }, {} as Record<string, WeeklySchedule[]>);

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
                const userBranchField: BranchField = (userObj as ProfileUser & { branch?: BranchField }).branch;
                const userBranchId = String(
                  typeof userBranchField === "string" ? userBranchField : userBranchField._id ?? ""
                );

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
                           {lang.scheduleNotAdded}
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
  each_day: { flexDirection: "row", width: '100%', marginBottom: 20, alignItems: "center", },
  day: { borderColor: colors.primary, borderWidth: 1, borderRadius: 12, backgroundColor: colors.secondary, marginRight: 10, paddingTop: 11, paddingBottom: 11, width: 52, alignItems: "center" },
  day_text: { color: colors.primary, fontSize: fonts.size.s, fontWeight: fonts.weight.regular  },
  time: {
    borderColor: colors.primary,
    borderWidth: 1, borderRadius: 12,
    backgroundColor: colors.secondary, flex: 1, justifyContent: "center", alignItems: 'center'
  },
  branch: {
    width: 16, height: 16, marginRight: 4
  },
  branch_name: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular ,
    color: colors.primary,

  },
  time_text: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular ,
    color: colors.primary,
  },
  clock: { width: 14, height: 14, marginRight: 4 },
  noScheduleText: {
    fontSize: 14,
    color: "#999",
    fontFamily: fonts.family.regular
  },
});
