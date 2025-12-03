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
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import { getUserById, getUsers } from "../../../api/profile";
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

const formatYMD = (d: Date): string => {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayDate = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const yesterdayDate = (() => {
  const d = new Date(todayDate);
  d.setDate(d.getDate() - 1);
  return d;
})();
const yesterdayYMD = formatYMD(yesterdayDate);

const parseAttendanceDatetime = (s: string | undefined | null): Date | null => {
  if (!s) return null;
  // Replace space with 'T' so Date can parse (ISO-like)
  const iso = s.replace(' ', 'T');
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

type CacheEntry<T> = { value: T; expiresAt: number };
const simpleCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds (tweakable)
const cacheGet = <T,>(key: string): T | undefined => {
  const e = simpleCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    simpleCache.delete(key);
    return undefined;
  }
  return e.value as T;
};
/** Set cache */
const cacheSet = <T,>(key: string, value: T, ttlMs = CACHE_TTL_MS) => {
  simpleCache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

interface ScreenProps {
  userId: string;
  langId: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  routeRefresh?: boolean;
  onConsumedRefresh?: () => void;
  toastMessage?: string;
  onConsumedToast?: () => void;
  branch?: any;
  createdUser?: any;
}

const HomeScreen_A: React.FC<ScreenProps> = (props) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId;
  const routeLangId = route.params?.langId;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [version, setVersion] = useState<number>(0);

  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;

  const [activeBranchId, setActiveBranchId] = useState<string | null>(passedBranchId || null);

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
      status: "early" | "late" | "ontime" | "noschedule";
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

  /**
   * Load schedules for today + yesterday for the given branchId.
   * Caches result briefly to reduce API calls while polling.
   *
   * - Uses getSchedulesForDate(dateYMD, { branchId })
   * - Merges and deduplicates schedules by _id
   */
  const loadSchedulesForBranchWithCache = async (branchIdToUse: string | null): Promise<ScheduleItem[]> => {
    if (!branchIdToUse) return [];

    const cacheKey = `schedules:${branchIdToUse}:${todayYMD}:${yesterdayYMD}`;
    const cached = cacheGet<ScheduleItem[]>(cacheKey);
    if (cached) return cached;

    // Fetch only the two dates we need. Backend should accept branchId filter.
    const [todaySchedules, yesterdaySchedules] = await Promise.all([
      getSchedulesForDate(todayYMD, { branchId: branchIdToUse }),
      getSchedulesForDate(yesterdayYMD, { branchId: branchIdToUse }),
    ]);

    const merged = [...(todaySchedules ?? []), ...(yesterdaySchedules ?? [])];

    // dedupe by _id or id
    const dedupe = new Map<string, ScheduleItem>();
    merged.forEach((s) => {
      const key = s._id;
      dedupe.set(String(key), s);
    });

    const out = Array.from(dedupe.values());
    cacheSet(cacheKey, out);
    return out;
  };

  /**
   * fetchShiftData: sets schedulesState and usersState.
   * - Keeps implementation small.
   * - Ensures only needed data for branch is fetched.
   */
  const fetchShiftData = async (branchIdToUse: string | null): Promise<void> => {
    if (!branchIdToUse) {
      setSchedulesState([]);
      setUsersState([]);
      return;
    }

    setLoadingShiftData(true);
    try {
      // getSchedulesForDate already handles pagination; pass branchId so backend can filter.
      const [schedules, users] = await Promise.all([
        loadSchedulesForBranchWithCache(branchIdToUse),
        getUsers({ limit: 1000 }), // ideally backend supports branchId + limit, change if available
      ]);
      setSchedulesState(schedules);
      setUsersState(users ?? []);
    } catch (err) {
      console.warn('fetchShiftData failed', err);
      setSchedulesState([]);
      setUsersState([]);
    } finally {
      setLoadingShiftData(false);
    }
  };

  //To calculate total staff count (For the current branch, Today date schedule)
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
        branchIdOfSchedule = (s.branch_id)._id;
      } else if (typeof s.branch_id === 'string') {
        branchIdOfSchedule = s.branch_id;
      }

      if (sYMD === todayYMD && branchIdOfSchedule && String(branchIdOfSchedule) === String(activeBranchId)) {
        // employee_id may be object or string
        let empId = null;
        if (s.employee_id && typeof s.employee_id === 'object' && '_id' in s.employee_id) {
          empId = (s.employee_id)._id;
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


  /**
   * Enrich attendance records for display.
   *
   * Rules:
   * - Include attendance that belongs to branchIdToUse
   * - Include:
   *    * check-ins from today (In YMD === todayYMD) where In <= now
   *    * check-ins from yesterday (In YMD === yesterdayYMD) only when Out is missing (ongoing cross-day)
   * - For schedule lookup: match schedule.date === the YMD of the In time (yesterday or today)
   * - Cache attendance briefly to reduce repeated API calls during polling
   */
  const fetchAttendanceAndEnrich = async (branchIdToUse: string | null): Promise<void> => {
    if (!branchIdToUse) {
      setRecentCheckins([]);
      return;
    }

    try {
      const cacheKey = `attendanceAll:${branchIdToUse}:${todayYMD}:${yesterdayYMD}`;
      const cached = cacheGet<AttendanceHistoryItem[]>(cacheKey);
      const all = cached ?? (await getAttendanceAllHistory());
      if (!cached) cacheSet(cacheKey, all);

      const now = new Date();

      const filtered = (all || []).filter((record) => {
        // branch id normalization
        const recordBranchId = record.branch_id ?? null;

        if (!recordBranchId) return false;
        if (String(recordBranchId) !== String(branchIdToUse)) return false;
        if (!record.In) return false;

        const inDt = parseAttendanceDatetime(record.In);
        if (!inDt) return false;

        const inYMD = formatYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate()));

        // include today's check-ins (up to now)
        if (inYMD === todayYMD) {
          return inDt.getTime() <= now.getTime();
        }
        // include yesterday's check-ins only if Out is missing (ongoing cross-day)
        if (inYMD === yesterdayYMD && !record.Out) {
          return true;
        }
        return false;
      });

      filtered.sort((a, b) => (a.In < b.In ? 1 : -1));

      const enriched = await Promise.all(
        filtered.map(async (att) => {
          const uid = att.user.id;
          let userProfile = usersState.find((u) => String((u)._id) === String(uid));
          if (!userProfile && uid) {
            try {
              userProfile = await getUserById(String(uid));
            } catch {
              userProfile = null;
            }
          }

          // choose schedule date based on In YMD (yesterday or today)
          const inDt = parseAttendanceDatetime(att.In);
          const inYMD = inDt ? formatYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate())) : todayYMD;

          const schedule = schedulesState.find((s) => {
            let empId: string | null = null;
            if (s.employee_id && typeof s.employee_id === 'object' && '_id' in s.employee_id) {
              empId = s.employee_id._id ?? null;
            } else if (!empId || !uid) return false;
            const sDate = s.date ? formatYMD(new Date(s.date)) : null;
            return String(empId) === String(uid) && sDate === inYMD;
          }) ?? null;

          // compute duration & status (same logic, but safe)
          let status: "early" | "late" | "ontime" | "noschedule" = "noschedule";
          let diffText = formatMinutesDiff(0);

          try {
            const inDtLocal = parseAttendanceDatetime(att.In);
            const outDtLocal = parseAttendanceDatetime(att.Out ?? undefined);
            if (inDtLocal) {
              const endDt = outDtLocal ?? new Date();
              const durationMins = Math.max(0, Math.round((endDt.getTime() - inDtLocal.getTime()) / 60000));
              diffText = formatMinutesDiff(durationMins);
            }

            if (schedule && schedule.start_time && att.In) {
              const schedMin = hhmmToMinutes(schedule.start_time);
              const inMin = datetimeToMinutes(att.In);
              if (!Number.isNaN(schedMin) && !Number.isNaN(inMin)) {
                const startDiff = inMin - schedMin;
                if (startDiff > 0) status = "late";
                else if (startDiff === 0) status = "ontime";
                else status = "early";
              }
            }
          } catch (err) {
            console.warn('compute status error', err);
            status = "noschedule";
          }

          // branchNameToShow logic 
          let branchNameToShow: string | null = null;
          try {
            if (userProfile) {
              let userBranchId: string | null = null;
              if (typeof userProfile.branch === 'string') userBranchId = userProfile.branch;
              else if (userProfile.branch && typeof userProfile.branch === 'object' && '_id' in userProfile.branch) {
                userBranchId = userProfile.branch._id ?? null;
              }
              const userBranchName = userProfile.branch && typeof userProfile.branch === 'object' ? userProfile.branch.name ?? null : null;
              if (userBranchId && String(userBranchId) !== String(branchIdToUse ?? activeBranchId)) {
                branchNameToShow = userBranchName || (await getBranchById(userBranchId))?.name || null;
              }
            } else if (att.branch_id) {
              const b = await getBranchById(att.branch_id);
              const userBranchId = b._id;
              if (userBranchId && String(userBranchId) !== String(branchIdToUse ?? activeBranchId)) {
                branchNameToShow = b?.name ?? null;
              }
            }
          } catch (err) {
            console.warn('branchNameToShow lookup failed', err);
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
    } catch (err) {
      console.warn('fetchAttendanceAndEnrich failed', err);
      setRecentCheckins([]);
    }
  };
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!activeBranchId || !isFocused) return;
    // immediate refresh when screen becomes focused
    fetchShiftData(activeBranchId);
    fetchAttendanceAndEnrich(activeBranchId);

    // poll attendance only (keeps UI live while screen open)
    const pollMs = 60 * 1000; // 60s - adjust as needed
    const interval = setInterval(() => {
      fetchAttendanceAndEnrich(activeBranchId);
    }, pollMs);

    return () => {
      clearInterval(interval);
    };
  }, [activeBranchId, isFocused, version]);

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
  }, [activeBranchId, version]);

  useEffect(() => {
    fetchAttendanceAndEnrich(activeBranchId);
  }, [activeBranchId, version, schedulesState, usersState]);

  const handleNotificationPress = () => {
    console.log('Header notification pressed — params:', { userId, langId, activeBranchId });
    (navigation.navigate)("NotificationScreen", { userId, langId, branchId: activeBranchId });
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
            <Text style={styles.total_count}>{loadingShiftData ? "..." : TotalstaffCount}</Text>
          </CartBox>

          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image source={require("../../../assets/icons/staff_tik_g.png")} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
            </View>

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
                const displayName = userProfile?.fullname ?? userProfile?.username ?? 'Unknown';
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
                          ) : status === "early" || status === "ontime" ? (
                            <Text style={styles.status_early} numberOfLines={1} ellipsizeMode="tail">
                              {status === "ontime" ? (lang.on_time) : lang.early}
                            </Text>
                          ) : (
                            <Text style={styles.status_noschedule} numberOfLines={1} ellipsizeMode="tail">{lang.no_schedule}</Text>
                          )}

                          {status !== "noschedule" &&
                            <Text style={styles.duration} numberOfLines={1} ellipsizeMode="tail">{diffText}</Text>}
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
  profileImage: { width: 38 * base, height: 38, borderRadius: 20, resizeMode: "cover" },
  name_position: { marginLeft: 10, width: "55%", },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, color: colors.text, },
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
    marginRight: 8
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
    marginRight: 8
  },
  status_noschedule: {
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 8,
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
    width: '90%',
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    alignSelf: "center",
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
  },
  statusInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
    flexShrink: 0,
    width: '45%',
  },
  duration: {
    color: colors.primary,
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.m,
    width: 70,
  },
});

export default HomeScreen_A;
