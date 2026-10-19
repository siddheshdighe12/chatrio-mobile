import { create } from 'zustand';
import axios from 'axios';
import { authStorage } from '../lib/authStorage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
  showReadReceipts?: boolean;
  showTypingStatus?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setAuth: (user: AuthUser, accessToken: string, refreshToken?: string) => Promise<void>;
  setUser: (user: AuthUser) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  clearAuth: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,

  setAuth: async (user, accessToken, refreshToken) => {
    try {
      await authStorage.saveAuth(user, accessToken, refreshToken);
    } catch (e) {
      console.warn('[authStore] Failed to save auth to storage:', e);
    }
    set({ user, accessToken, isAuthenticated: true, isLoading: false });
  },

  setUser: async (user) => {
    try {
      await authStorage.setUser(user);
    } catch (e) {
      console.warn('[authStore] Failed to save user to storage:', e);
    }
    set({ user });
  },

  setAccessToken: async (accessToken) => {
    try {
      await authStorage.setAccessToken(accessToken);
    } catch (e) {
      console.warn('[authStore] Failed to save accessToken to storage:', e);
    }
    set({ accessToken, isAuthenticated: true });
  },

  updateUser: (updates) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, ...updates };
      authStorage.setUser(updated).catch(() => {});
      set({ user: updated });
    }
  },

  clearAuth: async () => {
    try {
      await authStorage.clearAll();
    } catch (e) {
      console.warn('[authStore] Failed to clear storage:', e);
    }
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
  },

  loadStoredAuth: async () => {
    try {
      const [token, refreshToken, cachedUser] = await Promise.all([
        authStorage.getAccessToken(),
        authStorage.getRefreshToken(),
        authStorage.getUser(),
      ]);

      if (token) {
        // Mark as authenticated optimistically with any cached user profile.
        // The root layout's /auth/me effect will validate the token against the backend.
        set({
          accessToken: token,
          user: cachedUser,
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }

      // If access token is missing or failed to read, but we have a refresh token,
      // attempt session restoration immediately before giving up.
      if (refreshToken) {
        console.log('[authStore] Access token missing but refresh token exists. Attempting restoration...');
        try {
          const res = await axios.post(
            `${BASE_URL}/auth/refresh`,
            { refreshToken },
            { timeout: 15000 },
          );
          const newAccessToken: string = res.data.accessToken;
          await authStorage.setAccessToken(newAccessToken);
          set({
            accessToken: newAccessToken,
            user: cachedUser,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        } catch (refreshErr: any) {
          const status = refreshErr?.response?.status;
          console.warn(
            '[authStore] Session restoration via refresh token failed:',
            status ?? refreshErr?.message,
          );
          if (status === 401 || status === 403) {
            // Refresh token revoked or expired on server
            await authStorage.clearAll();
            set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
            return;
          }
          // Transient network error or server cold start:
          // Keep the session optimistically authenticated so the user is not kicked to login screen when offline.
          set({
            accessToken: null,
            user: cachedUser,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      }

      // No credentials found
      set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
    } catch (err: any) {
      console.warn('[authStore] loadStoredAuth unexpected error:', err?.message ?? err);
      set({ isLoading: false });
    }
  },
}));
