// src/api/notification/attendanceAdminNotifier.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAttendanceAllHistory, AttendanceHistoryItem } from '../attendanceAllHistory';
import { getUserById, fetchUsers, getBranchById, ProfileUser } from '../profile';
import { db, doc, setDoc, serverTimestamp } from './firebase';

const SENT_KEY = 'attendance_admin_sent_ids_v1';

const attendanceUniqueId = (att: AttendanceHistoryItem): string => {
  const idPart = att.id;
  if (idPart) return String(idPart);

  const uid = att.user?.id ?? 'unknown-user';
  const branchId = att.branch_id ?? att.branch?.id ?? 'unknown-branch';
  const time = String(att.In ?? att.created_at ?? '');
  return `${uid}_${branchId}_${time}`;
};

const extractUserId = (att: AttendanceHistoryItem): string | null => {
  return att.user?.id ?? null;
};
const extractAttendanceBranchId = (att: AttendanceHistoryItem): string | null => {
  return att.branch_id ?? att.branch?.id ?? null;
};


const extractProfileBranchId = (p: ProfileUser | null | undefined): string | null => {
  if (!p) return null;
  // In profile.ts we define branch: string (ProfileUser.branch is string)
  // but to be defensive, handle object cases too if present in responses.
  const b = (p as unknown as { branch?: unknown })?.branch;
  if (!b) return null;
  if (typeof b === 'string') return b;
  if (typeof b === 'object' && b !== null) {
    if ('_id' in b && typeof (b)._id === 'string') return (b)._id;
    if ('id' in b && typeof (b).id === 'string') return (b).id;
  }
  return null;
};

/**
 * Main exported function (cleaned, typed).
 *
 * Behaviour preserved:
 * - reads attendance rows for a target date (default today)
 * - dedupes using local AsyncStorage set (SENT_KEY)
 * - resolves employee -> employee branch -> admin(s) for that branch
 * - creates idempotent notifications under notifications/{adminId}/inbox with deterministic doc id
 * - skips notifying if attendance branch equals employee's own branch
 */
