// screens/admin/main/WorkScheduleScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Header from "../../../components/Header";

import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { RefreshControl } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import translations from "../../../assets/translations.json";
import Toast, { showSuccessToast, toastConfig } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import { getAllBranches, getBranchById } from "../../../api/Branchs";
import { getSchedulesForDate } from "../../../api/checkin_checkout";
import { getProfile, ProfileUser, getUserById } from "../../../api/profile";
import { ScheduleItem } from "../../../api/schedules";


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const dateToYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

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

const WorkScheduleScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // support prop-based or route-based injection (Footer passes props)
  const propUserId = props?.userId;
  const propLangId = props?.langId;

  // param resolution (support props or route)
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";

  // accept branch if caller passed it (keep names unchanged for compatibility)
  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const passedBranchName = route.params?.branch_name ?? route.params?.branchName ?? null;

  // local state for the active branch (computed like HomeScreen_A)
  const [activeBranchId, setActiveBranchId] = useState<string | null>(passedBranchId || null);
  const [activeBranchName, setActiveBranchName] = useState<string | null>(passedBranchName || null);

  // translation dictionary for this screen (translations imported at the top)
  const lang = (translations as any)[langId] || (translations as any)["en"];

  const [displayDate, setDisplayDate] = useState<Date>(new Date());
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const todayYMD = new Date().toISOString().split("T")[0];
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, ProfileUser>>({});
  const [userPositions, setUserPositions] = useState<Record<string, string>>({});
  const [skipNextLoad, setSkipNextLoad] = useState(false);
  const [version, setVersion] = useState<number>(0);
  const [branchMap, setBranchMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const allBranches = await getAllBranches();
        const map: Record<string, string> = {};
        allBranches.forEach(b => {
          map[b._id] = b.name;
        });
        setBranchMap(map);
      } catch (err) {
        console.error('Failed to load branches', err);
      }
    };
    loadBranches();
  }, []);

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await getProfile();
        console.log(" Loaded user profile:", profile);
        setUser(profile);
      } catch (err) {
        console.error("❌ Failed to load user profile:", err);
      }
    };
    loadUserProfile();
  }, []);

  // If branch not passed, try to resolve it from the userId (same pattern as HomeScreen_A)
  useEffect(() => {
    if (!userId) {
      console.log("WorkScheduleScreen: no userId in params");
      return;
    }
    if (activeBranchId) {
      console.log("WorkScheduleScreen: activeBranchId already set:", activeBranchId);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        console.log("🔍 WorkScheduleScreen fetching user by ID:", userId);
        const u = await getUserById(userId);
        if (!mounted || !u) return;

        const branchField = u.branch;
        const branchId =
          typeof branchField === "string"
            ? branchField
            : branchField?._id ?? null;
        const branchName =
          typeof branchField === "object"
            ? branchField?.name ?? null
            : null;

        if (branchId) {
          setActiveBranchId(String(branchId));
          if (branchName) setActiveBranchName(branchName);
          console.log("WorkScheduleScreen: activeBranchId set to:", branchId);
        } else {
          console.log("WorkScheduleScreen: user has no branch");
        }
      } catch (err) {
        console.warn("WorkScheduleScreen: failed to resolve branch from userId", err);
      }
    })();

    return () => { mounted = false; };
  }, [userId, activeBranchId]);

  const displayYMD = useMemo(() => dateToYMD(displayDate), [displayDate]);
  const loadSchedules = useCallback(async (date: Date) => {
    if (!user) return;
    try {
      setLoading(true);
      const dateYMD = date.toISOString().split("T")[0];
      let data = await getSchedulesForDate(dateYMD);

      const loggedUserBranchId =
        typeof user?.branch === "object" && user?.branch !== null 
          ? (user.branch as any)?._id 
          : user?.branch;

      // Strict branch match filter
      data = data.filter((s) => {
        // First check if employee_id exists
        if (!s.employee_id) return false;
        
        let employeeBranchId;
        if (typeof s.employee_id === 'string') {
          // If employee_id is a string, we need to get the user first to determine their branch
          // For now, we'll allow it through and filter later
          return true;
        } else if (typeof s.employee_id === 'object' && s.employee_id !== null) {
          // If employee_id is an object, we can't directly access branch since it's not in the interface
          // We'll need to fetch the user profile to get the branch information
          return true;
        } else {
          return false;
        }
      });

      setSchedules(data);
    } catch (err) {
      console.error("❌ Error loading schedules:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);






  const findPrevScheduledYMD = () => {
    const prev = new Date(displayDate);
    prev.setDate(displayDate.getDate() - 1); // move one day back
    return dateToYMD(prev);
  };

  const findNextScheduledYMD = () => {
    const next = new Date(displayDate);
    next.setDate(displayDate.getDate() + 1); // move one day forward
    return dateToYMD(next);
  };

  const prevYMD = findPrevScheduledYMD();
  const nextYMD = findNextScheduledYMD();
  const prevHas = !!prevYMD;
  const nextHas = !!nextYMD;

  const ymdToDate = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  };

  const goToPrevScheduled = () => {
    if (!prevYMD) return;
    setDisplayDate(ymdToDate(prevYMD));
  };
  const goToNextScheduled = () => {
    if (!nextYMD) return;
    setDisplayDate(ymdToDate(nextYMD));
  };

  const schedulesForDate = useMemo(() => {
    if (!schedules || schedules.length === 0) return [];

    const displayYMD = dateToYMD(displayDate);

    return schedules
      .filter((s) => {
        if (!s?.date) return false;

        const schedDate = new Date(s.date).toISOString().split("T")[0];
        return schedDate === displayYMD;
      })
      .map((s) => ({
        schedule: s,
        user: s.employee_id || null,
      }))
      .filter((x) => x.user && typeof x.user === 'object' && x.user !== null && (x.user as any).role === "user");
  }, [schedules, displayDate]);


  // If user presses the floating add button
  const openAddScreen = () => {
    // Derive branchId safely
    const branchToUse =
      activeBranchId ||
      (typeof user?.branch === "string"
        ? user.branch
        : typeof user?.branch === "object" && user?.branch !== null
          ? (user.branch as any)?._id
          : null) ||
      null;

    console.log("Navigate -> AddScheduleScreen", {
      userId,
      langId,
      branchId: branchToUse,
      mode: "create",
    });

    navigation.navigate("AddScheduleScreen" as any, {
      userId,
      langId,
      branchId: branchToUse, // safe branchId pass
      onSave: (newSchedule: {
        id?: string;
        user_id: string;
        start_time: string;
        end_time: string;
        date: string;
        branch_id?: string;
      }) => {
        setVersion((v) => v + 1);
        const dt = ymdToDate(newSchedule.date);
        setDisplayDate(dt);
        showSuccessToast("Schedule added");
      },
    });
  };

  // Refresh -> clear inputs
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSchedules(displayDate);
    setRefreshing(false);
  }, [displayDate, loadSchedules]);

  const goToPrevDay = () => {
    const prev = new Date(displayDate);
    prev.setDate(displayDate.getDate() - 1);
    setDisplayDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(displayDate);
    next.setDate(displayDate.getDate() + 1);
    setDisplayDate(next);
  };

  useEffect(() => {
    loadSchedules(displayDate);
  }, [displayDate, loadSchedules]);

  // When tapping an existing schedule to edit
  const openEditScreen = (scheduleId: string) => {
    navigation.navigate("EditScheduleScreen" as any, {
      userId,
      langId,
      id: scheduleId,
      onSave: async (updated: {
        id?: string;
        user_id: string;
        start_time: string;
        end_time: string;
        date: string;
      }) => {
        setDisplayDate(ymdToDate(updated.date));
        setVersion((v) => v + 1);
        await loadSchedules(ymdToDate(updated.date)); // triggers spinner automatically
        showSuccessToast(updated.id ? lang.schedule_updated : lang.schedule_added);
      },
    });
  };

  useEffect(() => {
    if (activeBranchId) {
      loadSchedules(displayDate);
    }
  }, [activeBranchId]);

  // --- Fetch full profiles for employee IDs found in schedulesForDate ---
  useEffect(() => {
    if (!schedulesForDate || schedulesForDate.length === 0) {
      setUserProfiles({});
      return;
    }

    let mounted = true;

    (async () => {
      try {
        // collect unique employee IDs
        const ids = Array.from(
          new Set(
            schedulesForDate.map(
              (item) =>
                typeof item.schedule?.employee_id === 'object' && item.schedule?.employee_id !== null
                  ? (item.schedule?.employee_id as any)?._id
                  : item.schedule?.employee_id
            ).filter(Boolean)
          )
        ) as string[];

        const profiles: Record<string, ProfileUser> = {};

        await Promise.all(
          ids.map(async (id) => {
            try {
              const profile = await getUserById(id);
              if (profile?.fullname) {
                profiles[id] = profile; // only store if fullname exists
              }
            } catch (err) {
              console.warn("getUserById failed for", id, err);
            }
          })
        );

        if (!mounted) return;
        setUserProfiles(profiles);
      } catch (err) {
        console.warn("Failed to load user profiles for schedules", err);
      }
    })();

    return () => { mounted = false; };
  }, [schedulesForDate]);

  useEffect(() => {
    const fetchPositions = async () => {
      const positions: Record<string, string> = {};

      for (const s of schedulesForDate) {
        const userId = typeof s.user === 'object' && s.user !== null 
          ? (s.user as any)._id || (s.user as any).user_id 
          : s.user;
        if (userId && !positions[userId]) {
          try {
            const profile = await getUserById(userId);
            positions[userId] = profile?.position ?? 'No Position';
          } catch (err) {
            console.warn('Failed to fetch profile for user', userId, err);
            positions[userId] = 'No Position';
          }
        }
      }
      setUserPositions(positions);
    };

    if (schedulesForDate.length > 0) {
      fetchPositions();
    }
  }, [schedulesForDate]);

  useEffect(() => {
    if (skipNextLoad) {
      setSkipNextLoad(false);
      return;
    }
    loadSchedules(displayDate);
  }, [displayDate, loadSchedules]);


  return (
    <View style={styles.container}>
      {/* Header */}
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{
          type: "text",
          value: lang.Work_Schedule,
          color: colors.text,
        }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: () => {
            console.log('WorkScheduleScreen to NotificationScreen — params:', { userId, langId, activeBranchId });
            navigation.navigate("NotificationScreen" as any, {
              userId,
              langId,
              branchId: activeBranchId,
            });
          },
        }}
      />

      {/* Body */}
      <View style={styles.body}>
        {/* 🔹 Day-wise Date Navigation */}
        <View style={styles.date_Change}>
          <TouchableOpacity
            activeOpacity={prevHas ? 0.7 : 1}
            onPress={goToPrevDay}
            disabled={!prevHas}
          >
            <Image
              source={
                prevHas
                  ? require("../../../assets/icons/d_back_b.png")
                  : require("../../../assets/icons/d_back_g.png")
              }
              style={styles.date_Control}
            />
          </TouchableOpacity>

          <CartBox containerStyle={styles.date_cartbox}>
            <Image
              source={require("../../../assets/icons/calenderdate_b.png")}
              style={styles.calender}
            />
            <Text style={styles.dateText}>{formatDisplayDate(displayDate)}</Text>
          </CartBox>

          <TouchableOpacity
            activeOpacity={nextHas ? 0.7 : 1}
            onPress={goToNextDay}
            disabled={!nextHas}
          >
            <Image
              source={
                nextHas
                  ? require("../../../assets/icons/d_front_b.png")
                  : require("../../../assets/icons/d_front_g.png")
              }
              style={styles.date_Control}
            />
          </TouchableOpacity>
        </View>

        {/* 🔹 Scroll list */}
        <ScrollView
          style={{ marginTop: 20, marginBottom: "15%" }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          }
        >
          {/* Empty State */}
          {loading ? (
            <View
              style={{
                justifyContent: "center",
                alignItems: "center",
                marginTop: "50%"
              }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
            </View>

          ) : schedulesForDate.length === 0 ? (
            <Text style={styles.noSchedulesText}>{lang.no_schedules_for_date}</Text>
          ) : (


schedulesForDate.map(({ schedule, user }, index) => {
  if (!user) return null;

  // Unique Key
  const uniqueKey =
    schedule._id ||
    schedule.id ||
    `${schedule.date}-${schedule.start_time}-${typeof user === 'object' && user !== null ? (user as any).user_id : user}-${index}`;

  // Time String
  const startTime = schedule.start_time || "";
  const endTime = schedule.end_time || "";
  const timeStr = `${formatTime12(startTime)} - ${formatTime12(endTime)}`;

  // 🔹 Branch Logic: compare schedule branch vs employee's default branch
  const employeeBranchId =
    typeof user === 'object' && user !== null
      ? typeof (user as any).branch === "object" && (user as any).branch !== null
        ? (user as any).branch?._id 
        : typeof (user as any).branch === "string" ? (user as any).branch : undefined
      : undefined;

  const scheduleBranchId =
    typeof schedule.branch_id === "object" && schedule.branch_id !== null 
      ? (schedule.branch_id as any)?._id 
      : typeof schedule.branch_id === "string" ? schedule.branch_id : undefined;

  const scheduleBranchName =
    typeof schedule.branch_id === "object" && schedule.branch_id !== null
      ? (schedule.branch_id as any)?.name
      : scheduleBranchId ? branchMap[scheduleBranchId as string] || "Unknown Branch" : "Unknown Branch";

  // Show branch name only if schedule branch is different from employee's branch
  const showBranch = scheduleBranchId && employeeBranchId && scheduleBranchId !== employeeBranchId;
              return (
                <TouchableOpacity
                  key={`${schedule._id || schedule.id || index}-${schedule.date}-${schedule.start_time}`}
                  onPress={() => openEditScreen(schedule._id)}

                >
                  <CartBox containerStyle={styles.detail_cartbox}>
                    {/* 🔹 Branch Info */}
                    {showBranch && (
                      <View style={styles.branchHeader}>
                        <Image
                          source={require("../../../assets/icons/branch.png")}
                          style={styles.branchIcon}
                          resizeMode="contain"
                        />
                        <Text style={styles.branchName}>{scheduleBranchName}</Text>
                      </View>
                    )}

                    {/* 🔹 User Info & Time */}
                    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                      {/* Profile + Name + Position */}
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Image
                          source={require("../../../assets/images/profile2.png")}
                          style={styles.profileImage}
                        />
                        <View style={styles.name_position}>
                          {/* fullname */}
                          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                            {(() => {
                              const employeeId =
                                typeof schedule?.employee_id === 'object' && schedule?.employee_id !== null
                                  ? (schedule?.employee_id as any)?._id
                                  : schedule?.employee_id;

                              const fullname = employeeId ? userProfiles[employeeId]?.fullname : null;

                              return fullname || "Unknown User"; // ONLY fullname
                            })()}
                          </Text>

                          {/* Position */}
                          <Text style={styles.position}>
                            {typeof user === 'object' && user !== null
                              ? userPositions[(user as any)?._id || (user as any)?.user_id || ''] || (user as any)?.position || 'No Position'
                              : 'No Position'}
                          </Text>
                        </View>
                      </View>

                      {/* Time */}
                      <View style={{ justifyContent: "center", alignItems: "flex-end" }}>
                        <Text style={styles.time}>
                          {`${formatTime12(schedule.start_time)} - ${formatTime12(schedule.end_time)}`}
                        </Text>
                      </View>
                    </View>
                  </CartBox>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
      {/* Floating Add Button */}
      <Button3 width={60} height={60} onPress={openAddScreen} />
      {/* Toast */}
      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  body: {
    marginTop: 20,
    marginHorizontal: 20,
    flex: 1,
  },
  date_Change: {
    flexDirection: "row",
    alignItems: "center",
  },
  date_Control: {
    width: 44,
    height: 40,
    resizeMode: "contain",
  },
  date_cartbox: {
    marginLeft: 8,
    marginRight: 8,
    backgroundColor: colors.secondary,
    borderColor: colors.dateboxborder,
    borderWidth: 1,
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  calender: {
    width: 16,
    height: 16,
    marginRight: 8,
    resizeMode: "contain",
  },
  dateText: {
    fontSize: 14,
    fontWeight: "400",
    color: colors.text,
  },
  noSchedulesText: {
    textAlign: "center",
    color: colors.subtext,
    marginTop: 8,
    marginBottom: 12,
  },
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
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: "cover",
  },
  name_position: {
    marginLeft: 10,
    width: '70%'
  },
  name: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    color: colors.text,

  },
  position: {
    fontSize: fonts.size.s,
    color: colors.subtext,
    marginTop: 8,
  },
  time: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    color: colors.subtext,
  },
  branchHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignSelf: 'flex-start'

  },

  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 6,

  },

  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
  },
});

export default WorkScheduleScreen;
