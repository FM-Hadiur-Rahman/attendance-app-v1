// screens/admin/main/WorkScheduleScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { RefreshControl } from "react-native";
import { users } from "../../../api/Users";
import { schedules as schedulesArr } from "../../../api/Schedule";
import { useNavigation, useRoute } from "@react-navigation/native";
import translations from "../../../assets/translations.json";

import Toast, { showSuccessToast, toastConfig } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import { getBranchById } from "../../../api/Branch";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const dateToYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatDisplayDate = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

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
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";

  // get branch id passed in params (superadmin may pass this)
  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  // fallback: admin's default branch from users list
  const currentAdmin = users.find((u) => u.id === userId) || null;
  const activeBranchId = passedBranchId || currentAdmin?.branch_id || null;


  // translation dictionary for this screen (translations imported at the top)
  const lang = (translations as any)[langId] || (translations as any)["en"];


  const [displayDate, setDisplayDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [version, setVersion] = useState<number>(0);

  const [refreshing, setRefreshing] = useState(false);

  const uniqueSortedDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of schedulesArr) set.add(s.date);
    const arr = Array.from(set);
    arr.sort();
    return arr;
  }, [version]);

  const displayYMD = useMemo(() => dateToYMD(displayDate), [displayDate]);

  const findPrevScheduledYMD = () => {
    const arr = uniqueSortedDates;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] < displayYMD) return arr[i];
    }
    return null;
  };

  const findNextScheduledYMD = () => {
    const arr = uniqueSortedDates;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > displayYMD) return arr[i];
    }
    return null;
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
    // if no branch context, return schedules for the date (or you can return [])
    if (!activeBranchId) {
      // if you prefer to show nothing when no branch found, return [] instead
      // return [];
    }

    const list = schedulesArr
      .filter((s) => s.date === displayYMD)
      .filter((s) => {
        // include schedule only if schedule.branch_id matches activeBranchId
        // OR the scheduled user's default branch matches activeBranchId
        const u = users.find((usr) => usr.id === s.user_id) || null;
        return (s.branch_id && s.branch_id === activeBranchId) || (u && u.branch_id === activeBranchId);
      })
      .sort((a, b) => (a.start_time > b.start_time ? 1 : -1))
      .map((s) => ({ schedule: s, user: users.find((u) => u.id === s.user_id) || null }))
      .filter((x) => x.user && x.user.role === "employee");
    return list;
  }, [displayYMD, version, activeBranchId]);


  // If user presses the floating add button
  const openAddScreen = () => {
    console.log("Navigate -> AddScheduleScreen", { userId, langId: langId, mode: "create" });
    navigation.navigate("AddScheduleScreen" as any, {
      userId, langId,
      onSave: (newSchedule: { id?: string; user_id: string; start_time: string; end_time: string; date: string }) => {
        // create or update
        if (newSchedule.id) {
          const idx = schedulesArr.findIndex((s) => s.id === newSchedule.id);
          if (idx !== -1) {
            schedulesArr[idx] = {
              ...schedulesArr[idx],
              user_id: newSchedule.user_id,
              start_time: newSchedule.start_time,
              end_time: newSchedule.end_time,
              date: newSchedule.date,
              updateDate: new Date().toISOString(),
            };
            setVersion((v) => v + 1);
            setDisplayDate(ymdToDate(newSchedule.date));
            showSuccessToast(lang.schedule_updated);
            console.log("Schedule updated ->", schedulesArr[idx]);
            return;
          } else {
            // id provided but not found -> add as new with that id
            const id = newSchedule.id;
            schedulesArr.push({
              id,
              user_id: newSchedule.user_id,
              start_time: newSchedule.start_time,
              end_time: newSchedule.end_time,
              date: newSchedule.date,
              createDate: new Date().toISOString(),
              updateDate: new Date().toISOString(),
            } as any);
            setVersion((v) => v + 1);
            setDisplayDate(ymdToDate(newSchedule.date));
            showSuccessToast("Schedule added");
            return;
          }
        }

        // new schedule (no id) -> create
        const id = `S${(schedulesArr.length + 1).toString().padStart(3, "0")}`;
        schedulesArr.push({
          id,
          user_id: newSchedule.user_id,
          start_time: newSchedule.start_time,
          end_time: newSchedule.end_time,
          date: newSchedule.date,
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString(),
        } as any);
        setVersion((v) => v + 1);
        const dt = ymdToDate(newSchedule.date);
        setDisplayDate(dt);
        showSuccessToast("Schedule added");
      },
    });
  };
  // Refresh -> clear inputs
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1200));
    // clearAllInputs();
    setRefreshing(false);
  };
  // When tapping an existing schedule to edit
  const openEditScreen = (scheduleId: string) => {
    console.log("Navigate -> AddScheduleScreen", { userId, langId: langId, mode: "edit", id: scheduleId });
    navigation.navigate("AddScheduleScreen" as any, {
      userId, langId, id: scheduleId,
      onSave: (updated: { id?: string; user_id: string; start_time: string; end_time: string; date: string }) => {
        // update existing schedule if id present
        if (updated.id) {
          const idx = schedulesArr.findIndex((s) => s.id === updated.id);
          if (idx !== -1) {
            schedulesArr[idx] = {
              ...schedulesArr[idx],
              user_id: updated.user_id,
              start_time: updated.start_time,
              end_time: updated.end_time,
              date: updated.date,
              updateDate: new Date().toISOString(),
            };
            setVersion((v) => v + 1);
            setDisplayDate(ymdToDate(updated.date));
            showSuccessToast(lang.schedule_updated);
            console.log("Schedule updated ->", schedulesArr[idx]);
            return;
          }
        }
        // fallback: push as new
        const id = `S${(schedulesArr.length + 1).toString().padStart(3, "0")}`;
        schedulesArr.push({
          id,
          user_id: updated.user_id,
          start_time: updated.start_time,
          end_time: updated.end_time,
          date: updated.date,
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString(),
        } as any);
        setVersion((v) => v + 1);
        setDisplayDate(ymdToDate(updated.date));
        showSuccessToast(lang.schedule_added);
      },
    });
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Work_Schedule, color: colors.text }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: () => {
            console.log("Navigate -> NotificationScreen", { userId, langId: langId, activeBranchId });
            navigation.navigate("NotificationScreen" as any, { userId, langId: langId, activeBranchId });
          },
        }}
      />

      <View style={styles.body}>
        <View style={styles.date_Change}>
          <TouchableOpacity activeOpacity={prevHas ? 0.7 : 1} onPress={goToPrevScheduled} disabled={!prevHas}>
            <Image source={prevHas ? require("../../../assets/icons/d_back_b.png") : require("../../../assets/icons/d_back_g.png")} style={styles.date_Control} />
          </TouchableOpacity>

          <CartBox containerStyle={styles.date_cartbox}>
            <Image source={require("../../../assets/icons/calenderdate_b.png")} style={styles.calender} />
            <Text style={styles.dateText}>{formatDisplayDate(displayDate)}</Text>
          </CartBox>

          <TouchableOpacity activeOpacity={nextHas ? 0.7 : 1} onPress={goToNextScheduled} disabled={!nextHas}>
            <Image source={nextHas ? require("../../../assets/icons/d_front_b.png") : require("../../../assets/icons/d_front_g.png")} style={styles.date_Control} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ marginTop: 20, marginBottom: '15%' }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {schedulesForDate.length === 0 ? <Text style={styles.noSchedulesText}>{lang.no_schedules_for_date}</Text> : null}

          {schedulesForDate.map(({ schedule, user }) => {
            if (!user) return null;

            const displayName = user.fullname;
            const position = user.position ?? "";
            //  Compute end time using duration (in hours)
            // Compute end time based on start_time + duration (in hours)
            const computeEndTime = (startTime: string, durationHours: number) => {
              if (!startTime) return "";
              const [hh, mm, ss] = startTime.split(":").map(Number);
              const start = new Date();
              start.setHours(hh, mm, ss || 0);
              start.setMinutes(start.getMinutes() + (durationHours || 0) * 60);

              const endHH = String(start.getHours()).padStart(2, "0");
              const endMM = String(start.getMinutes()).padStart(2, "0");
              const endSS = String(start.getSeconds()).padStart(2, "0");
              return `${endHH}:${endMM}:${endSS}`;
            };

            const endTime = computeEndTime(schedule.start_time, schedule.duration);
            const timeStr = `${formatTime12(schedule.start_time)} - ${formatTime12(endTime)}`;



            // Find branch details
            const getBranchById = (id: string) => {
              const { branches } = require("../../../api/Branch"); // import branches here
              return branches.find((b: any) => b.id === id);
            };

            const branch = getBranchById(schedule.branch_id);
            const branchName = branch ? branch.name : "Unknown Branch";

            //  Only show branch name if schedule.branch_id ≠ user.branch_id
            const showBranch = schedule.branch_id !== user.branch_id;

            return (
              <TouchableOpacity key={schedule.id} onPress={() => openEditScreen(schedule.id)}>
                <CartBox containerStyle={styles.detail_cartbox}>

                  {showBranch && (
                    <View style={styles.branchHeader}>
                      <Image
                        source={require("../../../assets/icons/branch.png")}
                        style={styles.branchIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.branchName}>{branchName}</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <Image
                        source={require("../../../assets/images/profile2.png")}
                        style={styles.profileImage}
                      />
                      <View style={styles.name_position}>
                        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                          {displayName}
                        </Text>
                        <Text style={styles.position}>{position}</Text>
                      </View>
                    </View>

                    <View style={{ justifyContent: "center", alignItems: "flex-end" }}>
                      <Text style={styles.time}>{timeStr}</Text>
                    </View>
                  </View>
                </CartBox>
              </TouchableOpacity>
            );
          })}

        </ScrollView>
      </View>

      <Button3 width={60} height={60} onPress={openAddScreen} />
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
