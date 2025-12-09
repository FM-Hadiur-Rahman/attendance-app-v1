// src/api/notification/firebaseNotifications.ts
import { db, addDoc, collection, serverTimestamp } from "./firebase";

export const sendNotificationToUser = async (
  userId: string,
  payload: {
    title: string;
    body: string;
    type?: string;
    meta?: Record<string, unknown>;
  }
) => {
  if (!userId) throw new Error("sendNotificationToUser: missing userId");

  try {
    const inboxRef = collection(db, "notifications", userId, "inbox");
    const docRef = await addDoc(inboxRef, {
      title: payload.title,
      body: payload.body,
      type: payload.type || "generic",
      meta: payload.meta || {},
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log("[notif] Firestore added doc", { userId, docId: docRef.id });
    return docRef.id;
  } catch (err) {
    console.error("[notif] Firestore addDoc error", err, { userId, payload });
    throw err;
  }
};
