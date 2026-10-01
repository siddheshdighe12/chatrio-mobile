/**
 * Expo Push Notifications - Chatrio
 *
 * Handles:
 *  - Requesting notification permission
 *  - Registering the Expo push token with the backend
 *  - Setting up foreground and tap-response handlers
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

// --- Foreground notification behaviour ---------------------------------------
// Show the notification as a banner even while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const DEVICE_ID_KEY = 'chatrio_installation_device_id';

/**
 * Returns a stable device identifier stored in SecureStore.
 * Generates and persists a random UUID if one doesn't exist yet.
 */
async function getStableDeviceId(): Promise<string> {
  try {
    const existingId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existingId) {
      return existingId;
    }
    const newId =
      'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return 'fallback_device_' + Platform.OS;
  }
}

/**
 * Requests notification permission and registers the Expo push token
 * with the Chatrio backend.
 *
 * Safe to call every time the user logs in - the backend upserts on
 * (userId, deviceId) so there are no duplicates.
 *
 * @returns The Expo push token string, or null if permission was denied
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Diagnostic log — Device.isDevice must be true for real hardware.
  // If you see "isDevice=false" on a physical phone, the dev-client build
  // may be running inside a virtualised environment.
  console.log(
    `[Push] Device.isDevice=${Device.isDevice} | brand=${Device.brand} | OS=${Platform.OS}`
  );

  if (!Device.isDevice) {
    console.warn('[Push] Skipping — Device.isDevice is false (emulator/simulator detected).');
    return null;
  }

  // Always create the Android notification channel first (idempotent).
  // This guarantees the channel exists even when the app is reinstalled or
  // the channel is deleted by the user in system settings.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
      sound: 'default',
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
    });
  }

  // Check / request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Notification permission not granted — status:', finalStatus);
    return null;
  }

  // Get the Expo push token
  let token: string | null = null;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    token = result.data;
  } catch (err) {
    console.warn('[Push] Failed to get push token:', err);
    return null;
  }

  if (!token) return null;

  // Register token with the backend
  try {
    const deviceId = await getStableDeviceId();
    await api.post('/push-tokens', {
      token,
      deviceId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    console.log('[Push] Token registered successfully:', token);
  } catch (err: any) {
    console.warn('[Push] Failed to register token with backend:', err?.message);
  }

  return token;
}

/**
 * Removes this device's push token from the backend.
 * Call on logout so the user stops receiving notifications on this device.
 */
export async function unregisterPushTokenAsync(): Promise<void> {
  try {
    const deviceId = await getStableDeviceId();
    await api.delete(`/push-tokens/${deviceId}`);
    console.log('[Push] Token unregistered');
  } catch (err: any) {
    console.warn('[Push] Failed to unregister token:', err?.message);
  }
}
