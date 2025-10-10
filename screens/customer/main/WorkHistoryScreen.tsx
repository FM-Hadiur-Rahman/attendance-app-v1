// screens/customer/main/WorkHistoryScreen.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Image,
  RefreshControl,
} from "react-native";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import { workHours } from "../../../api/WorkHours";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";

interface Props {
  userId?: string;
  langId?: string;
}

// 👉 Utility: format time (HH:mm:ss → 11:23 AM)
const formatTime = (time: string) => {
  const [h, m, s] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, s);
  return d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .replace("am", "AM")
    .replace("pm", "PM");
};


// 👉 Utility: format date (YYYY-MM-DD → Thu, Aug 18)
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);

  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const monthMap = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"
  ];
  const month = monthMap[d.getMonth()];
  const day = d.getDate();

  return `${weekday}, ${month} ${day}`;
};


// 👉 Utility: calculate duration between check_in & check_out
const calcDuration = (checkIn?: string, checkOut?: string) => {
  if (!checkIn || !checkOut) return { h: 0, m: 0, text: "00h 00m" };

  const [h1, m1, s1 = 0] = checkIn.split(":").map(Number);
  const [h2, m2, s2 = 0] = checkOut.split(":").map(Number);

  if ([h1, m1, s1, h2, m2, s2].some((v) => isNaN(v))) {
    return { h: 0, m: 0, text: "00h 00m" };
  }

  const start = new Date(2000, 0, 1, h1, m1, s1);
  const end = new Date(2000, 0, 1, h2, m2, s2);
  let diff = (end.getTime() - start.getTime()) / 60000; // in minutes

  if (diff < 0) diff += 24 * 60; // handle overnight

  const h = Math.floor(diff / 60);
  const m = Math.floor(diff % 60);

  const hText = h.toString().padStart(2, "0");
  const mText = m.toString().padStart(2, "0");

  return { h, m, text: `${hText}h ${mText}m` };
};



const groupWorkHours = (entries: typeof workHours) => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Current week start (Mon) and end (Sun)
  const currWeekStart = new Date(today);
  currWeekStart.setDate(today.getDate() - today.getDay() + 1);
  currWeekStart.setHours(0, 0, 0, 0);

  const currWeekEnd = new Date(currWeekStart);
  currWeekEnd.setDate(currWeekStart.getDate() + 6);
  currWeekEnd.setHours(23, 59, 59, 999);

  // Helper: format week range
  const formatWeekRange = (d: Date) => {
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const format = (dt: Date) =>
      dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

    return `${format(weekStart)} - ${format(weekEnd)}`;
  };

  // Group entries
  const groups: Record<string, typeof workHours> = {};

  entries.forEach((w) => {
    if (w.date === todayStr) {
      groups["Today"] = groups["Today"] || [];
      groups["Today"].push(w);
    } else {
      const d = new Date(w.date);

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

  // Reorder: Today → This week → older weeks
  const worked: { title: string; data: typeof workHours }[] = [];

  if (groups["Today"])
    worked.push({
      title: "Today",
      data: groups["Today"].sort((a, b) => {
        // sort by check_in descending
        const t1 = a.check_in ? a.check_in.localeCompare(b.check_in) : 0;
        const t2 = b.check_in ? b.check_in.localeCompare(a.check_in) : 0;
        return t2 - t1;
      }),
    });

  if (groups["This week"])
    worked.push({
      title: "This week",
      data: groups["This week"].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    });

  Object.keys(groups)
    .filter((k) => k !== "Today" && k !== "This week")
    .sort(
      (a, b) =>
        new Date(groups[b][0].date).getTime() -
        new Date(groups[a][0].date).getTime()
    )
    .forEach((k) =>
      worked.push({
        title: k,
        data: groups[k].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      })
    );

  return worked;
};




const WorkHistoryScreen: React.FC<Props> = ({ userId, langId }) => {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // here you’d call API instead of setTimeout
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, []);
  const userWorkHours = workHours.filter((w) => w.user_id === userId);

  const currentLang = langId || "en";
  const lang = translations[currentLang];

  // Summary calculations
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = userWorkHours.filter((w) => w.date === today);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthEntries = userWorkHours.filter((w) =>
    w.date.startsWith(monthPrefix)
  );

  const sumMinutes = (arr: typeof workHours) =>
    arr.reduce((acc, w) => {
      const d = calcDuration(w.check_in, w.check_out);
      return acc + d.h * 60 + d.m;
    }, 0);

  const todayTotal = sumMinutes(todayEntries);
  const monthTotal = sumMinutes(monthEntries);

  const totalToText = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hText = h.toString().padStart(2, "0");
    const mText = m.toString().padStart(2, "0");
    return `${hText}h ${mText}m`;
  };


  const sections = useMemo(() => groupWorkHours(userWorkHours), [userWorkHours]);

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Work_Hours_Log, color: colors.text }}
      />
      <View style={styles.body}>

        {/* Summary Cards */}
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
            <Text style={styles.summaryLabel}>{lang.Today}</Text>
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
            <Text style={styles.summaryLabel}>{lang.This_Month}</Text>
            <Text style={styles.summaryValue}>{totalToText(monthTotal)}</Text>
          </CartBox>
        </View>

        {/* Log Summary */}
        <View style={styles.logSummaryRow}>
          <Image
            source={require("../../../assets/icons/calender_black.png")}
            style={styles.icon}
            resizeMode="contain"
          />
          <Text style={styles.logSummaryText}>{lang.Work_Hours_Log_Summary}</Text>
        </View>

        {/* Work Hours List */}
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

            return (
              <CartBox
                marginTop={8}
                height={62}
                paddingRight={12}
                paddingLeft={12}
                paddingTop={12}
                paddingBottom={12}
                borderRadius={10}
                alignItems="flex-start"
              >
                <View style={styles.itemRow}>
                  <Text style={styles.timeText}>{timeText}</Text>
                  {item.check_out ? (
                    <Text style={styles.durationText}>{duration.text}</Text>
                  ) : (
                    <Text style={styles.durationText}>--</Text>
                  )}
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
});

export default WorkHistoryScreen;
