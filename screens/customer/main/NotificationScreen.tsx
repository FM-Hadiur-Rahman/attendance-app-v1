//screens/customer/main/NotificationScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import { useNavigation } from "@react-navigation/native";

import { getUserId } from "../../../api/auth/authToken";

import { NotificationServiceInstance, subscribeNotifications, NotificationItem } from "../../../api/notification/NotificationService";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

// Helper: check if a date string is inside the current week (Sunday -> Saturday)
const isInCurrentWeek = (timeStr: string) => {
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return false;

  const now = new Date();
  // get start of week (Sunday)
  const day = now.getDay(); // 0 = Sunday
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
};

const C_NotificationScreen: React.FC<{ userId?: string; langId?: string }> = ({ userId, langId }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(userId ?? null);

  const currentLang = langId || "en";
  const lang = (translations as any)[currentLang];
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);

  // Request notification permissions + foreground handler
  useEffect(() => {
    (async () => {
      if (!Device.isDevice) {
        console.warn("[notif-screen] notifications: physical device recommended");
      }

      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") {
          console.warn("[notif-screen] notifications permission denied");
        }
      } catch (e) {
        console.warn("[notif-screen] permission request failed", e);
      }

      // ensure notifications show / play sound while app is foreground
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    })();
  }, []);

  // load stored userId if not provided
  useEffect(() => {
    if (effectiveUserId) return;
    (async () => {
      try {
        const stored = await getUserId();
        setEffectiveUserId(stored);
      } catch (e) {
        console.warn("[notif-screen] failed to load userId", e);
      }
    })();
  }, []);

  // Firestore realtime listener
  // subscribe to the service's notifications (keeps screen in sync)
  useEffect(() => {
    if (!effectiveUserId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // ensure service started for this user (safe to call repeatedly)
    NotificationServiceInstance.start(effectiveUserId).catch((e) =>
      console.warn('[notif-screen] start service failed', e)
    );

    const unsub = subscribeNotifications((items) => {
      setNotifications(items);
      setLoading(false);
    });

    return () => {
      unsub();
    };
  }, [effectiveUserId]);


  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const markAsRead = async (notif: NotificationItem) => {
    try {
      if (!notif?.n_id) return;
      await NotificationServiceInstance.markAsRead(notif.n_id);
      // snapshot will update local state via the service subscriber
    } catch (e) {
      console.warn("[notif-screen] markAsRead failed", e);
    }
  };

  // Format relative time with negative-diff clamped to 0 minutes
  const formatTime = (time: string) => {
    const now = new Date();
    const created = new Date(time);
    if (isNaN(created.getTime())) return time;
    let diffMs = now.getTime() - created.getTime();
    if (diffMs < 0) diffMs = 0; // clamp negative clock skew to 0
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 3) return `${diffHours} hour ago`;
    return created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: "image",
          url: require("../../../assets/icons/back_b.png"),
          width: 23,
          height: 23,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: "text", value: lang.Notification || "Notifications", color: colors.text }}
      />

      <View style={styles.body}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size={'large'} />
          </View>
        ) : (
          <SectionList
            sections={groupNotifications(notifications, lang)}
            keyExtractor={(item) => item.n_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressBackgroundColor={colors.secondary} colors={[colors.primary]} tintColor={colors.primary} />

            }
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.dateRow}>
                <Image source={require("../../../assets/icons/calender_black.png")} style={styles.dateIcon} />
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={async () => {
                  try {
                    await markAsRead(item); // mark notification as read (will update snapshot)
                  } catch (e) {
                    console.warn("[notif-screen] markAsRead error on press", e);
                  }
                  // Only navigate to ScheduleScreen when the notification's createdTime
                  // falls inside the current week (Sunday -> Saturday)
                  if (isInCurrentWeek(item.createdTime)) {
                    (navigation as any).navigate('Footer_C', { selectedTab: 'ScheduleScreen' });
                  }
                  // otherwise do nothing (we already marked it read)
                }}
              >
                <View style={styles.section}>
                  <CartBox
                    marginTop={0}
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
                      <Image source={require("../../../assets/icons/clock_g.png")} style={styles.icon} />
                      <Text style={styles.timeText}>{formatTime(item.createdTime)}</Text>
                    </View>
                  </CartBox>

                  {/* unread dot placed top-right of the card */}
                  {!item.read ? (
                    <View style={styles.unreadDotContainer} pointerEvents="none">
                      <View style={styles.unreadDot} />
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty_group}>
                <Text style={styles.empty_notification}>{lang.No_notifications}</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

export default C_NotificationScreen;

// helper to group notifications as in the design
function groupNotifications(notifs: NotificationItem[], lang: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const todayList = notifs.filter((n) => new Date(n.createdTime) >= today);
  const yesterdayList = notifs.filter((n) => new Date(n.createdTime) >= yesterday && new Date(n.createdTime) < today);
  const olderList = notifs.filter((n) => new Date(n.createdTime) < yesterday);

  const sections: { title: string; data: NotificationItem[] }[] = [];
  if (todayList.length > 0) sections.push({ title: lang.Today || "Today", data: todayList });
  if (yesterdayList.length > 0) sections.push({ title: lang.Yesterday || "Yesterday", data: yesterdayList });

  if (olderList.length > 0) {
    const grouped: { [key: string]: NotificationItem[] } = {};
    olderList.forEach((item) => {
      const d = new Date(item.createdTime);
      const key = d.toLocaleDateString("en-GB");
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    Object.keys(grouped)
      .sort((a, b) => {
        const [da, ma, ya] = a.split("/").map(Number);
        const [db, mb, yb] = b.split("/").map(Number);
        return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
      })
      .forEach((date) => sections.push({ title: date, data: grouped[date] }));
  }

  return sections;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  body: { flex: 1, backgroundColor: colors.secondary, paddingHorizontal: 20, marginTop: 20 },
  dateRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  dateIcon: { width: 16, height: 16, marginRight: 4, resizeMode: "contain" },
  sectionTitle: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16 },
  title: { fontSize: fonts.size.m, fontWeight: fonts.weight.medium, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16, marginBottom: 5 },
  subtitle: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16, marginBottom: 10 },
  timeRow: { flexDirection: "row", alignItems: "center" },
  icon: { width: 15, height: 15, marginRight: 4 },
  timeText: { fontSize: fonts.size.s, fontWeight: fonts.weight.regular, fontFamily: fonts.family.regular, color: colors.subtext, minHeight: 14 },
  unreadDotContainer: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 1000,
  },
  unreadDot: { width: 10, height: 10, borderRadius: 10, backgroundColor: colors.primary },
  loading: {
    flex: 1, justifyContent: 'center', alignItems: 'center'
  },
  scroll: {
    paddingBottom: 80
  },
  section: {
    position: "relative", marginTop: 12
  },
  empty_group: {
    padding: 20
  },
  empty_notification: {
    color: colors.subtext, textAlign: "center"
  }
});
