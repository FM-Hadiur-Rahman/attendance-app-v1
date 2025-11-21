// src/api/notification/attendanceAdminNotifier.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAttendanceAllHistory, AttendanceHistoryItem } from '../attendanceAllHistory';
import { getUserById, fetchUsers, getBranchById, ProfileUser } from '../profile';
// we will write to Firestore using deterministic id to avoid duplicates
import { db, doc, setDoc, serverTimestamp } from './firebase';

const SENT_KEY = 'attendance_admin_sent_ids_v1';

/**
 * Build a stable attendance id string used for dedupe
 */
const attendanceUniqueId = (att: AttendanceHistoryItem) => {
  return (
    att.id ??
    (att as any)._id ??
    `${att.user?.id ?? (typeof att.user === 'object' && att.user !== null ? (att.user as any)._id : att.user) ?? 'unknown'}_${att.branch_id ?? (att.branch ? (typeof att.branch === 'object' && att.branch !== null ? att.branch._id : att.branch) : 'unknown')}_${String(att.In ?? att.created_at ?? '')}`
  );
};

export const sendCheckedInNotificationsToBranchAdmin = async (opts?: {
  targetDate?: string;
  limitToUnsentOnly?: boolean;
}): Promise<{ sent: number; skippedAlreadySent: number; skippedNoAdmin: number; processed: number; durationMs: number }> => {
  const startTs = Date.now();
  const targetDate = opts?.targetDate ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const limitToUnsentOnly = opts?.limitToUnsentOnly ?? true;

  // load sent set (local dedupe)
  let sentSet = new Set<string>();
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
    const matched = (all || []).filter((a) => {
      const inStr = String(a.In ?? '');
      return inStr.startsWith(targetDate);
    });

    if (!matched.length) {
      const durationMs = Date.now() - startTs;
      return { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs };
    }

    // unique user IDs & attendance branch ids
    const uniqueUserIds = Array.from(new Set(matched.map((m) => (m.user?.id ?? (m.user as any)?._id ?? null)).filter(Boolean) as string[]));
    const uniqueAttendanceBranchIds = Array.from(new Set(matched.map(m => m.branch_id ?? m.branch?.id ?? m.branch?._id).filter(Boolean) as string[]));

    // 1) Fetch user profiles in parallel
    const userProfilesById: Record<string, ProfileUser | null> = {};
    await Promise.allSettled(uniqueUserIds.map(async (uid) => {
      try {
        const u = await getUserById(uid);
        userProfilesById[uid] = u;
      } catch (e) {
        console.warn('[attendanceNotifier] getUserById failed for', uid, e);
        userProfilesById[uid] = null;
      }
    }));

    // 2) Collect employee branch ids for admin lookup
    const employeeBranchIdsSet = new Set<string>();
    for (const uid of uniqueUserIds) {
      const p = userProfilesById[uid];
      const branchId = p?.branch ? (typeof p.branch === 'object' && p.branch !== null && '_id' in p.branch ? (p.branch as any)._id : p.branch) : null;
      if (branchId) employeeBranchIdsSet.add(String(branchId));
    }
    const employeeBranchIds = Array.from(employeeBranchIdsSet);

    // 3) Fetch admin candidates for each employeeBranchId (parallel)
    const adminsByBranch: Record<string, ProfileUser | null> = {};
    await Promise.allSettled(employeeBranchIds.map(async (branchId) => {
      try {
        const res = await fetchUsers({ branchId, role: 'admin', limit: 50 });
        const users = res?.users ?? [];
        const resolveUserBranchId = (u: any) => {
          if (!u) return null;
          if (typeof u.branch === 'string') return u.branch;
          if (u.branch && (u.branch._id || u.branch.id)) return u.branch._id ?? u.branch.id;
          return null;
        };
        const found = (users as ProfileUser[]).find(u => {
          const ub = resolveUserBranchId(u);
          return ub && String(ub) === String(branchId) && (String(u.role).toLowerCase() === 'admin');
        }) ?? null;
        adminsByBranch[branchId] = found ?? (users.length ? users[0] : null);
      } catch (e) {
        console.warn('[attendanceNotifier] fetchUsers(admin) failed for branch', branchId, e);
        adminsByBranch[branchId] = null;
      }
    }));

    // 4) Pre-fetch attendance-branch names
    const branchNameById: Record<string, string | null> = {};
    await Promise.allSettled(uniqueAttendanceBranchIds.map(async (bId) => {
      try {
        const br = await getBranchById(String(bId));
        branchNameById[bId] = br?.name ?? String(bId);
      } catch (e) {
        branchNameById[bId] = String(bId);
      }
    }));

    // 5) Process each attendance row
    for (const att of matched) {
      processed++;
      const attId = attendanceUniqueId(att);

      if (limitToUnsentOnly && sentSet.has(attId)) {
        skippedAlreadySent++;
        continue;
      }

      const userId = att.user?.id ?? (att.user as any)?._id ?? null;
      if (!userId) {
        skippedNoAdmin++;
        continue;
      }

      const employeeProfile = userProfilesById[userId] ?? null;
      const employeeBranchId = employeeProfile?.branch ? (typeof employeeProfile.branch === 'object' && employeeProfile.branch !== null && '_id' in employeeProfile.branch ? (employeeProfile.branch as any)._id : employeeProfile.branch) : null;
      if (!employeeBranchId) {
        skippedNoAdmin++;
        continue;
      }

      // strict admin resolution: ensure admin belongs to employeeBranchId
      let admin = adminsByBranch[employeeBranchId] ?? null;
      const adminBranchMatches = (adm?: ProfileUser | null) => {
        if (!adm) return false;
        const ab = (adm as any)?.branch?._id ?? (typeof (adm as any)?.branch === 'string' ? (adm as any).branch : null);
        return ab && String(ab) === String(employeeBranchId);
      };

      if (!adminBranchMatches(admin)) {
        // defensive re-fetch for this branch
        try {
          const res = await fetchUsers({ branchId: employeeBranchId, role: 'admin', limit: 50 });
          const users = res?.users ?? [];
          const resolveUserBranchId = (u: any) => {
            if (!u) return null;
            if (typeof u.branch === 'string') return u.branch;
            if (u.branch && (u.branch._id || u.branch.id)) return u.branch._id ?? u.branch.id;
            return null;
          };
          admin = (users as ProfileUser[]).find(u => {
            const ub = resolveUserBranchId(u);
            return ub && String(ub) === String(employeeBranchId) && (String(u.role).toLowerCase() === 'admin');
          }) ?? (users.length ? users[0] : null);
        } catch {
          admin = null;
        }
      }

      if (!admin || !admin._id) {
        skippedNoAdmin++;
        continue;
      }

      // determine attendance branch id/name (branch where user checked-in)
      const attendanceBranchId = att.branch_id ?? att.branch?.id ?? att.branch?._id ?? null;
      let attendanceBranchName = attendanceBranchId ? branchNameById[String(attendanceBranchId)] ?? String(attendanceBranchId) : 'Unknown branch';
      if (att.branch?.name) attendanceBranchName = att.branch.name;

      // === NEW: only send if attendance branch differs from employee's own branch ===
      if (attendanceBranchId && String(attendanceBranchId) === String(employeeBranchId)) {
        // same-branch check in: admin of employee's branch does not need notification
        // (they can already see employees on-site). Skip.
        continue;
      }

      // Build employee display name
      const employeeName = employeeProfile?.fullname ?? employeeProfile?.username ?? (att.user as any)?.username ?? 'Employee';

      const dateTimeStr = att.In ?? att.created_at ?? '';
      const title = 'Employee checked-in';
      const body = `Your employee ${employeeName} has been checked-in in ${attendanceBranchName} at ${dateTimeStr}`;

      // create deterministic Firestore notification id to avoid duplicate docs across clients
      const notifDocId = `api:attendance:${String(attId)}`;
      const notifRef = doc(db, 'notifications', String(admin._id), 'inbox', notifDocId);

      try {
        // setDoc (idempotent): creates or overwrites the same doc id (no duplicate docs)
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
          { merge: true } // merge true so we don't accidentally remove extra fields
        );

        // mark sent (local dedupe)
        sentSet.add(attId);
        sent++;
      } catch (e) {
        console.warn('[attendanceNotifier] setDoc failed for admin', admin._id, e);
      }
    }

    // persist local sent ids
    try {
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...sentSet]));
    } catch (e) {
      console.warn('[attendanceNotifier] failed to save sent set', e);
    }

    const durationMs = Date.now() - startTs;
    return { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs };
  } catch (e) {
    console.error('[attendanceNotifier] failed', e);
    const durationMs = Date.now() - startTs;
    return { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs };
  }
};
