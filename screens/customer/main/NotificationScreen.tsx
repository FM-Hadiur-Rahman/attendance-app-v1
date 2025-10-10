// screens/customer/main/NotificationScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  Image,
} from "react-native";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";

interface NotificationItem {
  n_id: string;
  userId: string; //Add this
  n_type: string;
  title: string;
  subtitle: string;
  createdTime: string;
  updatedTime?: string;
}


const NotificationScreen: React.FC<{ userId?: string; langId?: string }> = ({ userId, langId }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const currentLang = langId || "en";
  const lang = translations[currentLang];

  const fetchNotifications = async (userId?: string) => {
    const now = new Date();
    const dummy: NotificationItem[] = [
      {
        n_id: "N001",
        userId: "U004", // user-specific
        n_type: "Shift Starting soon",
        title: "Shift Starting soon",
        subtitle: "Your shift starts in 15 minutes. Don't forget to check in!",
        createdTime: "2025-09-30T08:00:00Z",
      },
      {
        n_id: "N002",
        userId: "U004",
        n_type: "Shift Assigned",
        title: "Shift Assigned",
        subtitle: "You’ve been assigned a new shift: Tue Aug 16, 09:00 AM – 09:00 PM.",
        createdTime: "2025-09-29T03:00:00Z",
      },
      {
        n_id: "N003",
        userId: "U002",
        n_type: "Shift Updated",
        title: "Shift Updated",
        subtitle: "Your shift on Wed Aug 21 has been updated: 10:00 AM – 06:00 PM.",
        createdTime: "2025-09-25T03:00:00Z",
      },
      {
        n_id: "N004",
        userId: "U001",
        n_type: "Shift Cancelled",
        title: "Shift Cancelled",
        subtitle: "Your shift on Fri Aug 23 has been cancelled by the manager.",
        createdTime: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    // Filter notifications by logged-in user
    setNotifications(userId ? dummy.filter(n => n.userId === userId) : dummy);
  };
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      fetchNotifications(userId);
      setRefreshing(false);
    }, 1000);
  }, []);


  useEffect(() => {
    fetchNotifications(userId); //pass userId
  }, [userId]);


  // Group notifications by Today / Yesterday
  const groupNotifications = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const todayList = notifications.filter(
      (n) => new Date(n.createdTime) >= today
    );
    const yesterdayList = notifications.filter(
      (n) =>
        new Date(n.createdTime) >= yesterday &&
        new Date(n.createdTime) < today
    );

    // Group everything older by exact date
    const olderList = notifications.filter(
      (n) => new Date(n.createdTime) < yesterday
    );

    // Build sections
    const sections: { title: string; data: NotificationItem[] }[] = [];
    if (todayList.length > 0) sections.push({ title: lang.Today, data: todayList });
    if (yesterdayList.length > 0)
      sections.push({ title: lang.Yesterday, data: yesterdayList });

    if (olderList.length > 0) {
      //  group by date (dd/mm/yyyy)
      const grouped: { [key: string]: NotificationItem[] } = {};
      olderList.forEach((item) => {
        const d = new Date(item.createdTime);
        const key = d.toLocaleDateString("en-GB"); // dd/mm/yyyy
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });

      Object.keys(grouped)
        .sort((a, b) => {
          // sort by newest date first
          const [da, ma, ya] = a.split("/").map(Number);
          const [db, mb, yb] = b.split("/").map(Number);
          return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
        })
        .forEach((date) => {
          sections.push({ title: date, data: grouped[date] });
        });
    }

    return sections;
  };



  // Format relative time
  const formatTime = (time: string) => {
    const now = new Date();
    const created = new Date(time);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins} min ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 3) return `${diffHours} hour ago`;

    // Show formatted time when 2+ hours ago
    return created.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Notification, color: colors.text }}
      />
      <View style={styles.body}>

        <SectionList
          sections={groupNotifications()}
          keyExtractor={(item) => item.n_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressBackgroundColor={colors.secondary}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.dateRow}>
              <Image
                source={require("../../../assets/icons/calender_black.png")}
                style={styles.dateIcon}
              />
              <Text style={styles.sectionTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <CartBox
              marginTop={12}
              paddingLeft={12}
              paddingRight={12}
              borderRadius={12}
              paddingTop={12}
              paddingBottom={12}
              backgroundColor={colors.background}
              alignItems="flex-start"
              justifyContent="flex-start"
            >
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
              <View style={styles.timeRow}>
                <Image
                  source={require("../../../assets/icons/clock_g.png")}
                  style={styles.icon}
                />
                <Text style={styles.timeText}>{formatTime(item.createdTime)}</Text>
              </View>
            </CartBox>
          )}
        />
      </View>
    </View>
  );
};

export default NotificationScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  body: { flex: 1, backgroundColor: colors.secondary, paddingHorizontal: 20, marginTop: 20 },
  dateRow: { flexDirection: "row", alignItems: "center", marginTop: 12, },
  dateIcon: { width: 16, height: 16, marginRight: 4, resizeMode: "contain" },
  sectionTitle: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
  },
  title: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.medium as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: { width: 15, height: 15, marginRight: 4 },
  timeText: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.subtext,
    minHeight: 14,
  },
});
