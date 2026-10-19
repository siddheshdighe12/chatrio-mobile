import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from '../store/authStore';

const ACCESS_TOKEN_KEY = 'chatrio_access_token';
const REFRESH_TOKEN_KEY = 'chatrio_refresh_token';
const USER_KEY = 'chatrio_user';

/**
 * Storage architecture:
 * - Sensitive authentication credentials (accessToken, refreshToken) are stored
 *   EXCLUSIVELY in hardware-backed/encrypted SecureStore. They are NEVER stored in
 *   unencrypted AsyncStorage.
 * - Non-sensitive display data (cached AuthUser profile) is stored in AsyncStorage
 *   for instant, flicker-free UI restoration on startup.
 */
export const authStorage = {
  async getAccessToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch (err: any) {
      console.warn('[AuthStorage] Failed to read accessToken from SecureStore:', err?.message ?? err);
      return null;
    }
  },

  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch (err: any) {
      console.warn('[AuthStorage] Failed to read refreshToken from SecureStore:', err?.message ?? err);
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },

  async getUser(): Promise<AuthUser | null> {
    try {
      const raw = await AsyncStorage.getItem(USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch (err: any) {
      console.warn('[AuthStorage] Failed to read user profile from AsyncStorage:', err?.message ?? err);
      return null;
    }
  },

  async setUser(user: AuthUser): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (err: any) {
      console.warn('[AuthStorage] Failed to save user profile to AsyncStorage:', err?.message ?? err);
    }
  },

  async saveAuth(user: AuthUser, accessToken: string, refreshToken?: string): Promise<void> {
    const promises: Promise<void>[] = [
      this.setUser(user),
      this.setAccessToken(accessToken),
    ];
    if (refreshToken) {
      promises.push(this.setRefreshToken(refreshToken));
    }
    await Promise.all(promises);
  },

  async clearAll(): Promise<void> {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {}),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {}),
      AsyncStorage.removeItem(USER_KEY).catch(() => {}),
      // Clean up legacy token keys from AsyncStorage if previously present
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {}),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY).catch(() => {}),
    ]);
  },
};
