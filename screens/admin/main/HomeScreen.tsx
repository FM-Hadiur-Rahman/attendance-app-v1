// screens/admin/main/HomeScreen_A.tsx
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import { useNavigation, useRoute } from "@react-navigation/native";

// API helpers
import { getUserById, fetchUsers, getUsers } from "../../../api/profile";
import { getSchedulesForDate, ScheduleItem } from "../../../api/schedules";
import { getAttendanceAllHistory, AttendanceHistoryItem } from "../../../api/attendanceAllHistory";
import { getBranchById } from "../../../api/Branchs";

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// convert hh:mm -> minutes
const hhmmToMinutes = (hhmm: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(x => parseInt(x || '0', 10));
  return (h || 0) * 60 + (m || 0);
};
// convert "YYYY-MM-DD HH:mm:ss" -> minutes from midnight for that datetime
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
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad2(h)}h ${pad2(m)}m`;
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

const formatYMDDisplay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
};

interface ScreenProps {
  userId?: string | null;
  langId?: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  routeRefresh?: boolean;
  onConsumedRefresh?: () => void;
  toastMessage?: string | null;
  onConsumedToast?: () => void;
  branch?: any;
  createdUser?: any;
}

const HomeScreen_A: React.FC<ScreenProps> = (props) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [version, setVersion] = useState<number>(0);

  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const passedBranchName = route.params?.branch_name ?? route.params?.branchName ?? null;

  const [activeBranchId, setActiveBranchId] = useState<string | null>(passedBranchId || null);
  const [activeBranchName, setActiveBranchName] = useState<string | null>(passedBranchName || null);

  const [totalStaff, setTotalStaff] = useState<number>(0);
  const [loadingStaff, setLoadingStaff] = useState<boolean>(false);

  // schedules & users (previously used)
  const [schedulesState, setSchedulesState] = useState<ScheduleItem[]>([]);
  const [usersState, setUsersState] = useState<any[]>([]);
  const [loadingShiftData, setLoadingShiftData] = useState<boolean>(false);

  // New: recent checkins from attendance API (already enriched)
  const [recentCheckins, setRecentCheckins] = useState<
    Array<{
      attendance: AttendanceHistoryItem;
      userProfile: any | null;
      schedule?: ScheduleItem | null;
      status: "early" | "late" | "noschedule";
      diffText: string;
      branchNameToShow?: string | null;
    }>
  >([]);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setVersion((v) => v + 1);
    setRefreshing(false);
  };

  // fetch branch & total staff
  const fetchBranchAndStaff = async () => {
    try {
      if (!userId && !passedBranchId) {
        setTotalStaff(0);
        return;
      }
      setLoadingStaff(true);

      let branchIdToUse = passedBranchId ?? activeBranchId;

      if (!branchIdToUse && userId) {
        try {
          const u = await getUserById(userId);
          const branchObj = u?.branch;
          const branchIdFromUser = typeof branchObj === "string" ? branchObj : (branchObj && typeof branchObj === "object" ? (branchObj as { _id?: string })._id ?? null : null);
          if (branchIdFromUser) {
            branchIdToUse = branchIdFromUser;
            setActiveBranchId(branchIdFromUser);
            const branchNameMaybe = branchObj && typeof branchObj === "object" ? (branchObj as { name?: string }).name ?? null : null;
            if (branchNameMaybe) setActiveBranchName(branchNameMaybe);
          }
        } catch (e) {
          console.warn("Failed to fetch user to determine branch", e);
        }
      }
      if (!branchIdToUse) {
        setTotalStaff(0);
        setLoadingStaff(false);
        return;
      }

      const res = await fetchUsers({ branchId: branchIdToUse, role: "user", limit: 1000, page: 1 });
      const users = res?.users ?? [];
      const count = users.filter((u: any) => (u.role ?? "user") === "user").length;
      setTotalStaff(count);
    } catch (err) {
      console.error("fetchBranchAndStaff error", err);
      setTotalStaff(0);
    } finally {
      setLoadingStaff(false);
    }
  };

  // fetch schedules & users
  const fetchShiftData = async (branchIdToUse: string | null) => {
    if (!branchIdToUse) {
      setSchedulesState([]);
      setUsersState([]);
      return;
    }
    setLoadingShiftData(true);
    try {
      const schedArr = await getSchedulesForDate(todayYMD);
      const usersArr = await getUsers({ limit: 1000 });
      setSchedulesState(schedArr ?? []);
      setUsersState(usersArr ?? []);
    } catch (e) {
      console.warn("fetchShiftData failed", e);
      setSchedulesState([]);
      setUsersState([]);
    } finally {
      setLoadingShiftData(false);
    }
  };

  // helper to test if schedule belongs to a role:user
  const scheduleIsUser = (s: any) => {
    if (s.employee_id) {
      const role = typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id.role : undefined;
      if (typeof role === "string") return role === "user";
      const id = typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id._id : s.employee_id;
      if (id) {
        const found = usersState.find((u) => u._id === id || (u as any).id === id);
        return found?.role === "user";
      }
    }
    return false;
  };

  // Replaced: compute unique employee count for today's schedules in the active branch
  const TotalstaffCount = useMemo(() => {
    if (!Array.isArray(schedulesState) || schedulesState.length === 0 || !activeBranchId) return 0;

    const pad2Local = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMDLocal = (d: Date) =>
      `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;

    const uniqueEmpIds = new Set<string>();

    schedulesState.forEach((s) => {
      if (!s?.date) return;

      const sDate = new Date(s.date);
      const sYMD = toYMDLocal(sDate);

      // branch id can be object or string
      let branchIdOfSchedule = null;
      if (s.branch_id && typeof s.branch_id === 'object' && '_id' in s.branch_id) {
        branchIdOfSchedule = (s.branch_id as any)._id;
      } else if (typeof s.branch_id === 'string') {
        branchIdOfSchedule = s.branch_id;
      }

      if (sYMD === todayYMD && branchIdOfSchedule && String(branchIdOfSchedule) === String(activeBranchId)) {
        // employee_id may be object or string
        let empId = null;
        if (s.employee_id && typeof s.employee_id === 'object' && '_id' in s.employee_id) {
          empId = (s.employee_id as any)._id;
        } else if (typeof s.employee_id === 'string') {
          empId = s.employee_id;
        }
        if (empId) uniqueEmpIds.add(String(empId));
      }
    });

    const count = uniqueEmpIds.size;
    console.log('TotalstaffCount for branch', activeBranchId, 'on', todayYMD, '=', count);
    return count;
  }, [schedulesState, todayYMD, activeBranchId]);


  // fetch attendance and enrich (with branch-name logic)
  const fetchAttendanceAndEnrich = async (branchIdToUse: string | null) => {
    if (!branchIdToUse) {
      setRecentCheckins([]);
      return;
    }

    try {
      const all = await getAttendanceAllHistory();
      const now = new Date();
      const filtered = (all || []).filter((a) => {
        const aBranchId = a.branch && typeof a.branch === 'object' && 'id' in a.branch ? (a.branch as { id?: string }).id : (typeof a.branch === 'string' ? a.branch : a.branch_id ?? null);

        if (!aBranchId) return false;
        if (String(aBranchId) !== String(branchIdToUse)) return false;
        if (!a.In) return false;
        const inDt = new Date(a.In.replace(' ', 'T'));
        const inYMD = toYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate()));
        if (inYMD !== todayYMD) return false;
        return inDt.getTime() <= now.getTime();
      });

      filtered.sort((a, b) => (a.In < b.In ? 1 : -1));

      const enriched = await Promise.all(
        filtered.map(async (att) => {
          const uid = att.user?.id ?? att.user;
          let userProfile = usersState.find((u) => String(u._id) === String(uid) || String((u as any).id) === String(uid));
          if (!userProfile && uid) {
            try { userProfile = await getUserById(uid); } catch (e) { userProfile = null; }
          }

          const schedule = schedulesState.find((s) => {
            let empId = null;
            if (s.employee_id && typeof s.employee_id === 'object' && '_id' in s.employee_id) {
              empId = (s.employee_id as any)._id;
            } else if (typeof s.employee_id === 'string') {
              empId = s.employee_id;
            }
            if (!empId || !uid) return false;
            const sDate = s.date ? toYMD(new Date(s.date)) : null;
            return String(empId) === String(uid) && sDate === todayYMD;
          }) ?? null;

          // compute status (early/late/noschedule) same as before (based on schedule start_time)
          let status: "early" | "late" | "noschedule" | "not_checked_in" = "noschedule";
          let diffText = "";

          try {
            // duration between In and Out (or now if Out missing) -> shown as diffText in 00h 00m
            const inDt = att.In ? new Date(att.In.replace(' ', 'T')) : null;
            const outDt = att.Out ? new Date(att.Out.replace(' ', 'T')) : null;
            const nowDt = new Date();

            if (inDt) {
              const endDt = outDt && !Number.isNaN(outDt.getTime()) ? outDt : nowDt;
              const durationMins = Math.max(0, Math.round((endDt.getTime() - inDt.getTime()) / 60000));
              diffText = formatMinutesDiff(durationMins);
            } else {
              diffText = formatMinutesDiff(0);
            }

            // status still uses schedule start_time vs "In" time (minutes from midnight)
            if (schedule && schedule.start_time && att.In) {
              const schedMin = hhmmToMinutes(schedule.start_time);
              const inMin = datetimeToMinutes(att.In);
              const startDiff = inMin - schedMin;
              if (startDiff > 0) {
                status = "late";
              } else {
                status = "early";
              }
            } else {
              status = "noschedule";
            }
          } catch (err) {
            console.warn("Error computing status/duration", err);
            status = "noschedule";
            diffText = formatMinutesDiff(0);
          }

          // 🔍 Determine if the user belongs to a different branch
          let branchNameToShow: string | null = null;

          try {
            if (userProfile) {
              // Extract user's actual branch info
              let userBranchId = null;
              if (typeof userProfile.branch === "string") {
                userBranchId = userProfile.branch;
              } else if (userProfile.branch && typeof userProfile.branch === "object" && '_id' in userProfile.branch) {
                userBranchId = (userProfile.branch as { _id?: string })._id ?? null;
              }
              const userBranchName = userProfile.branch && typeof userProfile.branch === "object" ? (userProfile.branch as { name?: string }).name ?? null : null;


              // Compare with current active branch
              if (
                userBranchId &&
                String(userBranchId) !== String(branchIdToUse ?? activeBranchId)
              ) {
                branchNameToShow = userBranchName || (await getBranchById(userBranchId))?.name || null;
              }
            } else if (att.branch_id) {
              // fallback if userProfile not loaded
              const b = await getBranchById(att.branch_id);
              const userBranchId = (b as any)?._id;
              if (userBranchId && String(userBranchId) !== String(branchIdToUse ?? activeBranchId)) {
                branchNameToShow = b?.name ?? null;
              }
            }
          } catch (err) {
            console.warn("branchNameToShow lookup failed", err);
            branchNameToShow = null;
          }

          return {
            attendance: att,
            userProfile,
            schedule,
            status,
            diffText,
            branchNameToShow,
          };
        })
      );

      setRecentCheckins(enriched);
    } catch (e) {
      console.warn("fetchAttendanceAndEnrich failed", e);
      setRecentCheckins([]);
    }
  };

  // initial & deps
  useEffect(() => {
    if (!userId) {
      console.log("No userId found in params");
      return;
    }
    // don’t overwrite if already set
    if (activeBranchId) {
      console.log("activeBranchId already set:", activeBranchId);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        console.log("🔍 Fetching user by ID:", userId);
        const u = await getUserById(userId);
        if (!mounted || !u) {
          console.log("User not found or unmounted");
          return;
        }
        const branchField = u.branch;
        const branchId = typeof branchField === "string" ? branchField : (branchField && typeof branchField === "object" ? (branchField as { _id?: string })._id ?? null : null);


        const branchName = branchField && typeof branchField === "object" ? (branchField as { name?: string }).name ?? null : null;

        console.log("User branch data:", branchField);
        console.log("Extracted branchId:", branchId);
        console.log("Extracted branchName:", branchName);

        if (branchId) {
          setActiveBranchId(String(branchId));
          if (branchName) setActiveBranchName(branchName);
          console.log("activeBranchId set to:", branchId);
        } else {
          console.log("No branchId found for user");
        }
      } catch (err) {
        console.warn("Failed to load branch from userId", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, activeBranchId]);

  useEffect(() => {
    fetchShiftData(activeBranchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, version]);

  useEffect(() => {
    fetchAttendanceAndEnrich(activeBranchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, version, schedulesState, usersState]);

  const handleNotificationPress = () => {
    console.log('Header notification pressed — params:', { userId, langId, activeBranchId });
    // use same param keys you expect in NotificationScreen
    (navigation.navigate as any)("NotificationScreen", { userId, langId, branchId: activeBranchId });
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.timeTrack, color: colors.text }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: handleNotificationPress,
        }}
      />

      <View style={styles.body}>
        <View style={styles.boxes}>
          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image source={require("../../../assets/icons/totalstaff_b.png")} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
            </View>
            {/* <Text style={styles.total_count}>{loadingStaff ? "..." : totalStaff}</Text> */}
            <Text style={styles.total_count}>{loadingShiftData ? "..." : TotalstaffCount}</Text>
          </CartBox>

          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image source={require("../../../assets/icons/staff_tik_g.png")} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
            </View>

            {/* <Text style={styles.shift_count}>{loadingShiftData ? "..." : staffOnShiftCount}</Text> */}
            <Text style={styles.shift_count}>{loadingShiftData ? "..." : String(recentCheckins.length)}</Text>

          </CartBox>
        </View>

        <Text style={styles.heading}>{lang.recent_check_ins}</Text>

        <ScrollView
          style={{ marginBottom: '15%' }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.details}>
            {loadingShiftData ? (
              // Loading state: show spinner centered
              <View style={{ justifyContent: 'center', alignItems: 'center', marginTop: "40%" }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : recentCheckins.length === 0 ? (
              // Loaded but empty: show "No recent check-ins"
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 20 * base }}>
                <Text style={{ textAlign: 'center', color: colors.subtext }}>
                  {lang.no_recent_checkins || 'No recent check-ins'}
                </Text>
              </View>
            ) : (
              // Loaded and has data: show the check-ins
              recentCheckins.map(({ attendance, userProfile, schedule, status, diffText, branchNameToShow }) => {
                const displayName = userProfile?.fullname ?? userProfile?.username ?? attendance.user?.username ?? '—';
                const startTime = schedule?.start_time ? formatTime12(schedule.start_time) : "-";
                const endTime = schedule?.end_time ? formatTime12(schedule.end_time) : "";
                const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;

                const dateDisplay = formatYMDDisplay(attendance.In.split(' ')[0]);

                return (
                  <CartBox key={attendance.id} containerStyle={styles.detail_cartbox}>
                    {branchNameToShow && (
                      <View style={styles.branchHeader}>
                        <Image
                          source={require("../../../assets/icons/branch.png")}
                          style={styles.branchIcon}
                          resizeMode="contain"
                        />
                        <Text style={styles.branchName} numberOfLines={1} ellipsizeMode="tail">
                          {branchNameToShow}
                        </Text>
                      </View>
                    )}

                    <View style={styles.profileRow}>
                      <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />

                      <View style={styles.middleRightContainer}>
                        <View style={styles.name_position}>
                          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
                          <Text style={styles.time} numberOfLines={1} ellipsizeMode="tail">{timeStr}</Text>
                          <Text style={styles.time} numberOfLines={1} ellipsizeMode="tail">{dateDisplay}</Text>
                        </View>

                        <View style={styles.statusInline}>
                          {status === "late" ? (
                            <Text style={styles.status_late} numberOfLines={1} ellipsizeMode="tail">{lang.late}</Text>
                          ) : status === "early" ? (
                            <Text style={styles.status_early} numberOfLines={1} ellipsizeMode="tail">{lang.early}</Text>
                          ) : (
                            <Text style={styles.status_noschedule} numberOfLines={1} ellipsizeMode="tail">{lang.no_schedule}</Text>
                          )}
                          {status !== "noschedule" && <Text style={styles.duration} numberOfLines={1} ellipsizeMode="tail">{diffText}</Text>}
                        </View>
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
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  body: {
    marginTop: 20,
    marginHorizontal: 20,
    flex: 1,
  },
  boxes: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  details: {
  },
  detail_cartbox: {
    width: "100%",
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  profileImage: { width: 38, height: 38, borderRadius: 20, resizeMode: "cover" },
  name_position: { marginLeft: 10, width: "55%", },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 8, fontWeight: fonts.weight.regular, },
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
    borderRadius: 8,
    textAlign: "center",
  },
  status_noschedule: {
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
    width: 55 * base,
  },
  heading: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
    marginBottom: 12,
    marginTop: 20,
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
  },
  icon: {
    width: 30 * base,
    height: 30,
  },
  total_staff: {
    color: colors.search,
    fontWeight: fonts.weight.regular,
    fontSize: 14,
    marginLeft: 8,
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
  noDataText: {
    textAlign: "center",
    color: colors.subtext,
    marginTop: 8,
    marginBottom: 12,
  },
  branchHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    width: '90%'
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  middleRightContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginLeft: 10,
  },
  statusInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 8,
    marginTop: 2,
    flexShrink: 0,
  },
  duration: {
    color: colors.primary,
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.m,
    marginLeft: 8,
    width: 64 * base,
  },
});

export default HomeScreen_A;
