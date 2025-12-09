// src/api/notification/NotificationService.ts
import { db, collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp } from "./firebase";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

export type NotificationItem = {
  n_id: string;
  userId: string | null;
  n_type: string;
  title: string;
  subtitle: string;
  createdTime: string;
  updatedTime?: string;
  read?: boolean;
  source?: "personal" | "branch";
  docId?: string; // helpful when marking read externally
};

type Subscriber = (items: NotificationItem[], unreadCount: number) => void;

class NotificationService {
  private currentUserId: string | null = null;
  private currentBranchId: string | null = null; // NEW: optional branch listener
  private notifications: NotificationItem[] = [];
  private prevIds: string[] = [];
  private initialPersonalLoad = true;
  private initialBranchLoad = true;
  private unsubPersonal: (() => void) | null = null;
  private unsubBranch: (() => void) | null = null;
  private subscribers: Set<Subscriber> = new Set();

  /**
   * Start listening for notifications for given userId and optional branchId.
   * safe to call multiple times with same userId/branchId.
   */
  public async start(userId: string, branchId?: string | null): Promise<void> {
    if (!userId) return;

    // If same user+branch already started, skip
    if (this.currentUserId === userId && this.currentBranchId === (branchId ?? null) && (this.unsubPersonal || this.unsubBranch)) {
      return;
    }

    // stop any previous listener(s)
    this.stop();

    this.currentUserId = userId;
    this.currentBranchId = branchId ?? null;
    this.notifications = [];
    this.prevIds = [];
    this.initialPersonalLoad = true;
    this.initialBranchLoad = true;

    // register device token (async, don't block listener)
    this.registerDeviceToken(userId).catch((e) => console.warn("[NotificationService] register token failed", e));

    // PERSONAL listener (notifications/{userId}/inbox)
    try {
      const inboxRef = collection(db, "notifications", userId, "inbox");
      const q = query(inboxRef, orderBy("createdAt", "desc"));
      this.unsubPersonal = onSnapshot(
        q,
        (snap) => {
          const personalArr: NotificationItem[] = snap.docs.map((d) => {
            const raw = d.data() as Record<string, any>;
            let createdISO = new Date().toISOString();
            if (raw?.createdAt && typeof (raw.createdAt)?.toDate === "function") {
              createdISO = (raw.createdAt).toDate().toISOString();
            } else if (raw?.createdAt && typeof raw.createdAt === "string") {
              createdISO = raw.createdAt;
            }
            let updatedISO: string | undefined;
            if (raw?.updatedAt && typeof (raw.updatedAt)?.toDate === "function") {
              updatedISO = (raw.updatedAt).toDate().toISOString();
            } else if (raw?.updatedAt && typeof raw.updatedAt === "string") {
              updatedISO = raw.updatedAt;
            }
            return {
              n_id: d.id,
              docId: d.id,
              userId,
              n_type: raw?.type,
              title: raw?.title,
              subtitle: raw?.body,
              createdTime: createdISO,
              updatedTime: updatedISO,
              read: !!(raw?.read),
              source: "personal",
            } as NotificationItem;
          });

          // detect new personal items (skip alert on initial load)
          const newIds = personalArr.map(a => `personal:${a.docId}`);
          const prevPersonalIds = this.notifications.filter(n => n.source === "personal").map(n => n.docId);
          const added = newIds.filter(id => !prevPersonalIds.includes(id.split(":")[1]));

          if (this.initialPersonalLoad) {
            this.initialPersonalLoad = false;
          } else if (added.length > 0) {
            const addedItems = personalArr.filter(it => added.includes(`personal:${it.docId}`));
            const firstUnread = addedItems.find(it => !it.read);
            if (firstUnread) {
              this.playLocalNotification(firstUnread.title, firstUnread.subtitle, `personal:${firstUnread.docId}`).catch((e) =>
                console.warn("[NotificationService] schedule failed", e)
              );
            }
          }

          // merge: put personal items first then branch items (branch handled below)
          const branchExisting = this.notifications.filter(n => n.source === "branch");
          const merged = [...personalArr, ...branchExisting];
          merged.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
          this.notifications = merged;
          this.prevIds = this.notifications.map(n => `${n.source ?? "personal"}:${n.docId ?? n.n_id}`);
          this.notifySubscribers();
        },
        (err) => {
          console.warn("[NotificationService] personal Firestore listener error", err);
        }
      );
    } catch (e) {
      console.warn("[NotificationService] failed to start personal listener", e);
    }

    // BRANCH listener (optional) -> notifications_branch/{branchId}/inbox
    if (branchId) {
      try {
        const branchRef = collection(db, "notifications_branch", branchId, "inbox");
        const q2 = query(branchRef, orderBy("createdAt", "desc"));
        this.unsubBranch = onSnapshot(
          q2,
          (snap) => {
            const branchArr: NotificationItem[] = snap.docs.map((d) => {
              const raw = d.data() as Record<string, any>;
              let createdISO = new Date().toISOString();
              if (raw?.createdAt && typeof (raw.createdAt)?.toDate === "function") {
                createdISO = (raw.createdAt).toDate().toISOString();
              } else if (raw?.createdAt && typeof raw.createdAt === "string") {
                createdISO = raw.createdAt;
              }
              let updatedISO: string | undefined;
              if (raw?.updatedAt && typeof (raw.updatedAt)?.toDate === "function") {
                updatedISO = (raw.updatedAt).toDate().toISOString();
              } else if (raw?.updatedAt && typeof raw.updatedAt === "string") {
                updatedISO = raw.updatedAt;
              }
              return {
                n_id: d.id,
                docId: d.id,
                userId: branchId,
                n_type: raw?.type,
                title: raw?.title,
                subtitle: raw?.body ?? raw?.message,
                createdTime: createdISO,
                updatedTime: updatedISO,
                read: !!(raw?.read),
                source: "branch",
              } as NotificationItem;
            });

            // detect new branch items (skip alert on initial load)
            const prevBranchIds = this.notifications.filter(n => n.source === "branch").map(n => n.docId);
            const newBranchIds = branchArr.map(i => i.docId);
            const added = newBranchIds.filter(id => !prevBranchIds.includes(id));

            if (this.initialBranchLoad) {
              this.initialBranchLoad = false;
            } else if (added.length > 0) {
              const addedItems = branchArr.filter(it => added.includes(it.docId));
              const firstUnread = addedItems.find(it => !it.read);
              if (firstUnread) {
                this.playLocalNotification(firstUnread.title, firstUnread.subtitle, `branch:${firstUnread.docId}`).catch((e) =>
                  console.warn("[NotificationService] schedule failed", e)
                );
              }
            }

            // merge: keep personal existing then branch
            const personalExisting = this.notifications.filter(n => n.source === "personal");
            const merged = [...personalExisting, ...branchArr];
            merged.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
            this.notifications = merged;
            this.prevIds = this.notifications.map(n => `${n.source ?? "personal"}:${n.docId ?? n.n_id}`);
            this.notifySubscribers();
          },
          (err) => {
            console.warn("[NotificationService] branch Firestore listener error", err);
          }
        );
      } catch (e) {
        console.warn("[NotificationService] failed to start branch listener", e);
      }
    }

    // if no branch and personal listeners exist, subscribers will get updates when snapshot arrives
  }