export const sendCheckedInNotificationsToBranchAdmin = async (opts?: {
  targetDate?: string;
  limitToUnsentOnly?: boolean;
}): Promise<{
  sent: number;
  skippedAlreadySent: number;
  skippedNoAdmin: number;
  processed: number;
  durationMs: number;
}> => {
  const startTs = Date.now();
  const targetDate = opts?.targetDate ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const limitToUnsentOnly = opts?.limitToUnsentOnly ?? true;

  // load sent set (local dedupe)
  const sentSet = new Set<string>();
  try {
    const raw = await AsyncStorage.getItem(SENT_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((id) => sentSet.add(String(id)));
    }
  } catch (e) {
    console.warn('[attendanceNotifier] failed to load sent set', e);
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  let skippedNoAdmin = 0;
  let processed = 0;

  try {
    const all = await getAttendanceAllHistory();
    const matched = (all ?? []).filter((a) => {
      const inStr = String(a.In ?? '');
      return inStr.startsWith(targetDate);
    });

    if (!matched.length) {
      return { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs: Date.now() - startTs };
    }

    // unique user IDs from matched attendance rows
    const uniqueUserIds = Array.from(
      new Set(
        matched
          .map((m) => extractUserId(m))
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      )
    );

    // unique attendance branch ids (where check-ins happened)
    const uniqueAttendanceBranchIds = Array.from(
      new Set(
        matched
          .map((m) => extractAttendanceBranchId(m))
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      )
    );

    // 1) Fetch user profiles in parallel (typed)
    const userProfilesById: Record<string, ProfileUser | null> = {};
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        try {
          const u = await getUserById(uid);
          userProfilesById[uid] = u ?? null;
        } catch (e) {
          console.warn('[attendanceNotifier] getUserById failed for', uid, e);
          userProfilesById[uid] = null;
        }
      })
    );

    // 2) Collect employee branch ids for admin lookup
    const employeeBranchIdsSet = new Set<string>();
    for (const uid of uniqueUserIds) {
      const profile = userProfilesById[uid];
      const branchId = extractProfileBranchId(profile);
      if (branchId) employeeBranchIdsSet.add(branchId);
    }
    const employeeBranchIds = Array.from(employeeBranchIdsSet);

    // 3) Fetch admin candidates for each employeeBranchId
    const adminsByBranch: Record<string, ProfileUser | null> = {};
    await Promise.all(
      employeeBranchIds.map(async (branchId) => {
        try {
          const res = await fetchUsers({ branchId, role: 'admin', limit: 50 });
          const users = res?.users ?? [];
          // prefer admin whose branch id matches exactly
          const found = users.find((u) => {
            const ub = extractProfileBranchId(u as ProfileUser);
            return ub && String(ub) === String(branchId) && String(u.role).toLowerCase() === 'admin';
          }) ?? (users.length ? users[0] : null);
          adminsByBranch[branchId] = found ?? null;
        } catch (e) {
          console.warn('[attendanceNotifier] fetchUsers(admin) failed for branch', branchId, e);
          adminsByBranch[branchId] = null;
        }
      })
    );

    // 4) Pre-fetch attendance-branch names (typed)
    const branchNameById: Record<string, string | null> = {};
    await Promise.all(
      uniqueAttendanceBranchIds.map(async (bId) => {
        try {
          const br = await getBranchById(String(bId));
          branchNameById[bId] = br?.name ?? String(bId);
        } catch (e) {
          branchNameById[bId] = String(bId);
        }
      })
    );

    // 5) Process each attendance row
    for (const att of matched) {
      processed++;
      const attId = attendanceUniqueId(att);

      if (limitToUnsentOnly && sentSet.has(attId)) {
        skippedAlreadySent++;
        continue;
      }

      const userId = extractUserId(att);
      if (!userId) {
        skippedNoAdmin++;
        continue;
      }

      const employeeProfile = userProfilesById[userId] ?? null;
      const employeeBranchId = extractProfileBranchId(employeeProfile);
      if (!employeeBranchId) {
        skippedNoAdmin++;
        continue;
      }

      // resolve admin for employeeBranchId
      let admin = adminsByBranch[employeeBranchId] ?? null;

      // defensive re-fetch if admin is missing or branch mismatch
      const adminBranchMatches = (adm?: ProfileUser | null) => {
        if (!adm) return false;
        const ab = extractProfileBranchId(adm);
        return !!ab && String(ab) === String(employeeBranchId);
      };

      if (!adminBranchMatches(admin)) {
        try {
          const res = await fetchUsers({ branchId: employeeBranchId, role: 'admin', limit: 50 });
          const users = res?.users ?? [];
          const found = users.find((u) => {
            const ub = extractProfileBranchId(u as ProfileUser);
            return ub && String(ub) === String(employeeBranchId) && String(u.role).toLowerCase() === 'admin';
          }) ?? (users.length ? users[0] : null);
          admin = found ?? null;
        } catch {
          admin = null;
        }
      }

      if (!admin || !admin._id) {
        skippedNoAdmin++;
        continue;
      }

      const attendanceBranchId = extractAttendanceBranchId(att);
      let attendanceBranchName = attendanceBranchId ? branchNameById[String(attendanceBranchId)] ?? String(attendanceBranchId) : 'Unknown branch';
      if (att.branch?.name) attendanceBranchName = att.branch.name;

      // skip if attendance branch equals employee's own branch
      if (attendanceBranchId && String(attendanceBranchId) === String(employeeBranchId)) continue;
      const adminBranchId = extractProfileBranchId(admin);

      // DO NOT notify admin of the attendance branch (branch B)
      if (String(adminBranchId) === String(attendanceBranchId)) {
        continue;
      }
      // Build employee display name using ProfileUser fields only
      const employeeName = employeeProfile?.fullname ?? employeeProfile?.username ?? (att.user?.username ?? 'Employee');

      const dateTimeStr = att.In ?? att.created_at ?? '';
      const title = 'Employee checked-in';
      const body = `Your employee ${employeeName} has been checked-in in ${attendanceBranchName} at ${dateTimeStr}`;


      // deterministic Firestore doc id to avoid duplicates
      const notifDocId = `api:attendance:${String(attId)}`;
      const notifRef = doc(db, 'notifications', String(admin._id), 'inbox', notifDocId);

      try {
        await setDoc(
          notifRef,
          {
            title,
            body,
            type: 'attendance',
            meta: { attendanceId: attId, employeeId: userId, employeeBranchId, attendanceBranchId, raw: att },
            read: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        sentSet.add(attId);
        sent++;
      } catch (e) {
        console.warn('[attendanceNotifier] setDoc failed for admin', admin._id, e);
      }
    }

    try {
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...sentSet]));
    } catch (e) {
      console.warn('[attendanceNotifier] failed to save sent set', e);
    }

    return { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs: Date.now() - startTs };
  } catch (e) {
    console.error('[attendanceNotifier] failed', e);
    return { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs: Date.now() - startTs };
  }
};
