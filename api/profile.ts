// api/profile.ts
import axiosInstance from './axiosInstance';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './auth/authToken'; // only userId from authToken

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
 * Updates the user's profile.
 */
export const updateProfile = async (
  payload: Partial<ProfileUser>,
  id?: string
): Promise<ProfileUser> => {
  try {
    let userId = id;
    if (!userId) {
      userId = await getUserId();
    }
    if (!userId) {
      throw new Error('Cannot determine user id for update');
    }

    const res = await axiosInstance.put(`/users/${userId}`, payload);

    const updated =
      res?.data?.data ??
      res?.data?.user ??
      (res?.data && typeof res.data === 'object' ? res.data : null);

    if (!updated) {
      throw new Error('Unexpected update response');
    }

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

export const updateUser = async (id: string, payload: Partial<ProfileUser>): Promise<ProfileUser> => {
  try {
    if (!id) throw new Error('updateUser: missing id');
    const res = await axiosInstance.put(`/users/${id}`, payload);

    const updated =
      res?.data?.data ??
      res?.data?.user ??
      (res?.data && typeof res.data === 'object' ? res.data : null);

    if (!updated) {
      throw new Error('Unexpected update response');
    }

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

// api/profile.ts  (add near other exports)

export type AttendanceSummary = {
  success: boolean;
  employee?: string;
  total_sessions?: number;
  total_minutes?: number;
  total_hours?: number;
  formatted_time?: string; // e.g. "01:13"
};

export const getUserAttendanceSummary = async (staffId: string): Promise<AttendanceSummary | null> => {
  try {
    if (!staffId) throw new Error('getUserAttendanceSummary: missing staffId');
    const res = await axiosInstance.get(`/admin/attendance/user-summary/${staffId}`);
    // API returns the shape you posted:
    // { success: true, employee: "...", total_sessions: 10, total_minutes: 73, total_hours: 1.22, formatted_time: "01:13" }
    const data = res?.data ?? null;
    if (!data) return null;
    return data as AttendanceSummary;
  } catch (error: any) {
    console.error('getUserAttendanceSummary() failed:', error?.response?.data ?? error);
    // bubble up useful message
    throw error?.response?.data ?? error?.message ?? 'Failed to fetch attendance summary';
  }
};

// api/profile.ts  (replace existing fetchUsers implementation with this)
export const fetchUsers = async (params?: {
  branchId?: string;
  role?: string;
  page?: number;
  limit?: number;
}) => {
  try {
    let branchId = params?.branchId;
    if (!branchId) {
      branchId = await getBranchId();
    }

    // Build query params
    const queryParams: string[] = [];
    if (branchId) queryParams.push(`branch=${branchId}`);
    if (params?.role) queryParams.push(`role=${params.role}`);
    if (typeof params?.page === 'number') queryParams.push(`page=${params.page}`);
    if (typeof params?.limit === 'number') queryParams.push(`limit=${params.limit}`);

    const query = queryParams.length ? `?${queryParams.join('&')}` : '';

    const res = await axiosInstance.get(`/users${query}`);
    if (!res?.data) throw new Error('Users response missing data');

    // Server response shape (based on the example you posted)
    // { success: true, page: 1, limit: 10, total: 22, totalPages: 3, users: [...] }
    const data = res.data;

    const users = Array.isArray(data.users) ? data.users : (Array.isArray(data) ? data : []);
    const page = typeof data.page === 'number' ? data.page : params?.page ?? 1;
    const limit = typeof data.limit === 'number' ? data.limit : params?.limit ?? users.length;
    const total = typeof data.total === 'number' ? data.total : users.length;
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : Math.ceil(total / limit);

    return {
      users: users as ProfileUser[],
      page,
      limit,
      total,
      totalPages,
    };
  } catch (error: any) {
    console.error('fetchUsers() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || error?.message || 'Failed to fetch users';
  }
};



// api/profile.ts  (append or insert near other exports)

export const getUserById = async (id: string): Promise<ProfileUser | null> => {
  try {
    if (!id) throw new Error('getUserById: missing id');
    const res = await axiosInstance.get(`/users/${id}`);
    // server might return { user: {...} } or the user object directly
    const user = res?.data?.user ?? res?.data ?? null;
    if (!user) return null;
    return user as ProfileUser;
  } catch (error: any) {
    console.error('getUserById() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || error?.message || 'Failed to fetch user';
  }
};
export const deleteUser = async (staffId: string): Promise<any> => {
  try {
    if (!staffId) throw new Error('deleteUser: missing staffId');
    const res = await axiosInstance.delete(`/users/${staffId}`);
    // return server response (could be message or deleted user)
    return res?.data ?? null;
  } catch (error: any) {
    console.error('deleteUser() failed:', error?.response?.data ?? error);
    // throw a helpful message upward
    throw error?.response?.data?.message ?? error?.response?.data ?? error?.message ?? 'Failed to delete user';
  }
};