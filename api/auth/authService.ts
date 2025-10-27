//api/auth/ AuthService.ts
import axiosInstance from '../axiosInstance';
import {
  saveToken,
  saveUserId,
  removeToken,
  removeUserId,
} from './authToken';

// ======================================================
//                  INTERFACES
// ======================================================

export interface LoginPayload {
  email?: string;
  username?: string;
  password: string;
}

export interface RegisterPayload {
  salutation?: string;
  firstName: string;
  lastName: string;
  dob?: string;
  phone?: string;
  email: string;
  password: string;
  username?: string;
  fullname?: string; // added
}

export interface AuthResponse {
  token: string;
  user: {
    _id?: string;
    id?: string;
    salutation?: string;
    firstName?: string;
    lastName?: string;
    fullname?: string; // added
    dob?: string;
    phone?: string;
    username?: string;
    email?: string;
  };
}

// ======================================================
//                  API CALLS
// ======================================================

/**
 * Register a new user.
 * Expects RegisterPayload and returns AuthResponse from backend.
 */
export const register = async (data: RegisterPayload): Promise<AuthResponse> => {
  try {
    const response = await axiosInstance.post('/register', data);

    // Save token if provided
    if (response.data?.token) await saveToken(response.data.token);

    // Support both response.data.user.id and response.data.user._id
    const userId = response.data?.user?.id ?? response.data?.user?._id;
    if (userId) await saveUserId(userId);

    return response.data as AuthResponse;
  } catch (error: any) {
    console.error('register() failed:', error?.response?.data ?? error);
    throw (
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      'Registration failed'
    );
  }
};

/**
 * Register a new user as admin.
 */
export const register1 = async (data: RegisterPayload): Promise<AuthResponse> => {
  try {
    const response = await axiosInstance.post('/users', data);

    // Save token if provided
    if (response.data?.token) await saveToken(response.data.token);

    // Support both response.data.user.id and response.data.user._id
    const userId = response.data?.user?.id ?? response.data?.user?._id;
    if (userId) await saveUserId(userId);

    return response.data as AuthResponse;
  } catch (error: any) {
    console.error('register() failed:', error?.response?.data ?? error);
    throw (
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      'Registration failed'
    );
  }
};

/**
 * Login with email/username & password.
 * Expects LoginPayload and returns AuthResponse from backend.
 */
export const login = async (data: LoginPayload): Promise<AuthResponse> => {
  try {
    const response = await axiosInstance.post('/login', data);

    // Save token if provided
    if (response.data?.token) await saveToken(response.data.token);

    // Support both response.data.user.id and response.data.user._id
    const userId = response.data?.user?.id ?? response.data?.user?._id;
    if (userId) await saveUserId(userId);

    // ✅ Keep fullname exactly as backend provides; do not generate from firstName/lastName
    if (!response.data?.user?.fullname) {
      response.data.user.fullname = ''; // optional: default empty string
    }

    return response.data as AuthResponse;
  } catch (error: any) {
    console.error('login() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || 'Login failed';
  }
};


/**
 * Logout: informs backend and clears local token/userId.
 */
export const logout = async (): Promise<void> => {
  try {
    // Inform backend (if endpoint exists)
    await axiosInstance.post('/logout').catch(() => {
      // ignore backend logout errors (still clear local data)
    });

    // Clear stored auth data
    await removeToken();
    await removeUserId();
  } catch (error: any) {
    console.error('logout() failed:', error?.response?.data ?? error);
    throw error?.response?.data?.message || 'Logout failed';
  }
};
