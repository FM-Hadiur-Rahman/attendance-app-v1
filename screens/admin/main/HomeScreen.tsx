// screens/admin/main/WorkScheduleScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  RefreshControl,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json"
import { users, users as usersArr } from "../../../api/Users";
import { schedules } from "../../../api/Schedule";
import { workHours, workHours as workHoursArr } from "../../../api/WorkHours";
import { useNavigation, useRoute } from "@react-navigation/native";
import { getBranchById } from "../../../api/Branch"; 

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

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

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// convert hh:mm:ss -> minutes from midnight
const timeToMinutes = (hhmmss: string) => {
  if (!hhmmss) return 0;
  const parts = hhmmss.split(":").map((p) => parseInt(p, 10) || 0);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
};

// format minutes difference as "1h 30m" or "30m"
const formatMinutesDiff = (mins: number) => {
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
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

// format YYYY-MM-DD -> "Thu, Aug 18"
const formatYMDDisplay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
};

const HomeScreen_A = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Support prop-based injection from Footer (preferred) or fallback to route params.
  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const propSetLangId = props?.setLangId; // if Footer passes a setter

  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;

  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";

  // translation dictionary for this screen
  const lang = (translations as any)[langId] || (translations as any)["en"];

  // today's date in local timezone (Y-M-D)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  // refresh state
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // add this next to your refreshing state
  const [version, setVersion] = useState<number>(0);


  // Pull-to-refresh: clear search and refresh view
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    // bump version to force re-evaluation of all useMemo hooks that depend on it
    setVersion((v) => v + 1);
    setRefreshing(false);
  };
  const currentUser = usersArr.find(u => u.id === userId) || null;
    const currentBranchId = currentUser?.branch_id ?? null;


      // ---------- NEW: use passed branch params (superadmin passes branch_id & branch_name) ----------
  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const passedBranchName = route.params?.branch_name ?? route.params?.branchName ?? null;
    const activeBranchId = passedBranchId || currentBranchId || null;

  // total employees
  const totalStaff = useMemo(
    () => {
      if (!activeBranchId) return 0;
      return usersArr.filter(u => u.role === "employee" && u.branch_id === activeBranchId).length;
    },
    [version, activeBranchId]
  );

  // staff on shift (based on workHours entries for today)
  const todaysWorkHours = useMemo(
    () => workHours.filter((w) => w.date === todayYMD),
    [todayYMD, version]
  );

    // today's unique working employees for this branch (filter workHours for today's date and this branch)
    const staffOnShiftCount = useMemo(() => {
      if (!activeBranchId) return 0;
  
      // compute today's Y-M-D locally (avoids ordering issues)
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      const y = t.getFullYear();
      const m = (t.getMonth() + 1).toString().padStart(2, "0");
      const d = t.getDate().toString().padStart(2, "0");
      const todaysYMD = `${y}-${m}-${d}`;
  
      const set = new Set<string>();
      workHoursArr.forEach(w => {
        if (w.date === todaysYMD) {
          const u = usersArr.find(us => us.id === w.user_id);
          if (u && u.branch_id === activeBranchId) set.add(w.user_id);
        }
      });
      return set.size;
    }, [version, activeBranchId]);
  

  // recent check-ins: today's workHours sorted by check_in descending (most recent first)
