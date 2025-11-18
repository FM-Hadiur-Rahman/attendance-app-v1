// api/profile.ts
import axiosInstance from './axiosInstance';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './auth/authToken'; // only userId from authToken

// ============================================================
// ✅ Types
// ============================================================

export interface ProfileUser {
  _id: string;
  username?: string;
  fullname?: string;
  position?: string;
  phone?: string;
  email?: string;
  role?: string;
  branch?: string | { _id?: string; name?: string };
  [key: string]: any;
}

// ============================================================
// ✅ Branch ID handling (saved in AsyncStorage)
// ============================================================

const USER_BRANCH_KEY = 'userBranchId';

export const saveBranchId = async (branchId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_BRANCH_KEY, branchId);
    console.log('✅ Branch ID saved:', branchId);
  } catch (e) {
    console.error('Failed to save branch ID', e);
  }
};

export const getBranchId = async (): Promise<string | null> => {
  try {
    const branchId = await AsyncStorage.getItem(USER_BRANCH_KEY);
    if (branchId) console.log('ℹ️ Loaded branch ID:', branchId);
    else console.log('⚠️ No branch ID found');
    return branchId;
  } catch (e) {
    console.error('Failed to get branch ID', e);
    return null;
  }
};

// ============================================================
// ✅ Profile API
// ============================================================

/**
 * GET /profile
 * Fetches logged-in user's profile and saves their branch ID.
 */
