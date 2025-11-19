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

import {
  db,
  onSnapshot,
  collection,
  query,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
} from "../../../api/notification/firebase";

import { getUserId } from "../../../api/auth/authToken";
import { sendNotificationToUser } from "../../../api/notification/firebaseNotifications";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Button1 } from "../../../components/Button";

interface NotificationItem {
  n_id: string;
  userId: string;
  n_type: string;
  title: string;
  subtitle: string;
  createdTime: string;
  updatedTime?: string;
  read?: boolean;
}

const C_NotificationScreen: React.FC<{ userId?: string; langId?: string }> = ({ userId, langId }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(userId ?? null);

  const currentLang = langId || "en";
  const lang = (translations as any)[currentLang] || (translations as any)["en"];
  const navigation = useNavigation();

  // persistent refs
  const prevIdsRef = useRef<string[]>([]);
  const initialLoadRef = useRef<boolean>(true); // avoid alerting on first snapshot load

  const [loading, setLoading] = useState(true);

  // Request notification permissions + foreground handler
  useEffect(() => {
    (async () => {
      if (!Device.isDevice) {
        console.warn("[notif-screen] notifications: physical device recommended");
        // we'll still continue but push token logic elsewhere should guard Device.isDevice
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
  useEffect(() => {
    if (!effectiveUserId) {
      setNotifications([]);
      return;
    }
    const inboxRef = collection(db, "notifications", effectiveUserId, "inbox");
    const q = query(inboxRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: NotificationItem[] = snap.docs.map((d) => {
          const raw = d.data() as any;
          let createdISO = new Date().toISOString();
          if (raw?.createdAt && typeof raw.createdAt.toDate === "function") {
            createdISO = raw.createdAt.toDate().toISOString();
          } else if (raw?.createdAt && typeof raw.createdAt === "string") {
            createdISO = raw.createdAt;
          }
          let updatedISO: string | undefined = undefined;
          if (raw?.updatedAt && typeof raw.updatedAt.toDate === "function") {
            updatedISO = raw.updatedAt.toDate().toISOString();
          } else if (raw?.updatedAt && typeof raw.updatedAt === "string") {
            updatedISO = raw.updatedAt;
          }
          return {
            n_id: d.id,
            userId: effectiveUserId!,
            n_type: raw?.type ?? "notification",
            title: raw?.title ?? raw?.t ?? "",
            subtitle: raw?.body ?? raw?.message ?? "",
            createdTime: createdISO,
            updatedTime: updatedISO,
            read: !!raw?.read,
          } as NotificationItem;
        });

        const newIds = arr.map((a) => a.n_id);
        const prev = prevIdsRef.current || [];
        const added = newIds.filter((id) => !prev.includes(id));

        // If this is the first snapshot after mount, treat as initial load:
        if (initialLoadRef.current) {
          // seed prev ids, do not play alerts for existing items
          prevIdsRef.current = newIds;
          initialLoadRef.current = false;
          setNotifications(arr);
          setLoading(false); // mark loading complete
          return;
        }

        // For subsequent snapshots only: play single alert for newly added unread items
        if (added.length > 0) {
          const addedItems = arr.filter((it) => added.includes(it.n_id));
          // pick first unread added item to show single alert
          const firstUnread = addedItems.find((it) => !it.read);
          if (firstUnread) {
            playNotificationLocal(firstUnread.title, firstUnread.subtitle);
          }
        }

        prevIdsRef.current = newIds;
        setNotifications(arr);
      },
      (err) => {
        console.warn("[notif-screen] Firestore listener error", err);
      }
    );

    return () => unsub();
  }, [effectiveUserId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const markAsRead = async (notif: NotificationItem) => {
    try {
      if (!effectiveUserId || !notif?.n_id) return;
      const docRef = doc(db, "notifications", effectiveUserId, "inbox", notif.n_id);
      await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
      // snapshot will update local state
    } catch (e) {
      console.warn("[notif-screen] markAsRead failed", e);
    }
  };

  // schedule a local notification (single immediate alert) using default system sound
  // This runs in-app and will appear while app is foregrounded (and can show in tray on some OS).
  // For background/closed behavior on iOS, you must send push notifications from a server + standalone build.
  const playNotificationLocal = async (title?: string, body?: string) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title || "New Notification",
          body: body || "You have a new notification",
          sound: "default", // ask system to play default sound
        },
        trigger: null, // immediate
      });
    } catch (e) {
      console.warn("[notif-screen] scheduleNotificationAsync failed", e);
    }
  };

  //------------Remove this section once everything ok (test notification)------------//
  // debug helper: write test doc to Firestore and trigger local alert
  const sendTestNotificationToSelf = async () => {
    try {
      if (!effectiveUserId) return;
      const title = "Test Notification";
      const body = `Test notif for ${effectiveUserId} at ${new Date().toLocaleString()}`;
      await sendNotificationToUser(effectiveUserId, { title, body, type: "test" });
      // Also fire local alert so sound plays now (useful for debug while in-app)
      playNotificationLocal(title, body);
    } catch (e) {
      console.warn("[notif-screen] test send failed", e);
    }
  };
  //-----------------------------------------------------------//

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
          onPress: () => (navigation as any).goBack(),
        }}
        center={{ type: "text", value: lang.Notification || "Notifications", color: colors.text }}
      />

      <View style={styles.body}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} size={'large'} />
            {/* Optional: ActivityIndicator can go here */}
          </View>
        ) : (
          <SectionList
            sections={groupNotifications(notifications, lang)}
            keyExtractor={(item) => item.n_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80 }}
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
                onPress={() => {
                  markAsRead(item); // mark notification as read
                  // navigate to ScheduleScreen tab in Footer_C
                  (navigation as any).navigate('Footer_C', { selectedTab: 'ScheduleScreen' });
                }}
              >
                <View style={{ position: "relative", marginTop: 12 }}>
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
              <View style={{ padding: 20 }}>
                <Text style={{ color: colors.subtext, textAlign: "center" }}>{lang.No_notifications}</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Remove this button once everything ok */}
      <View style={{ padding: 16 }}>
        <Button1
          width={'100%'}
          text="Send Test Notification"
          onPress={sendTestNotificationToSelf}>
        </Button1>
      </View>
      {/* //---------------------------// */}

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
  sectionTitle: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16 },
  title: { fontSize: fonts.size.m, fontWeight: fonts.weight.medium as any, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16, marginBottom: 5 },
  subtitle: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16, marginBottom: 10 },
  timeRow: { flexDirection: "row", alignItems: "center" },
  icon: { width: 15, height: 15, marginRight: 4 },
  timeText: { fontSize: fonts.size.s, fontWeight: fonts.weight.regular as any, fontFamily: fonts.family.regular, color: colors.subtext, minHeight: 14 },
  unreadDotContainer: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 1000,
  },
  unreadDot: { width: 10, height: 10, borderRadius: 10, backgroundColor: colors.primary },
});
