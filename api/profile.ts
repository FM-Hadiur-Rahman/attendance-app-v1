// src/api/profile.ts
import axiosInstance from './axiosInstance';
import { getUserId } from './auth/authToken'; 

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

/**
 * GET /profile
 */
export const getProfile = async (): Promise<ProfileUser> => {
  try {
    const res = await axiosInstance.get('/profile');
    if (!res?.data?.user) {
      throw new Error('Profile response missing user');
    }
    return res.data.user as ProfileUser;
  } catch (error: any) {
    console.error('getProfile() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || error?.message || 'Failed to fetch profile';
  }
};

/**
 * PUT /users/:id
 * - payload: partial user fields to update (e.g. { fullname: "..." })
 * - id (optional): if not provided, we try to read saved userId from AsyncStorage via getUserId()
 *
 * Returns the updated user object (backend returns either { success: true, data: user } or { user }).
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

    // backend shape from your example:
    // { success: true, data: { ...user... } }
    // but handle other possible shapes: res.data.data, res.data.user, or res.data
    const updated =
      res?.data?.data ?? res?.data?.user ?? (res?.data && typeof res.data === 'object' ? res.data : null);

    if (!updated) {
      throw new Error('Unexpected update response');
    }

    return updated as ProfileUser;
  } catch (error: any) {
    console.error('updateProfile() failed:', error?.response?.data ?? error);
    // If axios error, try to return a useful message
    if (error?.response) {
      const serverMsg = error.response.data?.message ?? error.response.data ?? error.response.statusText;
      throw serverMsg || 'Failed to update profile';
    }
    throw error?.message || 'Failed to update profile';
  }
};

/**
 * GET /users
 * - returns the raw response `.data.users` (or an empty array)
 * - accepts optional params object (page, limit, search)
 */
export const getUsers = async (params: Record<string, any> = {}): Promise<ProfileUser[]> => {
  try {
    const res = await axiosInstance.get('/users', { params });
    // expected: { success: true, users: [...] }
    const users = res?.data?.users ?? (Array.isArray(res?.data) ? res.data : []);
    return users as ProfileUser[];
  } catch (error: any) {
    console.error('getUsers() failed:', error?.response?.data ?? error);
    throw error?.response?.data ?? error;
  }
};

/**
 * Utility: returns a map of first admin (manager) found per branch:
 * { [branchId]: fullname | username | undefined }
 *
 * - Fetches all users (up to `limit` if passed)
 * - Picks first user with role === 'admin' for each branch
 */
export const getManagersByBranch = async (params: { limit?: number } = {}): Promise<Record<string, string | undefined>> => {
  try {
    const users = await getUsers({ limit: params.limit ?? 1000 });
    const map: Record<string, string | undefined> = {};

    users.forEach((u: any) => {
      if (!u) return;
      if (u.role === 'admin') {
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
