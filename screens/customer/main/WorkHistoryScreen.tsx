import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Image,
  RefreshControl,
  Dimensions,
} from "react-native";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import * as Location from "expo-location";

import { workHours, WorkHour } from "../../../api/WorkHours";
import { users } from "../../../api/Users";
import { schedules, Schedule } from "../../../api/Schedule";
import { getBranchById, branches } from "../../../api/Branch";

/* ---------- interfaces ---------- */
interface Props {
  userId?: string;
  langId?: string;
}

/* ---------- utilities ---------- */
const formatTime = (time: string) => {
  const [h, m, s] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, s || 0);
  return d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .replace("am", "AM")
    .replace("pm", "PM");
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const monthMap = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"
  ];
  const month = monthMap[d.getMonth()];
  const day = d.getDate();
  return `${weekday}, ${month} ${day}`;
};

const calcDuration = (checkIn?: string, checkOut?: string) => {
  if (!checkIn || !checkOut) return { h: 0, m: 0, text: "00h 00m" };
  const [h1, m1, s1 = 0] = checkIn.split(":").map((v) => Number(v) || 0);
  const [h2, m2, s2 = 0] = checkOut.split(":").map((v) => Number(v) || 0);

  const start = new Date(2000, 0, 1, h1, m1, s1);
  let end = new Date(2000, 0, 1, h2, m2, s2);
  let diffMinutes = (end.getTime() - start.getTime()) / 60000;
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  const h = Math.floor(diffMinutes / 60);
  const m = Math.floor(diffMinutes % 60);
  return { h, m, text: `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m` };
};

const timeToMinutes = (t?: string) => {
  if (!t) return 0;
  const [h = 0, m = 0, s = 0] = t.split(":").map((v) => Number(v) || 0);
  return h * 60 + m;
};

const findBestScheduleForWork = (entry: WorkHour): Schedule | undefined => {
  const candidateSchedules = schedules.filter(
    (s) => s.user_id === entry.user_id && s.date === entry.date
  );
  if (candidateSchedules.length === 0) return undefined;

  const workStart = timeToMinutes(entry.check_in);
  const workEnd = entry.check_out ? timeToMinutes(entry.check_out) : workStart + 1;

  const scored = candidateSchedules.map((s) => {
    const schedStart = timeToMinutes(s.start_time);
    const schedEnd = schedStart + (s.duration || 0) * 60;
    const overlap = Math.max(0, Math.min(schedEnd, workEnd) - Math.max(schedStart, workStart));
    const startDiff = Math.abs(schedStart - workStart);
    return { s, overlap, startDiff };
  });

  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return a.startDiff - b.startDiff;
  });

  return scored[0]?.s;
};

