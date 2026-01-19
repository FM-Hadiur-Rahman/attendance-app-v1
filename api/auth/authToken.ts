//api/auth/authToken.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'userToken';
const USER_ID_KEY = 'userId';
const TOKEN_META_KEY = `${TOKEN_KEY}_meta`;

// internal shape when we store token as JSON
type StoredToken = {
  token: string;
  savedAt: number; // epoch ms
};

type StoredTokenMeta = {
  savedAt: number;
};
/**
 * Save token.
 * - Stores as JSON { token, savedAt } to allow future metadata (expiry, refresh, etc).
 * - Backward compatible: if other code expects raw string, getToken() will return raw token.
 */
// export const saveToken = async (token: string): Promise<void> => {
//   try {
//     const payload: StoredToken = { token, savedAt: Date.now() };
//     await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(payload));
//   } catch (e) {
//     console.error('Failed to save token', e);
//   }
// };

export const saveToken = async (token: string): Promise<void> => {
  try {
    // Store the raw token where axiosInstance expects it
    await AsyncStorage.setItem(TOKEN_KEY, token);

    // Also store meta separately (you can extend this later, safe to read if needed)
    const meta: StoredTokenMeta = { savedAt: Date.now() };
    await AsyncStorage.setItem(TOKEN_META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.error('Failed to save token', e);
  }
};
/**
 * Get token string or null.
 * - Handles both JSON-stored token and legacy raw string token.
 */
export const getToken = async (): Promise<string | null> => {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (!raw) return null;

    // try parse JSON, if fails assume it's a raw token string
    try {
      const parsed = JSON.parse(raw) as StoredToken | null;
      if (parsed && typeof parsed.token === 'string') return parsed.token;
      // fallback to raw if shape unexpected
      return raw;
    } catch {
      // raw string (legacy)
      return raw;
    }
  } catch (e) {
    console.error('Failed to get token', e);
    return null;
  }
};

export const removeToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.error('Failed to remove token', e);
  }
};

// ===== User ID =====

export const saveUserId = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_ID_KEY, userId);
  } catch (e) {
    console.error('Failed to save user ID', e);
  }
};

export const getUserId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(USER_ID_KEY);
  } catch (e) {
    console.error('Failed to get user ID', e);
    return null;
  }
};

export const removeUserId = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(USER_ID_KEY);
  } catch (e) {
    console.error('Failed to remove user ID', e);
  }
};

/**
 * Convenience: get both token and userId together.
 */
export const getAuthData = async (): Promise<{ token: string | null; userId: string | null }> => {
  try {
    const [token, userId] = await Promise.all([getToken(), getUserId()]);
    return { token, userId };
  } catch (e) {
    console.error('Failed to get auth data', e);
    return { token: null, userId: null };
  }
};

/**
 * Convenience: remove both token and userId.
 */
export const clearAllAuthData = async (): Promise<void> => {
  try {
    await Promise.all([removeToken(), removeUserId()]);
  } catch (e) {
    console.error('Failed to clear auth data', e);
  }
};