export const getProfile = async (): Promise<ProfileUser> => {
  try {
    const res = await axiosInstance.get('/profile');
    if (!res?.data?.user) {
      throw new Error('Profile response missing user');
    }

    const user = res.data.user as ProfileUser;

    // Extract and save branch ID
    const branchId =
      typeof user.branch === 'string'
        ? user.branch
        : user.branch?._id ?? null;

    if (branchId) {
      await saveBranchId(branchId);
    } else {
      console.log('⚠️ No branch ID found in profile');
    }

    return user;
  } catch (error: any) {
    console.error('getProfile() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || error?.message || 'Failed to fetch profile';
  }
};

/**
 * PUT /users/:id
 * Updates the logged-in user's profile.
 */
export const updateProfile = async (
  payload: Partial<ProfileUser>,
  id?: string
): Promise<ProfileUser> => {
  try {
    let userId = id || (await getUserId());
    if (!userId) throw new Error('Cannot determine user id for update');

    const res = await axiosInstance.put(`/users/${userId}`, payload);
    const updated =
      res?.data?.data ?? res?.data?.user ?? res?.data ?? null;

    if (!updated) throw new Error('Unexpected update response');

    return updated as ProfileUser;
  } catch (error: any) {
    console.error('updateProfile() failed:', error?.response?.data ?? error);
    const serverMsg =
      error?.response?.data?.message ??
      error?.response?.data ??
      error?.response?.statusText;
    throw serverMsg || error?.message || 'Failed to update profile';
  }
};

/**
 * PUT /users/:id
 * Updates another user by ID.
 */
export const updateUser = async (id: string, payload: Partial<ProfileUser>): Promise<ProfileUser> => {
  try {
    if (!id) throw new Error('updateUser: missing id');
    const res = await axiosInstance.put(`/users/${id}`, payload);
    const updated =
      res?.data?.data ?? res?.data?.user ?? res?.data ?? null;

    if (!updated) throw new Error('Unexpected update response');

    return updated as ProfileUser;
  } catch (error: any) {
    console.error('updateUser() failed:', error?.response?.data ?? error);
    const serverMsg =
      error?.response?.data?.message ??
      error?.response?.data ??
      error?.response?.statusText;
    throw serverMsg || error?.message || 'Failed to update user';
  }
};

// ============================================================
// ✅ User fetching
// ============================================================

export const fetchUsers = async (params?: {
  branchId?: string;
  role?: string;
  page?: number;
  limit?: number;
}) => {
  try {
    let branchId = params?.branchId ?? (await getBranchId());

    const queryParams: string[] = [];
    if (branchId) queryParams.push(`branch=${branchId}`);
    if (params?.role) queryParams.push(`role=${params.role}`);
    if (typeof params?.page === 'number') queryParams.push(`page=${params.page}`);
    if (typeof params?.limit === 'number') queryParams.push(`limit=${params.limit}`);

    const query = queryParams.length ? `?${queryParams.join('&')}` : '';

    const res = await axiosInstance.get(`/users${query}`);
    if (!res?.data) throw new Error('Users response missing data');

    const data = res.data;
    const users = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];

    return {
      users: users as ProfileUser[],
      page: data.page ?? params?.page ?? 1,
      limit: data.limit ?? params?.limit ?? users.length,
      total: data.total ?? users.length,
      totalPages: data.totalPages ?? Math.ceil((data.total ?? users.length) / ((data.limit ?? users.length) || 1)),
    };
  } catch (error: any) {
    console.error('fetchUsers() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || error?.message || 'Failed to fetch users';
  }
};

// ============================================================
// ✅ Attendance Summary
// ============================================================

export type AttendanceSummary = {
  success: boolean;
  employee?: string;
  total_sessions?: number;
  total_minutes?: number;
  total_hours?: number;
  formatted_time?: string;
};

export const getUserAttendanceSummary = async (staffId: string): Promise<AttendanceSummary | null> => {
  try {
    if (!staffId) throw new Error('getUserAttendanceSummary: missing staffId');
    const res = await axiosInstance.get(`/admin/attendance/user-summary/${staffId}?period=month`);
    const data = res?.data ?? null;
    return data as AttendanceSummary;
    
  } catch (error: any) {
    console.error('getUserAttendanceSummary() failed:', error?.response?.data ?? error);
    throw error?.response?.data ?? error?.message ?? 'Failed to fetch attendance summary';
  }
};

// ============================================================
// ✅ Miscellaneous Helpers
// ============================================================

export const getUserById = async (id: string): Promise<ProfileUser | null> => {
  try {
    if (!id) throw new Error('getUserById: missing id');
    const res = await axiosInstance.get(`/users/${id}`);
    const user = res?.data?.user ?? res?.data ?? null;
    return user as ProfileUser | null;
  } catch (error: any) {
    console.error('getUserById() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || error?.message || 'Failed to fetch user';
  }
};

export const getUsers = async (params: Record<string, any> = {}): Promise<ProfileUser[]> => {
  try {
    const res = await axiosInstance.get('/users', { params });
    const users = res?.data?.users ?? (Array.isArray(res?.data) ? res.data : []);
    return users as ProfileUser[];
  } catch (error: any) {
    console.error('getUsers() failed:', error?.response?.data ?? error);
    throw error?.response?.data ?? error;
  }
};

export const getManagersByBranch = async (params: { limit?: number } = {}): Promise<Record<string, string | undefined>> => {
  try {
    const users = await getUsers({ limit: params.limit ?? 1000 });
    const map: Record<string, string | undefined> = {};

    users.forEach((u: any) => {
      if (u?.role === 'admin') {
        const branchId = u.branch?._id ?? (typeof u.branch === 'string' ? u.branch : undefined);
        if (branchId && !map[branchId]) {
          map[branchId] = u.fullname ?? u.username ?? undefined;
        }
      }
    });

    return map;
  } catch (e) {
    console.warn('getManagersByBranch failed', e);
    return {};
  }
};

export const deleteUser = async (staffId: string): Promise<any> => {
  try {
    if (!staffId) throw new Error('deleteUser: missing staffId');
    const res = await axiosInstance.delete(`/users/${staffId}`);
    return res?.data ?? null;
  } catch (error: any) {
    console.error('deleteUser() failed:', error?.response?.data ?? error);
    throw (
      error?.response?.data?.message ??
      error?.response?.data ??
      error?.message ??
      'Failed to delete user'
    );
  }
};
export const getBranchById = async (branchId: string): Promise<{ _id: string; name: string } | null> => {
  try {
    if (!branchId) throw new Error('getBranchById: missing branchId');

    // Try several likely endpoints. Use axiosInstance so Authorization header is included.
    const tryPaths = [
      // common patterns
      `/branch/${branchId}`,
      `/branches/${branchId}`,
      `/api.branch/${branchId}`,   // matches the URL you provided: https://api.mrbrbackpunkte.de/api.branch/(branchid)
      // some APIs expose dot-style paths (rare) — as an absolute fallback use full URL
      `https://api.mrbrbackpunkte.de/api.branch/${branchId}`,
    ];

    let lastErr: any = null;
    for (const p of tryPaths) {
      try {
        // If p is absolute URL axiosInstance.get will still work.
        const res = await axiosInstance.get(p);
        const data = res?.data ?? null;

        // Possible shapes:
        // { data: { _id, name, ... } } OR { branch: { _id, name } } OR { _id, name }
        const branch =
          data?.data?.branch ??
          data?.branch ??
          data?.data ??
          data;

        const id = branch?._id ?? branch?.id ?? branchId;
        const name = branch?.name ?? branch?.branch_name ?? branch?.title ?? null;

        if (id) {
          return { _id: String(id), name: String(name ?? id) };
        }
      } catch (err) {
        lastErr = err;
        // try the next candidate
      }
    }

    console.warn('getBranchById: all attempts failed', lastErr);
    return null;
  } catch (error: any) {
    console.error('getBranchById() failed:', error?.response ?? error);
    return null;
  }
};

export const postSchedulesBulk = async (
  employeeId: string,
  branchId: string,
  schedules: Array<{ date: string; day_of_week: string; start_time: string; end_time: string }>,
  adminToken?: string
) => {
  try {
    // defensive: filter out any malformed items
    const bodySchedules = (schedules || []).filter(s =>
      s && typeof s.date === 'string' && typeof s.day_of_week === 'string' &&
      typeof s.start_time === 'string' && typeof s.end_time === 'string'
    ).map(s => ({
      date: s.date,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
    }));

    const body = {
      employee_id: String(employeeId),
      branch_id: String(branchId ?? ''),
      schedules: bodySchedules,
    };

    if (!body.employee_id || !body.branch_id) {
      throw new Error('Missing employee_id or branch_id');
    }

    console.log('postSchedulesBulk -> sending body:', JSON.stringify(body, null, 2));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

    const resp = await axiosInstance.post('/schedule/bulk', body, { headers });
    return resp.data;
  } catch (e: any) {
    console.warn('postSchedulesBulk error', e?.response ?? e);
    if (e?.response?.data) {
      console.warn('server response data:', JSON.stringify(e.response.data, null, 2));
    }
    throw e;
  }
};
// -----------------------------------------------------------------
// Get logged-in user's branch id (server-authoritative fallback)
// -----------------------------------------------------------------
export const getLoggedInUserBranch = async (
  preferCache = false
): Promise<string | null> => {
  try {
    // 1) Return cached value if allowed
    if (preferCache) {
      const cached = await AsyncStorage.getItem(USER_BRANCH_KEY);
      if (cached) {
        console.log("getLoggedInUserBranch: returning cached branch id:", cached);
        return cached;
      }
    }
    const userId = await getUserId();
    if (!userId) {
      console.warn("getLoggedInUserBranch: no logged-in user id available");
      return null;
    }
    const tryPaths = [
      `/user/${userId}`,
      `/users/${userId}`,
      `/api/user/${userId}`,
      `/api.users/${userId}`,
      // absolute fallback:
      `https://api.mrbrbackpunkte.de/api/user/${userId}`,
    ];

    let lastErr: any = null;
    for (const p of tryPaths) {
      try {
        const res = await axiosInstance.get(p);
        const data = res?.data ?? null;
        const user =
          data?.data?.user ?? data?.user ?? data?.data ?? data;

        if (!user) continue;
        const branchField = user.branch ?? user.branch_id ?? user.branchId ?? null;
        let branchId: string | null = null;
        if (!branchField) {
          const nested = user.branch ?? null;
          if (nested && (nested._id || nested.id)) {
            branchId = String(nested._id ?? nested.id);
          }
        } else {
          branchId =
            typeof branchField === "string"
              ? branchField
              : branchField._id ?? branchField.id ?? null;
        }

        if (branchId) {
          // cache it for next time
          try {
            await AsyncStorage.setItem(USER_BRANCH_KEY, String(branchId));
            console.log("getLoggedInUserBranch: cached branch id:", branchId);
          } catch (e) {
            console.warn("getLoggedInUserBranch: failed to cache branch id", e);
          }
          return String(branchId);
        }
      } catch (err) {
        lastErr = err;
        // continue to next path
      }
    }

    console.warn("getLoggedInUserBranch: all attempts failed", lastErr);
    return null;
  } catch (error: any) {
    console.error("getLoggedInUserBranch failed:", error?.response ?? error);
    return null;
  }
};
