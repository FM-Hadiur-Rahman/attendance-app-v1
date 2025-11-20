// screens/admin/main/NotificationScreen.tsx
import React, { useEffect, useState, useRef, useCallback } from "react";
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
import Header from "../../../../components/Header";
import CartBox from "../../../../components/CartBox";
import colors from "../../../../styles/Colors";
import fonts from "../../../../styles/Fonts";
import translations from "../../../../assets/translations.json";
import { useNavigation, useRoute } from "@react-navigation/native";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { getUserId } from "../../../../api/auth/authToken";
import { getProfile } from "../../../../api/profile";
import { getBranchById } from "../../../../api/Branchs";
import { sendCheckedInNotificationsToBranchAdmin } from '../../../../api/notification/attendanceAdminNotifier';

// firestore helper imports
import {
  db,
  onSnapshot,
  collection,
  query,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
} from "../../../../api/notification/firebase";

import { fetchUsers, ProfileUser } from "../../../../api/profile";

const REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds; change as needed

// --------------------- types ---------------------
interface NotificationItem {
  source: "personal" | "branch";
  docId: string;
  n_id: string;
  userId?: string;
  n_type: string;
  title: string;
  subtitle: string;
  createdTime: string;
  updatedTime?: string;
  read?: boolean;
  raw?: any;
}

// convert Firestore doc -> NotificationItem
const makeItem = (d: any, source: "personal" | "branch", ownerId?: string): NotificationItem => {
  const raw = d.data() as any;
  let createdISO = new Date().toISOString();
  if (raw?.createdAt && typeof raw.createdAt.toDate === "function") createdISO = raw.createdAt.toDate().toISOString();
  else if (raw?.createdAt && typeof raw.createdAt === "string") createdISO = raw.createdAt;

  let updatedISO: string | undefined = undefined;
  if (raw?.updatedAt && typeof raw.updatedAt.toDate === "function") updatedISO = raw.updatedAt.toDate().toISOString();
  else if (raw?.updatedAt && typeof raw.updatedAt === "string") updatedISO = raw.updatedAt;

  const docId = d.id;
  const nId = `${source}:${docId}`;
  return {
    source,
    docId,
    n_id: nId,
    userId: ownerId,
    n_type: raw?.type ?? "notification",
    title: raw?.title ?? raw?.t ?? "",
    subtitle: raw?.body ?? raw?.message ?? "",
    createdTime: createdISO,
    updatedTime: updatedISO,
    read: !!raw?.read,
    raw,
  };
};

const AdminNotificationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  console.log("[NotificationScreen] route.params:", route.params);

  const routeUserId = route.params?.userId ?? null;
  const routeLangId = route.params?.langId ?? "en";
  const lang = (translations as any)[routeLangId] || (translations as any)["en"];

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(routeUserId);
  const routeActiveBranch = route.params?.activeBranchId ?? route.params?.branchId ?? route.params?.branch_id ?? null;
  const [effectiveBranchId, setEffectiveBranchId] = useState<string | null>(routeActiveBranch ?? null);
  const [effectiveBranchName, setEffectiveBranchName] = useState<string | null>(null);

  const initialPersonalLoad = useRef(true);
  const initialBranchLoad = useRef(true);

  const [loading, setLoading] = useState(true);
  const firstLoadCountRef = useRef(0);

  // notifier running indicator
  const [notifierRunning, setNotifierRunning] = useState(false);
  const notifierIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Request permissions and set notification handler for foreground
  useEffect(() => {
    (async () => {
      if (!Device.isDevice) console.warn("[admin-notif] physical device recommended for push notifications");
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") console.warn("[admin-notif] notifications permission denied");
      } catch (e) {
        console.warn("[admin-notif] permission request failed", e);
      }

      Notifications.setNotificationHandler({
        handleNotification: async () => ({ 
          shouldShowAlert: true, 
          shouldPlaySound: true, 
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true
        }),
      });
    })();
  }, []);

  // resolve effectiveUserId from getUserId if not passed in route
  useEffect(() => {
    if (effectiveUserId) return;
    (async () => {
      try {
        const stored = await getUserId();
        if (stored) setEffectiveUserId(stored);
      } catch (e) {
        console.warn("[admin-notif] failed to load stored userId", e);
      }
    })();
  }, [effectiveUserId]);

  // prefer route branch, otherwise profile
  useEffect(() => {
    if (routeActiveBranch) {
      if (String(routeActiveBranch) !== String(effectiveBranchId)) {
        setEffectiveBranchId(String(routeActiveBranch));
      }
      return;
    }

    (async () => {
      try {
        const profile = await getProfile();
        const profBranch = typeof profile.branch === "string" ? profile.branch : profile.branch ?? null;
        if (profBranch && String(profBranch) !== String(effectiveBranchId)) {
          setEffectiveBranchId(String(profBranch));
        }
      } catch (e) {
        console.warn("[admin-notif] getProfile failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeActiveBranch]);

  // fetch effective branch name once when effectiveBranchId resolves (cache)
  useEffect(() => {
    if (!effectiveBranchId) {
      setEffectiveBranchName(null);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const b = await getBranchById(String(effectiveBranchId));
        if (mounted) {
          const name = (b?.name ?? "").toString();
          setEffectiveBranchName(name || null);
        }
      } catch (e) {
        console.warn("[admin-notif] getBranchById failed for", effectiveBranchId, e);
      }
    })();
    return () => { mounted = false; };
  }, [effectiveBranchId]);

  // Combined listener: personal + branch (two separate onSnapshot subscriptions)
  useEffect(() => {
    let unsubPersonal: (() => void) | null = null;
    let unsubBranch: (() => void) | null = null;

    const expectedListeners = (effectiveUserId ? 1 : 0) + (effectiveBranchId ? 1 : 0);
    firstLoadCountRef.current = 0;
    setLoading(expectedListeners > 0);

    const markFirstLoad = () => {
      firstLoadCountRef.current = (firstLoadCountRef.current || 0) + 1;
      if (firstLoadCountRef.current >= Math.max(1, expectedListeners)) {
        setLoading(false);
      }
    };

    if (effectiveUserId) {
      try {
        const inboxRef = collection(db, "notifications", effectiveUserId, "inbox");
        const q = query(inboxRef, orderBy("createdAt", "desc"));
        unsubPersonal = onSnapshot(
          q,
          (snap) => {
            const personalItems: NotificationItem[] = snap.docs.map((d) => makeItem(d, "personal", effectiveUserId));

            if (initialPersonalLoad.current) {
              initialPersonalLoad.current = false;
            } else {
              const prevIds = (notifications || []).filter(i => i.source === "personal").map(i => i.docId);
              const newIds = personalItems.map(i => i.docId);
              const added = newIds.filter(id => !prevIds.includes(id));
              if (added.length > 0) {
                const addedItems = personalItems.filter(it => added.includes(it.docId));
                const firstUnread = addedItems.find(it => !it.read);
                if (firstUnread) playLocalNotification(firstUnread.title, firstUnread.subtitle);
              }
            }

            setNotifications((prev) => {
              const branchExisting = (prev || []).filter(p => p.source === "branch");
              const merged = [...personalItems, ...branchExisting];
              merged.sort((a, b) => (new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()));
              return merged;
            });

            markFirstLoad();
          },
          (err) => {
            console.warn("[admin-notif] personal listener error", err);
            markFirstLoad();
          }
        );
      } catch (e) {
        console.warn("[admin-notif] failed to start personal listener", e);
        markFirstLoad();
      }
    }

    if (effectiveBranchId) {
      try {
        const branchRef = collection(db, "notifications_branch", effectiveBranchId, "inbox");
        const q2 = query(branchRef, orderBy("createdAt", "desc"));
        unsubBranch = onSnapshot(
          q2,
          (snap) => {
            let branchItems: NotificationItem[] = snap.docs.map((d) => makeItem(d, "branch", effectiveBranchId));

            // Filter logic: show only notifications that target our active branch.
            const effId = effectiveBranchId ? String(effectiveBranchId) : null;
            const effNameNorm = effectiveBranchName ? (effectiveBranchName || "").toString().trim().toLowerCase() : null;

            branchItems = branchItems.filter((it) => {
              try {
                const raw = it.raw ?? {};
                const meta = raw?.meta ?? {};

                const normalize = (v?: any) => (v ? String(v).trim().toLowerCase() : null);
                const createdByUserId = meta?.fromUserId ??
                  meta?.from_user_id ??
                  meta?.createdBy ??
                  meta?.created_by ??
                  null;
                // if creator equals our current user -> hide (sender shouldn't see their own branch doc)
                if (createdByUserId && effectiveUserId && String(createdByUserId) === String(effectiveUserId)) {
                  return false;
                }
                const targetId =
                  meta?.toBranchId ??
                  meta?.to_branch_id ??
                  meta?.assignedBranchId ??
                  meta?.assigned_branch_id ??
                  meta?.targetBranchId ??
                  meta?.toBranch ??
                  meta?.to_branch ??
                  null;

                const assignedBranchNameMeta =
                  meta?.assignedBranchName ??
                  meta?.assigned_branch_name ??
                  meta?.toBranchName ??
                  meta?.to_branch_name ??
                  meta?.assigned_branch ??
                  meta?.toBranch ??
                  null;

                const sourceId =
                  meta?.fromBranchId ??
                  meta?.from_branch_id ??
                  meta?.fromBranch ??
                  meta?.from_branch ??
                  null;

                const sourceName =
                  meta?.fromBranchName ??
                  meta?.from_branch_name ??
                  meta?.from_branch ??
                  null;

                // DEBUG: print doc short info
                const docShort = `${it.docId} title='${String(it.title).slice(0, 40)}'`;

                if (sourceId && effId && String(sourceId) === effId) return false;
                if (sourceName && effNameNorm && normalize(sourceName) === effNameNorm) return false;

                if (assignedBranchNameMeta) {
                  if (!effNameNorm) return false;
                  const match = normalize(assignedBranchNameMeta) === effNameNorm;
                  return match;
                }

                if (targetId) {
                  const match = effId ? String(targetId) === effId : false;
                  return match;
                }

                const bodyText = String(raw?.body ?? raw?.message ?? "").toString();
                const phraseRegex = /to work at your branch/i;
                if (phraseRegex.test(bodyText)) {
                  const matchSingle = bodyText.match(/your branch\s*'([^']+)'/i);
                  const matchDouble = bodyText.match(/your branch\s*"([^"]+)"/i);
                  const parsed = matchSingle?.[1] ?? matchDouble?.[1] ?? null;
                  if (!parsed) return false;
                  if (!effNameNorm) return false;
                  const match = normalize(parsed) === effNameNorm;
                  return match;
                }

                return false;
              } catch (e) {
                console.warn("[admin-notif] branch filter error for doc", it.docId, e);
                return false;
              }
            });

            if (initialBranchLoad.current) {
              initialBranchLoad.current = false;
            } else {
              const prevIds = (notifications || []).filter(i => i.source === "branch").map(i => i.docId);
              const newIds = branchItems.map(i => i.docId);
              const added = newIds.filter(id => !prevIds.includes(id));
              if (added.length > 0) {
                const addedItems = branchItems.filter(it => added.includes(it.docId));
                const firstUnread = addedItems.find(it => !it.read);
                if (firstUnread) playLocalNotification(firstUnread.title, firstUnread.subtitle);
              }
            }

            setNotifications((prev) => {
              const personalExisting = (prev || []).filter(p => p.source === "personal");
              const merged = [...personalExisting, ...branchItems];
              merged.sort((a, b) => (new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()));
              return merged;
            });

            markFirstLoad();
          },
          (err) => {
            console.warn("[admin-notif] branch listener error", err);
            markFirstLoad();
          }
        );
      } catch (e) {
        console.warn("[admin-notif] failed to start branch listener", e);
        markFirstLoad();
      }
    }

    return () => {
      try { if (unsubPersonal) unsubPersonal(); } catch { }
      try { if (unsubBranch) unsubBranch(); } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, effectiveBranchId, effectiveBranchName]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  // mark as read -> must write to correct path depending on source
  const markAsRead = async (notif: NotificationItem) => {
    try {
      if (!notif?.docId) return;
      if (notif.source === "personal") {
        if (!effectiveUserId) return;
        const docRef = doc(db, "notifications", effectiveUserId, "inbox", notif.docId);
        await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
      } else if (notif.source === "branch") {
        const branchId = effectiveBranchId;
        if (!branchId) return;
        const docRef = doc(db, "notifications_branch", branchId, "inbox", notif.docId);
        await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) {
      console.warn("[admin-notif] markAsRead failed", e);
    }
  };

  const playLocalNotification = async (title?: string, body?: string) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: title || "New Notification", body: body || "You have a new notification", sound: "default" },
        trigger: null,
      });
    } catch (e) {
      console.warn("[admin-notif] scheduleNotificationAsync failed", e);
    }
  };

  const formatTime = (time: string) => {
    const now = new Date();
    const created = new Date(time);
    if (isNaN(created.getTime())) return time;
    let diffMs = now.getTime() - created.getTime();
    if (diffMs < 0) diffMs = 0;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 3) return `${diffHours} hour ago`;
    return created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  };

  const openScheduleTab = (notif: NotificationItem) => {
    markAsRead(notif);
    // navigation.navigate("Footer_C", { selectedTab: "ScheduleScreen", userId: effectiveUserId, langId: routeLangId });
  };

  // Run the attendance notifier once on mount (and when effectiveBranchId/user resolves), then repeat at interval.
  useEffect(() => {
    mountedRef.current = true;

    const runNotifier = async () => {
      if (!mountedRef.current) return;
      try {
        setNotifierRunning(true);
        const stats = await sendCheckedInNotificationsToBranchAdmin({ targetDate: undefined, limitToUnsentOnly: true });
        console.log('[admin-notif] attendance notifier stats', stats);
      } catch (e) {
        console.warn('[admin-notif] attendance notifier failed', e);
      } finally {
        if (mountedRef.current) setNotifierRunning(false);
      }
    };

    // run immediately once
    runNotifier();

    // schedule interval
    notifierIntervalRef.current = setInterval(() => {
      runNotifier();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (notifierIntervalRef.current) {
        clearInterval(notifierIntervalRef.current);
        notifierIntervalRef.current = null;
      }
    };
  }, [effectiveUserId, effectiveBranchId, effectiveBranchName]); // re-run when context changes

  // group by Today / Yesterday / older
  const groupNotifications = (items: NotificationItem[]) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const todayList = items.filter(n => new Date(n.createdTime) >= today);
    const yesterdayList = items.filter(n => new Date(n.createdTime) >= yesterday && new Date(n.createdTime) < today);
    const olderList = items.filter(n => new Date(n.createdTime) < yesterday);

    const sections: { title: string; data: NotificationItem[] }[] = [];
    if (todayList.length) sections.push({ title: lang.Today || "Today", data: todayList });
    if (yesterdayList.length) sections.push({ title: lang.Yesterday || "Yesterday", data: yesterdayList });

    if (olderList.length) {
      const grouped: { [key: string]: NotificationItem[] } = {};
      olderList.forEach(item => {
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
        .forEach(date => sections.push({ title: date, data: grouped[date] }));
    }
    return sections;
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: "image",
          url: require("../../../../assets/icons/back_b.png"),
          width: 23, height: 23,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: "text", value: lang.Notification || "Notifications", color: colors.text }}
      />

      <View style={styles.body}>
        {/* notifier running toast */}
        {/* {notifierRunning ? (
          // <View style={styles.notifierBanner}>
            <ActivityIndicator size="large" color={colors.primary}  />
            // <Text style={styles.notifierText}>Checking attendance for new check-ins...</Text>
          // </View>
        ) : null} */}

        {loading ? (
          <View style={{ padding: 20, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <SectionList
            sections={groupNotifications(notifications)}
            keyExtractor={(item) => item.n_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressBackgroundColor={colors.secondary} colors={[colors.primary]} tintColor={colors.primary} />
            }
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.dateRow}>
                <Image source={require("../../../../assets/icons/calender_black.png")} style={styles.dateIcon} />
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.9} onPress={() => openScheduleTab(item)}>
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
                      <Image source={require("../../../../assets/icons/clock_g.png")} style={styles.icon} />
                      <Text style={styles.timeText}>{formatTime(item.createdTime)}</Text>
                    </View>
                  </CartBox>

                  {!item.read ? (
                    <View style={styles.unreadDotContainer} pointerEvents="none">
                      <View style={styles.unreadDot} />
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<View style={{ padding: 20 }}><Text style={{ color: colors.subtext, textAlign: "center" }}>{lang.No_notifications || "No notifications"}</Text></View>}
          />
        )}
      </View>
    </View>
  );
};

