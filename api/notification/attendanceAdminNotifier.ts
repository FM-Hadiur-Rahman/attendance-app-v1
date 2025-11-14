// src/api/notification/attendanceAdminNotifier.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAttendanceAllHistory, AttendanceHistoryItem } from '../attendanceAllHistory';
import { getUserById, fetchUsers, getBranchById, ProfileUser } from '../profile';
import { sendNotificationToUser } from './firebaseNotifications'; // existing helper that adds to Firestore

const SENT_KEY = 'attendance_admin_sent_ids_v1';

/**
 * Build a stable attendance id string used for dedupe
 */
const attendanceUniqueId = (att: AttendanceHistoryItem) => {
  return (
    att.id ??
    (att as any)._id ??
    `${att.user?.id ?? (att.user as any)?._id ?? 'unknown'}_${att.branch_id ?? att.branch?._id ?? 'unknown'}_${String(att.In ?? att.created_at ?? '')}`
  );
};

/**
 * Send checked-in notifications only to the admin of the employee's own branch.
 * Optimized: parallel profile/admin/branch lookups and reduced per-row serial calls.
 *
 * Options:
 *  - targetDate?: "YYYY-MM-DD" (defaults to local today)
 *  - limitToUnsentOnly?: boolean (defaults to true)
 *
 * Returns stats: { sent, skippedAlreadySent, skippedNoAdmin, processed, durationMs }
 */
export const sendCheckedInNotificationsToBranchAdmin = async (opts?: {
  targetDate?: string;
  limitToUnsentOnly?: boolean;
}): Promise<{ sent: number; skippedAlreadySent: number; skippedNoAdmin: number; processed: number; durationMs: number }> => {
  const startTs = Date.now();
  const targetDate = opts?.targetDate ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const limitToUnsentOnly = opts?.limitToUnsentOnly ?? true;

  // load sent set
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

    // Prepare unique userIds and attendanceBranchIds for batch fetching
    const uniqueUserIds = Array.from(new Set(matched.map((m) => (m.user?.id ?? (m.user as any)?._id ?? null)).filter(Boolean) as string[]));
    const uniqueAttendanceBranchIds = Array.from(new Set(matched.map(m => m.branch_id ?? m.branch?.id ?? m.branch?._id).filter(Boolean) as string[]));

    // 1) Fetch all user profiles in parallel (Promise.allSettled)
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

    // 2) Determine unique employeeBranchIds (from user profiles) for admin lookup
    const employeeBranchIdsSet = new Set<string>();
    for (const uid of uniqueUserIds) {
      const p = userProfilesById[uid];
      const branchId = p?.branch?._id ?? (typeof p?.branch === 'string' ? p.branch : null);
      if (branchId) employeeBranchIdsSet.add(String(branchId));
    }
    const employeeBranchIds = Array.from(employeeBranchIdsSet);

    // 3) Fetch admins for all employeeBranchIds in parallel
    const adminsByBranch: Record<string, ProfileUser | null> = {};
    await Promise.allSettled(employeeBranchIds.map(async (branchId) => {
      try {
        // fetch more candidates just in case (limit 50)
        const res = await fetchUsers({ branchId, role: 'admin', limit: 50 });
        const users = res?.users ?? [];
        // find exact branch match among returned users
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

        // fallback: if none exact, choose first admin candidate (but we will still check exact-match condition again)
        adminsByBranch[branchId] = found ?? (users.length ? users[0] : null);
      } catch (e) {
        console.warn('[attendanceNotifier] fetchUsers(admin) failed for branch', branchId, e);
        adminsByBranch[branchId] = null;
      }
    }));

    // 4) Pre-fetch attendance-branch names (for message display) in parallel
    const branchNameById: Record<string, string | null> = {};
    await Promise.allSettled(uniqueAttendanceBranchIds.map(async (bId) => {
      try {
        // sometimes att.branch already contains name, but we don't have att context here; so call API
        const br = await getBranchById(String(bId));
        branchNameById[bId] = br?.name ?? String(bId);
      } catch (e) {
        branchNameById[bId] = String(bId);
      }
    }));

    // 5) Process each attendance row (faster because lookup caches ready)
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
      const employeeBranchId = employeeProfile?.branch?._id ?? (typeof employeeProfile?.branch === 'string' ? employeeProfile.branch : null) ?? null;
      if (!employeeBranchId) {
        skippedNoAdmin++;
        continue;
      }

      // Strict admin resolution: ensure chosen admin really belongs to employeeBranchId
      let admin = adminsByBranch[employeeBranchId] ?? null;
      // additional guard: check admin.branch matches exactly; otherwise search users fresh
      const adminBranchMatches = (adm?: ProfileUser | null) => {
        if (!adm) return false;
        const ab = (adm as any)?.branch?._id ?? (typeof (adm as any)?.branch === 'string' ? (adm as any).branch : null);
        return ab && String(ab) === String(employeeBranchId);
      };

      if (!adminBranchMatches(admin)) {
        // try re-fetch just for this branch (defensive)
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
        } catch (e) {
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
      // if att.branch?.name exists prefer it (defensive)
      if (att.branch?.name) attendanceBranchName = att.branch.name;

      // Build employee display name
      const employeeName = employeeProfile?.fullname ?? employeeProfile?.username ?? employeeProfile?.email ?? (att.user as any)?.username ?? 'Employee';

      const dateTimeStr = att.In ?? att.created_at ?? '';
      const title = 'Employee checked-in';
      const body = `Your employee ${employeeName} has been checked-in in ${attendanceBranchName}  at ${dateTimeStr}`;

      try {
        // Fire the helper that writes into Firestore inbox for that admin
        await sendNotificationToUser(admin._id, {
          title,
          body,
          type: 'attendance',
          meta: { attendanceId: attId, employeeId: userId, employeeBranchId, attendanceBranchId, raw: att },
        });

        // mark sent (persist dedupe)
        sentSet.add(attId);
        sent++;
      } catch (e) {
        console.warn('[attendanceNotifier] sendNotificationToUser failed for admin', admin._id, e);
      }
    }

    // persist sent ids
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
