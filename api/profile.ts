// src/api/profile.ts
import axiosInstance from './axiosInstance';
import { getUserId } from './auth/authToken'; // <- your existing helper that returns stored userId

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
