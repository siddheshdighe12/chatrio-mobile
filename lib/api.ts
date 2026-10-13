import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/authStore';

/**
 * Base URL configuration.
 *
 * For Expo Go on a physical device, set this to your machine's LAN IP.
 * Example: http://192.168.1.100:3000
 *
 * For simulator/emulator: http://localhost:3000
 *
 * Override via EXPO_PUBLIC_API_URL.
 */
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Debug: show the API URL used by the running app ─────────────────────────
console.log('[API BASE URL]', BASE_URL);

// ── Debug: test native Android fetch connectivity ───────────────────────────
fetch(`${BASE_URL}/health`)
  .then(async (res) => {
    const text = await res.text();

    console.log(
      '[FETCH HEALTH]',
      res.status,
      text,
    );
  })
  .catch((err) => {
    console.log(
      '[FETCH HEALTH ERROR]',
      err?.message ?? err,
    );
  });

export const api = axios.create({
  baseURL: BASE_URL,
  // 30 s covers Render free-tier cold-starts (~15–30 s).
  // Upload calls override this to 60 s via per-request config.
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request interceptor — attach access token ────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const { accessToken } = useAuthStore.getState();

    // When the body is FormData, remove the default Content-Type so that
    // React Native's native XHR can set "multipart/form-data; boundary=..."
    // automatically. If we leave "application/json" here the server receives
    // no boundary and throws FST_INVALID_MULTIPART_CONTENT_TYPE.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    console.log(
      '[API REQUEST]',
      config.method?.toUpperCase(),
      `${BASE_URL}${config.url}`,
      'HAS_TOKEN:',
      !!accessToken,
    );

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    console.log('[API REQUEST SETUP ERROR]', error);

    return Promise.reject(error);
  },
);

// ── Response interceptor — handle 401, refresh token ────────────────────────
let isRefreshing = false;

let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

api.interceptors.response.use(
  (response) => {
    console.log(
      '[API RESPONSE]',
      response.status,
      response.config.method?.toUpperCase(),
      response.config.url,
    );

    return response;
  },

  async (error) => {
    const original = error.config;

    console.log(
      '[API ERROR]',
      error.message,
      error.code,
      error.response?.status,
      error.config?.method?.toUpperCase(),
      error.config?.url,
    );

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      // Another request is already refreshing the token.
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve,
            reject,
          });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;

            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync(
          'chatrio_refresh_token',
        );

        console.log(
          '[API REFRESH]',
          'HAS_REFRESH_TOKEN:',
          !!refreshToken,
        );

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {
            refreshToken,
          },
        );

        console.log('[API REFRESH SUCCESS]');

        const newAccessToken: string = data.accessToken;

        const { setAuth, user } = useAuthStore.getState();

        if (user) {
          setAuth(user, newAccessToken);
        }

        // Resolve all requests waiting for the refresh.
        refreshQueue.forEach(({ resolve }) => {
          resolve(newAccessToken);
        });

        refreshQueue = [];

        // Retry the original request with the new token.
        original.headers.Authorization = `Bearer ${newAccessToken}`;

        return api(original);
      } catch (refreshError) {
        console.log(
          '[API REFRESH ERROR]',
          refreshError instanceof Error
            ? refreshError.message
            : refreshError,
        );

        // Reject all queued requests.
        refreshQueue.forEach(({ reject }) => {
          reject(refreshError);
        });

        refreshQueue = [];

        // Clear auth state — user must log in again.
        await useAuthStore.getState().clearAuth();

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;