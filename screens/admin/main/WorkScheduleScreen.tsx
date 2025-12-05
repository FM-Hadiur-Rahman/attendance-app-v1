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
import {
  NavigationProp,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import translations from "../../../assets/translations.json";
import Toast, { showSuccessToast, toastConfig } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import { getAllBranches } from "../../../api/Branchs";
import { getSchedulesForDate } from "../../../api/checkin_checkout";
import { getProfile, ProfileUser, getUserById } from "../../../api/profile";
import { ScheduleItem } from "../../../api/schedules";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type BranchLike =
  | string
  | {
      _id?: string;
      id?: string;
      name?: string;
      branch_name?: string;
      title?: string;
    }
  | null
  | undefined;

type EmployeeLike =
  | string
  | {
      _id?: string;
      user_id?: string;
      username?: string;
      fullname?: string;
      branch?: BranchLike;
      role?: string;
    }
  | null
  | undefined;

type ProfileWithBranch = Omit<ProfileUser, "branch"> & { branch?: BranchLike };

type ScheduleEntity = Omit<ScheduleItem, "employee_id" | "branch_id"> & {
  employee_id?: EmployeeLike;
  branch_id?: BranchLike;
};

type AddSchedulePayload = {
  id?: string;
  user_id: string;
  start_time: string;
  end_time: string;
  date: string;
  branch_id?: string;
};

type EditSchedulePayload = {
  id?: string;
  user_id: string;
  start_time: string;
  end_time: string;
  date: string;
};

type WorkScheduleParams = {
  userId?: string;
  langId?: string;
  id?: string;
  language?: string;
  branch_id?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  branch_name?: string | null;
};

type RootStackParamList = {
  WorkScheduleScreen: WorkScheduleParams;
  AddScheduleScreen: {
    userId?: string;
    langId?: string;
    branchId?: string | null;
    mode: "create" | "edit" | string;
    onSave: (newSchedule: AddSchedulePayload) => void;
  };
  EditScheduleScreen: {
    userId?: string;
    langId?: string;
    id: string;
    onSave: (updated: EditSchedulePayload) => void;
  };
  NotificationScreen: {
    userId?: string;
    langId?: string;
    branchId?: string | null;
  };
};

type ScheduleForDisplay = {
  schedule: ScheduleEntity;
  user: EmployeeLike | null;
};

type WorkScheduleProps = {
  userId?: string;
  langId?: string;
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const dateToYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

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

const isBranchObject = (
  branch: BranchLike
): branch is Exclude<BranchLike, string | null | undefined> =>
  typeof branch === "object" && branch !== null;

const extractBranchId = (branch: BranchLike): string | null => {
  if (!branch) return null;
  if (typeof branch === "string") return branch;
  if (isBranchObject(branch)) {
    if (branch._id) return String(branch._id);
    if (branch.id) return String(branch.id);
  }
  return null;
};

const extractBranchName = (
  branch: BranchLike,
  map: Record<string, string>
): string => {
  if (isBranchObject(branch)) {
    if (branch.name) return branch.name;
    if (branch.branch_name) return branch.branch_name;
    if (branch.title) return branch.title;
  }
  const branchId = extractBranchId(branch);
  if (branchId && map[branchId]) return map[branchId];
  if (branchId) return map[branchId] ?? "Unknown Branch";
  return "Unknown Branch";
};

const isEmployeeObject = (
  employee: EmployeeLike
): employee is Exclude<EmployeeLike, string | null | undefined> =>
  typeof employee === "object" && employee !== null;

const extractEmployeeId = (employee: EmployeeLike): string | null => {
  if (!employee) return null;
  if (typeof employee === "string") return employee;
  if (isEmployeeObject(employee)) {
    if (employee._id) return employee._id;
    if (employee.user_id) return String(employee.user_id);
  }
  return null;
};

const WorkScheduleScreen: React.FC<WorkScheduleProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "WorkScheduleScreen">>();
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
  const langKey = (langId in translations ? langId : "en") as keyof typeof translations;
  const lang = translations[langKey];

  const [displayDate, setDisplayDate] = useState<Date>(new Date());
  const [schedules, setSchedules] = useState<ScheduleEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [user, setUser] = useState<ProfileWithBranch | null>(null);
  const [userProfiles, setUserProfiles] = useState<
    Record<string, ProfileWithBranch>
  >({});
  const [branchMap, setBranchMap] = useState<Record<string, string>>({});
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

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
    void loadBranches();
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

        const branchField: BranchLike =
          (u as ProfileWithBranch).branch ?? null;
        const branchId = extractBranchId(branchField);
        const branchName = extractBranchName(branchField, branchMap);

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

  const loadSchedules = useCallback(async (date: Date) => {
    if (!user) {
      console.log('Skipping loadSchedules: user not loaded yet');
      return;
    }
    try {
      setLoading(true);
      const dateYMD = dateToYMD(date);
      console.log('🔄 Loading schedules for dateYMD:', dateYMD);
      let loggedUserBranchId: string | null;
      loggedUserBranchId = extractBranchId(user.branch) ?? null;

      if (!loggedUserBranchId) {
        console.warn("WorkScheduleScreen: logged user has no branch - hiding schedules");
        setSchedules([]);
        setUserProfiles({});
        return;
      }
      const scheduleDataRaw = await getSchedulesForDate(dateYMD);
      const data: ScheduleEntity[] = scheduleDataRaw.map((item) => ({
        ...item,
        employee_id: item.employee_id,
        branch_id: item.branch_id,
      }));

      const employeeIds = Array.from(
        new Set(
          data
            .map((s) => {
              if (!s.employee_id) return null;
              return extractEmployeeId(s.employee_id);
            })
            .filter(Boolean) as string[]
        )
      );
      const profileCache: Record<string, ProfileWithBranch | null> = {};
      await Promise.all(
        employeeIds.map(async (id) => {
          try {
            const p = await getUserById(id);
            profileCache[id] = (p as ProfileWithBranch) || null;
          } catch (err) {
            profileCache[id] = null;
            console.warn("getUserById failed for", id, err);
          }
        })
      );
      const filtered = data.filter((s) => {
        // resolve scheduleBranchId (if schedule has branch_id)
        let scheduleBranchId: string | undefined;
        scheduleBranchId = extractBranchId(s.branch_id ?? null) ?? undefined;
        let empId: string | undefined;
        empId = extractEmployeeId(s.employee_id ?? null) ?? undefined;
        let employeeProfileBranchId: string | undefined;
        if (empId && profileCache[empId]) {
          const prof = profileCache[empId];
          if (prof?.branch) {
            employeeProfileBranchId = extractBranchId(prof.branch) ?? undefined;
          }
        }
        const resolvedEmployeeBranchId = employeeProfileBranchId || scheduleBranchId || null;
        if (!resolvedEmployeeBranchId) return false;

        // Filter by role
        if (empId && profileCache[empId] && profileCache[empId]?.role !== "user")
          return false;

        return String(resolvedEmployeeBranchId) === String(loggedUserBranchId);
      });

      // Extract used profiles for the filtered schedules
      const usedProfiles: Record<string, ProfileWithBranch> = {};
      filtered.forEach((s) => {
        let empId: string | undefined;
        empId = extractEmployeeId(s.employee_id ?? null) ?? undefined;
        if (empId && profileCache[empId]) {
          const profileForUser = profileCache[empId];
          if (profileForUser) {
            usedProfiles[empId] = profileForUser;
          }
        }
      });

      setSchedules(filtered);
      setUserProfiles(usedProfiles);
      console.log(`📅 Found ${filtered.length} schedules for ${dateYMD} in branch ${loggedUserBranchId}`);
    } catch (err) {
      console.error("❌ Error loading schedules:", err);
      setSchedules([]);
      setUserProfiles({});
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

  // Single useEffect to handle loading schedules
  useEffect(() => {
    void loadSchedules(displayDate);
  }, [displayDate, user, refreshTrigger]);

  const schedulesForDate = useMemo<ScheduleForDisplay[]>(() => {
    if (!schedules || schedules.length === 0) return [];

    const displayYMD = dateToYMD(displayDate);

    const filteredSchedules = schedules
      .filter((s) => {
        if (!s.date) return false;

        const schedDate = new Date(s.date).toISOString().split("T")[0];
        return schedDate === displayYMD;
      })
      .map((s) => ({
        schedule: s,
        user: s.employee_id ?? null,
      }));

    console.log(`📋 schedulesForDate length for ${displayYMD}: ${filteredSchedules.length} (from ${schedules.length} total schedules)`);
    return filteredSchedules;
  }, [schedules, displayDate]);


  // If user presses the floating add button
  const openAddScreen = () => {
    // Derive branchId safely
    const branchToUse =
      activeBranchId ||
      extractBranchId(user?.branch) ||
      null;

    console.log("Navigate -> AddScheduleScreen", {
      userId,
      langId,
      branchId: branchToUse,
      mode: "create",
    });

    navigation.navigate("AddScheduleScreen", {
      userId,
      langId,
      branchId: branchToUse, // safe branchId pass
      mode: "create",
      onSave: (newSchedule: AddSchedulePayload) => {
        const dt = ymdToDate(newSchedule.date);
        setDisplayDate(dt);
        setRefreshTrigger((t) => t + 1);
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

  // When tapping an existing schedule to edit
  const openEditScreen = (scheduleId: string) => {
    navigation.navigate("EditScheduleScreen", {
      userId,
      langId,
      id: scheduleId,
      onSave: async (updated: EditSchedulePayload) => {
        const updatedDate = ymdToDate(updated.date);
        setDisplayDate(updatedDate);
        setRefreshTrigger((t) => t + 1);
        showSuccessToast(updated.id ? lang.schedule_updated : lang.schedule_added);
      },
    });
  };

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
            navigation.navigate("NotificationScreen", {
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

              // Generate a truly unique key by combining schedule ID, date, time, and index
              const uniqueKey =
                schedule._id ? `${schedule._id}-${index}` :
                  schedule.id ? `${schedule.id}-${index}` :
                    `${schedule.date}-${schedule.start_time}-${(isEmployeeObject(user) ? user._id || user.user_id || "" : user || "")}-${index}`;

              // EmpId computation
              const empId = typeof schedule.employee_id === "object" && schedule.employee_id !== null
                  ? schedule.employee_id._id
                  : schedule.employee_id;

              const profile = userProfiles[empId || ''];

              if (!profile) {
                console.warn(`⚠️ No profile found for empId: ${empId}`);
                return null;
              }

              // Time String
              const startTime = schedule.start_time || "";
              const endTime = schedule.end_time || "";
              const timeStr = `${formatTime12(startTime)} - ${formatTime12(endTime)}`;

              // 🔹 Branch Logic: compare schedule branch vs employee's default branch
              const employeeBranchId = profile.branch
                ? typeof profile.branch === "object" && profile.branch !== null
                  ? profile.branch._id
                  : profile.branch
                : undefined;

              const scheduleBranchId =
                typeof schedule.branch_id === "object" && schedule.branch_id !== null
                  ? schedule.branch_id._id
                  : typeof schedule.branch_id === "string" ? schedule.branch_id : undefined;

              const scheduleBranchName =
                typeof schedule.branch_id === "object" && schedule.branch_id !== null
                  ? schedule.branch_id.name
                  : scheduleBranchId ? branchMap[scheduleBranchId as string] || "Unknown Branch" : "Unknown Branch";

              // Show branch name only if schedule branch is different from employee's branch
              const showBranch = scheduleBranchId && employeeBranchId && scheduleBranchId !== employeeBranchId;

              return (
                <TouchableOpacity
                  key={uniqueKey}
                  onPress={() => { openEditScreen(schedule._id || ''); }}
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
                        <Text style={styles.branchName} ellipsizeMode="tail" numberOfLines={1}>{scheduleBranchName}</Text>
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
                            {profile.fullname || "Unknown User"}
                          </Text>

                          {/* Position */}
                          <Text style={styles.position}>
                            {profile.position || 'No Position'}
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
      <Button3
        width={60}
        height={60}
        onPress={openAddScreen}
        iconSource={require("../../../assets/icons/button3.png")}
      />
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
    fontWeight: fonts.weight.regular,
    color: colors.text,

  },
  position: {
    fontSize: fonts.size.s,
    color: colors.subtext,
    marginTop: 8,
  },
  time: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
    color: colors.subtext,
  },
  branchHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignSelf: 'flex-start',
    alignItems: "center",
    width: '90%'
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    alignSelf: "center"
  },
  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
  },
});

export default WorkScheduleScreen;