export default AdminNotificationScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  body: { flex: 1, backgroundColor: colors.secondary, paddingHorizontal: 20, marginTop: 20 },
  dateRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  dateIcon: { width: 16, height: 16, marginRight: 4, resizeMode: "contain" },
  sectionTitle: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, fontFamily: fonts.family.regular, color: colors.text, minHeight: 16 },
  title: { fontSize: fonts.size.m, fontWeight: fonts.weight.medium , fontFamily: fonts.family.regular, color: colors.text, minHeight: 16, marginBottom: 5 },
  subtitle: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular , fontFamily: fonts.family.regular, color: colors.text, minHeight: 16, marginBottom: 10 },
  timeRow: { flexDirection: "row", alignItems: "center" },
  icon: { width: 15, height: 15, marginRight: 4 },
  timeText: { fontSize: fonts.size.s, fontWeight: fonts.weight.regular , fontFamily: fonts.family.regular, color: colors.subtext, minHeight: 14 },
  unreadDotContainer: { position: "absolute", right: 12, top: 12, zIndex: 1000 },
  unreadDot: { width: 10, height: 10, borderRadius: 10, backgroundColor: colors.primary },

  // notifier banner
  notifierBanner: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, backgroundColor: colors.background, marginBottom: 10 },
  notifierText: { color: colors.subtext, fontSize: fonts.size.s, fontFamily: fonts.family.regular },
});