  /**
   * Stop listening and clear user
   */
  public stop(): void {
    try {
      if (this.unsubPersonal) { this.unsubPersonal(); this.unsubPersonal = null; }
    } catch (_) {}
    try {
      if (this.unsubBranch) { this.unsubBranch(); this.unsubBranch = null; }
    } catch (_) {}

    this.currentUserId = null;
    this.currentBranchId = null;
    this.notifications = [];
    this.prevIds = [];
    this.initialPersonalLoad = true;
    this.initialBranchLoad = true;
    this.notifySubscribers();
  }

  /**
   * Subscribe to changes. Returns an unsubscribe function.
   */
  public subscribe(sub: Subscriber): () => void {
    this.subscribers.add(sub);
    // call immediately with current state
    sub(this.notifications, this.getUnreadCount());
    return () => {
      this.subscribers.delete(sub);
    };
  }

  private notifySubscribers(): void {
    const unread = this.getUnreadCount();
    for (const s of this.subscribers) {
      try {
        s(this.notifications.slice(), unread);
      } catch (e) {
        console.warn("[NotificationService] subscriber error", e);
      }
    }
  }

  private getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  public getNotifications(): NotificationItem[] {
    return this.notifications.slice();
  }

  /**
   * Mark a notification as read in Firestore.
   * Note: n_id should be the docId (without source prefix).
   * If you stored source: use markAsReadWithSource.
   */
  public async markAsRead(n_id: string): Promise<void> {
    if (!this.currentUserId || !n_id) return;
    try {
      const docRef = doc(db, "notifications", this.currentUserId, "inbox", n_id);
      await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
      // Firestore snapshot will update local state.
    } catch (e) {
      console.warn("[NotificationService] markAsRead failed", e);
    }
  }

  /**
   * Mark as read with explicit source/branch support.
   * Use when marking branch-sourced docs.
   */
  public async markAsReadWithSource(source: "personal" | "branch", docId: string): Promise<void> {
    if (!docId) return;
    try {
      if (source === "personal") {
        if (!this.currentUserId) return;
        const docRef = doc(db, "notifications", this.currentUserId, "inbox", docId);
        await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        const branchId = this.currentBranchId;
        if (!branchId) return;
        const docRef = doc(db, "notifications_branch", branchId, "inbox", docId);
        await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) {
      console.warn("[NotificationService] markAsReadWithSource failed", e);
    }
  }

  /**
   * Register Expo push token in Firestore under collection 'devices' keyed by token.
   * (This saves token so your server can send pushes later).
   * Unchanged from original.
   */
  public async registerDeviceToken(userId: string): Promise<void> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        console.warn("[NotificationService] permission denied while registering token");
        return;
      }
      const tokenResult = await Notifications.getExpoPushTokenAsync();
      const token = tokenResult.data;
      const platform = Device.osName ?? Device.manufacturer ?? "unknown";
      const docRef = doc(db, "devices", token);
      await setDoc(
        docRef,
        {
          userId,
          token,
          platform,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[NotificationService] registerDeviceToken error", e);
    }
  }

  /**
   * Schedule a single immediate local notification (foreground)
   */
  private async playLocalNotification(title?: string, body?: string, notifId?: string): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title ?? "New Notification",
          body: body ?? "You have a new notification",
          sound: "default",
        },
        trigger: null,
      });
    } catch (e) {
      console.warn("[NotificationService] scheduleNotification failed", e);
    }
  }
}

/**
 * Export a single shared instance
 */
export const NotificationServiceInstance = new NotificationService();

/**
 * Convenience hook-ish function for components (not a real hook - safe to call in components)
 */
export function subscribeNotifications(callback: Subscriber): () => void {
  return NotificationServiceInstance.subscribe(callback);
}