/* ---------- group work hours ---------- */
const groupWorkHours = (entries: WorkHour[]) => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currWeekStart = new Date(today);
  const day = today.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  currWeekStart.setDate(today.getDate() + offsetToMonday);
  currWeekStart.setHours(0, 0, 0, 0);
  const currWeekEnd = new Date(currWeekStart);
  currWeekEnd.setDate(currWeekStart.getDate() + 6);
  currWeekEnd.setHours(23, 59, 59, 999);

  const formatWeekRange = (d: Date) => {
    const weekStart = new Date(d);
    const dd = weekStart.getDay();
    const off = dd === 0 ? -6 : 1 - dd;
    weekStart.setDate(weekStart.getDate() + off);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const format = (dt: Date) =>
      dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${format(weekStart)} - ${format(weekEnd)}`;
  };

  const groups: Record<string, WorkHour[]> = {};

  entries.forEach((w) => {
    if (w.date === todayStr) {
      groups["Today"] = groups["Today"] || [];
      groups["Today"].push(w);
    } else {
      const d = new Date(w.date + "T00:00:00");
      if (d >= currWeekStart && d <= currWeekEnd) {
        groups["This week"] = groups["This week"] || [];
        groups["This week"].push(w);
      } else {
        const label = formatWeekRange(d);
        groups[label] = groups[label] || [];
        groups[label].push(w);
      }
    }
  });

  const worked: { title: string; data: WorkHour[] }[] = [];
  if (groups["Today"]) worked.push({ title: "Today", data: groups["Today"] });
  if (groups["This week"]) worked.push({ title: "This week", data: groups["This week"] });

  Object.keys(groups)
    .filter((k) => k !== "Today" && k !== "This week")
    .sort((a, b) => {
      const dateA = new Date(groups[a][0].date).getTime();
      const dateB = new Date(groups[b][0].date).getTime();
      return dateB - dateA;
    })
    .forEach((k) => worked.push({ title: k, data: groups[k] }));

  return worked;
};

/* ---------- main screen ---------- */
const screenWidth = Dimensions.get("window").width;

const WorkHistoryScreen: React.FC<Props> = ({ userId = "U001", langId }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [branchAddresses, setBranchAddresses] = useState<Record<string, string>>({});

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  /* ---------- fetch readable addresses ---------- */
  useEffect(() => {
    const fetchAddresses = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("Permission to access location denied");
        return;
      }

      const newAddresses: Record<string, string> = {};
      for (const branch of branches) {
        try {
          const result = await Location.reverseGeocodeAsync({
            latitude: branch.location.latitude,
            longitude: branch.location.longitude,
          });

          if (result[0]) {
            const { name, street, city, region, country } = result[0];
            newAddresses[branch.id] = [name, street, city, region, country]
              .filter(Boolean)
              .join(", ");
          } else {
            newAddresses[branch.id] = "Unknown location";
          }
        } catch (err) {
          newAddresses[branch.id] = "Location unavailable";
        }
      }
      setBranchAddresses(newAddresses);
    };

    fetchAddresses();
  }, []);

  const currentUser = users.find((u) => u.id === userId);
  const userBranchId = currentUser?.branch_id;
  const userWorkHours = workHours.filter((w) => w.user_id === userId);

  const currentLang = langId || "en";
  const lang = (translations as any)[currentLang] || translations["en"];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEntries = userWorkHours.filter((w) => w.date === todayStr);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthEntries = userWorkHours.filter((w) => w.date.startsWith(monthPrefix));

  const sumMinutes = (arr: WorkHour[]) =>
    arr.reduce((acc, w) => {
      const d = calcDuration(w.check_in, w.check_out);
      return acc + d.h * 60 + d.m;
    }, 0);

  const totalToText = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  };

  const sections = useMemo(() => groupWorkHours(userWorkHours), [userWorkHours]);

  const todayTotal = sumMinutes(todayEntries);
  const monthTotal = sumMinutes(monthEntries);

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{
          type: "text",
          value: lang.Work_Hours_Log || "Work Hours Log",
          color: colors.text,
        }}
      />
      <View style={styles.body}>
        <View style={styles.summaryRow}>
          <CartBox
            width="48%"
            height={78}
            borderRadius={10}
            justifyContent="center"
            alignItems="flex-start"
            borderWidth={1}
            paddingLeft={12}
            paddingRight={12}
            paddingTop={12}
            paddingBottom={12}
            backgroundColor={colors.secondary}
          >
            <Text style={styles.summaryLabel}>{lang.Today || "Today"}</Text>
            <Text style={styles.summaryValue}>{totalToText(todayTotal)}</Text>
          </CartBox>

          <CartBox
            width="48%"
            height={78}
            borderRadius={10}
            justifyContent="center"
            alignItems="flex-start"
            borderWidth={1}
            paddingLeft={12}
            paddingRight={12}
            paddingTop={12}
            paddingBottom={12}
            backgroundColor={colors.secondary}
          >
            <Text style={styles.summaryLabel}>{lang.This_Month || "This Month"}</Text>
            <Text style={styles.summaryValue}>{totalToText(monthTotal)}</Text>
          </CartBox>
        </View>

        <View style={styles.logSummaryRow}>
          <Image
            source={require("../../../assets/icons/calender_black.png")}
            style={styles.icon}
            resizeMode="contain"
          />
          <Text style={styles.logSummaryText}>
            {lang.Work_Hours_Log_Summary || "Work Hours Log Summary"}
          </Text>
        </View>

        <SectionList
          sections={sections}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderSectionHeader={({ section }) =>
            section.data.length > 0 ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const duration = calcDuration(item.check_in, item.check_out);
            const timeText = item.check_out
              ? `${formatTime(item.check_in)} - ${formatTime(item.check_out)}`
              : `${formatTime(item.check_in)} - Work Process`;

            const matchedSchedule = findBestScheduleForWork(item);
            const entryBranchId = matchedSchedule?.branch_id || userBranchId;
            const entryBranch = entryBranchId ? getBranchById(entryBranchId) : undefined;
            const showBranchInfo = !!entryBranch && entryBranchId !== userBranchId;

            return (
              <CartBox
                marginTop={8}
                paddingRight={12}
                paddingLeft={12}
                paddingTop={12}
                paddingBottom={12}
                borderRadius={10}
                alignItems="flex-start"
              >
                {showBranchInfo && (
                  <View>
                    <View style={styles.brnamerow}>
                      <Image
                        source={require("../../../assets/icons/branch.png")}
                        style={styles.branchIcon}
                        resizeMode="contain"
                      />
                      <Text numberOfLines={1} style={styles.branchName}>
                        {entryBranch?.name || ""}
                      </Text>
                    </View>
                    <View style={styles.branchLocationRow}>
                      <Image
                        source={require("../../../assets/icons/location_g.png")}
                        style={styles.locationIcon}
                        resizeMode="contain"
                      />
                      <Text numberOfLines={1} style={styles.branchLocationText} ellipsizeMode="tail">
                        {branchAddresses[entryBranch?.id || ""]}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.itemRow}>
                  <Text style={styles.timeText}>{timeText}</Text>
                  <Text style={styles.durationText}>
                    {item.check_out ? duration.text : "--"}
                  </Text>
                </View>

                <Text style={styles.dateText}>{formatDate(item.date)}</Text>
              </CartBox>
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressBackgroundColor={colors.secondary}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      </View>
    </View>
  );
};

export default WorkHistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.secondary
  },
  body: {
    flex: 1,
    paddingHorizontal: 20
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 11,
  },
  summaryLabel: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.search,
    minHeight: 16,
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.medium as any,
    fontFamily: fonts.family.regular,
    color: colors.primary,
  },
  logSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 4,
  },
  icon: {
    width: 16, height: 16, marginRight: 4
  },
  logSummaryText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.subtext,
    marginTop: 20,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  timeText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
  },
  durationText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.medium as any,
    fontFamily: fonts.family.regular,
    color: colors.primary,
    minHeight: 16,
  },
  dateText: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.medium as any,
    fontFamily: fonts.family.regular,
    color: colors.subtext,
  },
  brnamerow: {
    flexDirection: "row",
    marginBottom: 8
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 4
  },
  branchInfo: {
    flexDirection: "row"
  },
  branchName: {
    fontSize: fonts.size.m,
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular as any,
    color: colors.text,
    lineHeight: 16,
    maxWidth: "90%"
  },
  
  branchLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  locationIcon: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  branchLocationText: {
    fontSize: fonts.size.m,
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular as any,
    color: colors.subtext2,
    lineHeight: 14,
    maxWidth: "90%"
  },
});