// recent check-ins: today's workHours for the active branch, sorted by check_in desc
const recentCheckins = useMemo(() => {
  if (!activeBranchId) return [];

  // get today's Y-M-D (use same local computation as staffOnShiftCount to avoid timezone mismatches)
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const y = t.getFullYear();
  const m = (t.getMonth() + 1).toString().padStart(2, "0");
  const d = t.getDate().toString().padStart(2, "0");
  const todaysYMD = `${y}-${m}-${d}`;

  return workHoursArr
    .filter((w) => w.date === todaysYMD)
    .filter((w) => {
      // include if the work record was for this branch OR the user's default branch is this branch
      const u = usersArr.find((us) => us.id === w.user_id);
      return (w.branch_id && w.branch_id === activeBranchId) || (u && u.branch_id === activeBranchId);
    })
    .slice()
    .sort((a, b) => (a.check_in < b.check_in ? 1 : -1))
    .map((wh) => {
      const user = users.find((u) => u.id === wh.user_id) || null;
      const sched = schedules.find((s) => s.user_id === wh.user_id && s.date === wh.date);
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
      } else {
        status = "noschedule";
      }

      return { work: wh, user, schedule: sched ?? null, status, diffText };
    });
}, [version, activeBranchId]);


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
          onPress: () => {
            console.log("Navigate -> NotificationScreen", { userId, langId: langId, activeBranchId: activeBranchId });
            navigation.navigate("NotificationScreen" as any, { userId, langId: langId, activeBranchId });
          },
        }}
      />

      <View style={styles.body}>
        <View style={styles.boxes}>
          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image
                source={require("../../../assets/icons/totalstaff_b.png")}
                style={styles.icon}
              />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
            </View>
            <Text style={styles.total_count}>{totalStaff}</Text>
          </CartBox>

          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image
                source={require("../../../assets/icons/staff_tik_g.png")}
                style={styles.icon}
              />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
            </View>

            <Text style={styles.shift_count}>{staffOnShiftCount}</Text>
          </CartBox>
        </View>
        <Text style={styles.heading}>{lang.recent_check_ins}</Text>

        <ScrollView
          style={{ marginBottom: '15%' }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          <View style={styles.details}>


            {recentCheckins.map(({ work, user, schedule, status, diffText }) => {
              if (!user) return null;

              const displayName = user.fullname;
              const timeStr = `${formatTime12(work.check_in)} - ${formatTime12(work.check_out)}`;
              const dateDisplay = formatYMDDisplay(work.date);

              // Branch where the user checked in
              const checkinBranch = getBranchById(work.branch_id || schedule?.branch_id);
              const defaultBranch = getBranchById(user.branch_id);

              // Only show branch name if different from default
              const branchName =
                checkinBranch && defaultBranch && checkinBranch.id !== defaultBranch.id
                  ? checkinBranch.name
                  : null;

              return (
                <CartBox key={work.id} containerStyle={styles.detail_cartbox}>
                  {branchName && (
                    <View style={styles.branchHeader}>
                      <Image
                        source={require("../../../assets/icons/branch.png")}
                        style={styles.branchIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.branchName}>{branchName}</Text>
                    </View>
                  )}

                  <View style={styles.profileRow}>
                    <Image
                      source={require("../../../assets/images/profile2.png")}
                      style={styles.profileImage}
                    />

                    {/* Middle + Right grouped together */}
                    <View style={styles.middleRightContainer}>
                      {/* Name + Time */}
                      <View style={styles.name_position}>
                        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                          {displayName}
                        </Text>
                        <Text style={styles.time}>{timeStr}</Text>
                        <Text style={styles.time}>{dateDisplay}</Text>
                      </View>

                      {/* Status + Duration */}
                      <View style={styles.statusInline}>
                        {status === "late" ? (
                          <Text style={styles.status_late}>{lang.late}</Text>
                        ) : status === "early" ? (
                          <Text style={styles.status_early}>{lang.early}</Text>
                        ) : (
                          <Text style={styles.status_noschedule}>{lang.no_schedule}</Text>
                        )}
                        {status !== "noschedule" && (
                          <Text style={styles.duration}>{diffText}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </CartBox>

              );
            })}

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
  name_position: { marginLeft: 10, width: "65%" },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text },
  time: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 8, fontWeight: fonts.weight.regular as any },

  status_early: {
    fontWeight: fonts.weight.regular as any,
    color: colors.status_early,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_early_bg,
    borderRadius: 10,
    textAlign: "center",

  },
  status_late: {
    fontWeight: fonts.weight.regular as any,
    color: colors.status_late,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    backgroundColor: colors.status_late_bg,
    borderRadius: 8,
    textAlign: "center",
  },
  status_noschedule: {
    fontWeight: fonts.weight.regular as any,
    color: colors.subtext,
    fontSize: fonts.size.xs,
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 7,
    textAlign: "center",
  },
  heading: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
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
    fontWeight: fonts.weight.regular as any,
    fontSize: 14,
    marginLeft: 8,
    width: "75%"
  },
  total_count: {
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.xxl,
    color: colors.primary,
    marginTop: 8,
  },
  shift_count: {
    fontWeight: fonts.weight.medium as any,
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
  },

  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 6, 

  },
  branchName: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    color: colors.text,
  },

  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  middleRightContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
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
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.m,
    marginLeft: 8,
    textAlign: "right",
  },

});

export default HomeScreen_A;
