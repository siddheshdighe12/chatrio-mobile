import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus, useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { connectSocket, disconnectSocket, onSocketReconnect } from '../lib/socket';
import { api } from '../lib/api';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { StartupScreen } from '../components/StartupScreen';
import { IncomingCallModal } from '../components/IncomingCallModal';

// Keep the native splash screen visible until StartupScreen explicitly hides it.
// This must be called at module scope (before any render) so there is no gap
// between the native splash disappearing and the JS startup animation mounting.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Silently ignore – may fail in Expo Go / web previews
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

// ---------------------------------------------------------------------------
// Notification data shape from the backend
// ---------------------------------------------------------------------------
interface NotificationData {
  type?: string;
  conversationId?: string;
  messageId?: string;
  callId?: string;
  callType?: 'AUDIO' | 'VIDEO';
  callerName?: string;
}

/**
 * Extracts a valid conversationId from a notification response.
 * Returns null for malformed payloads or non-new_message types.
 */
function extractConversationId(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  if (!response) return null;
  const data = response.notification.request.content.data as
    | NotificationData
    | undefined
    | null;
  if (
    data?.type === 'new_message' &&
    typeof data.conversationId === 'string' &&
    data.conversationId.length > 0
  ) {
    return data.conversationId;
  }
  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();

  const {
    loadStoredAuth,
    isAuthenticated,
    isLoading: authIsLoading,
    accessToken,
    setUser,
    clearAuth,
  } = useAuthStore();

  const { loadStoredTheme, mode } = useThemeStore();
  const { bindSocketEvents, setConversations } = useChatStore();

  const resolvedScheme =
    mode === 'system' ? systemColorScheme ?? 'light' : mode;

  // Controls whether the JS startup animation overlay is shown.
  // Starts true on cold launch; becomes false once the animation finishes.
  const [showStartup, setShowStartup] = useState(true);

  // Track previous AppState to detect background → foreground transitions
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Notification-tap state ───────────────────────────────────────────────

  /**
   * Holds the conversationId from a notification tap that arrived before
   * authentication was fully resolved. Cleared after successful navigation.
   */
  const pendingConversationIdRef = useRef<string | null>(null);

  /**
   * Tracks the last notification identifier we handled to deduplicate
   * cold-start and warm-start delivery of the same notification tap.
   */
  const lastHandledNotifIdRef = useRef<string | null>(null);

  /**
   * True once /auth/me completes (success or failure). Navigation only
   * happens after this is set so we never route before we know the real
   * auth state.
   */
  const [authValidated, setAuthValidated] = useState(false);

  // Load saved authentication and theme when the app starts
  useEffect(() => {
    loadStoredAuth();
    loadStoredTheme();
  }, []);

  // Handle authentication, socket connection, profile sync,
  // and push notification registration
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      // Connect Socket.IO
      connectSocket();
      bindSocketEvents();
      useCallStore.getState().bindSocketEvents();

      // Validate the stored/current token against the server.
      // On success → update user object.
      // On 401    → API interceptor calls clearAuth(); we also call it here as
      //             a safety net in case the interceptor path was bypassed.
      api
        .get('/auth/me')
        .then((res) => {
          if (res.data?.user) {
            setUser(res.data.user);
          }
        })
        .catch((err) => {
          console.warn('Failed to fetch /auth/me:', err?.message);
          if (err?.response?.status === 401) {
            clearAuth().catch(() => {});
          }
        })
        .finally(() => {
          // Mark auth validation complete so notification navigation can proceed.
          setAuthValidated(true);
        });

      // Register this device for push notifications
      registerForPushNotificationsAsync().catch((err) => {
        console.warn('[Push] Registration error:', err);
      });
    } else if (!authIsLoading) {
      // Definitively not authenticated — no /auth/me needed.
      // Reset authValidated so a subsequent login cycle waits for the new
      // /auth/me round-trip before attempting notification navigation.
      disconnectSocket();
      setAuthValidated(false);
    }
  }, [isAuthenticated, accessToken, authIsLoading]);

  // ── Capture cold-start notification tap ─────────────────────────────────
  // getLastNotificationResponseAsync() returns the tap that launched the app
  // from a terminated state. Read once at mount so the ref is populated
  // before the auth validation effect above completes.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const notifData = response?.notification?.request?.content?.data as NotificationData | undefined;
        if (notifData?.type === 'incoming_call' && notifData.callId) {
          useCallStore.getState().setIncomingCall({
            callId: notifData.callId,
            callType: notifData.callType || 'AUDIO',
            conversationId: notifData.conversationId || '',
            caller: {
              id: '',
              displayName: notifData.callerName || 'Caller',
            },
          });
          return;
        }

        const conversationId = extractConversationId(response);
        if (conversationId && response) {
          const notifId = response.notification.request.identifier;
          if (lastHandledNotifIdRef.current !== notifId) {
            pendingConversationIdRef.current = conversationId;
            lastHandledNotifIdRef.current = notifId;
            console.log(
              '[Push] Cold-start tap captured → conversationId:',
              conversationId,
            );
          }
        }
      })
      .catch((err) => {
        console.warn('[Push] getLastNotificationResponseAsync error:', err);
      });
  }, []);

  // ── Warm-start / foreground notification-tap listener ───────────────────
  // Fires when the user taps a notification while the app is running or
  // returns from the background.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const notifData = response?.notification?.request?.content?.data as NotificationData | undefined;
        if (notifData?.type === 'incoming_call' && notifData.callId) {
          useCallStore.getState().setIncomingCall({
            callId: notifData.callId,
            callType: notifData.callType || 'AUDIO',
            conversationId: notifData.conversationId || '',
            caller: {
              id: '',
              displayName: notifData.callerName || 'Caller',
            },
          });
          return;
        }

        const conversationId = extractConversationId(response);
        if (!conversationId) return;

        const notifId = response.notification.request.identifier;
        if (lastHandledNotifIdRef.current === notifId) {
          // Deduplicate — already captured by the cold-start effect.
          console.log('[Push] Warm tap deduplicated (already handled):', notifId);
          return;
        }
        lastHandledNotifIdRef.current = notifId;
        console.log('[Push] Warm-start tap → conversationId:', conversationId);

        const { isAuthenticated: authed } = useAuthStore.getState();
        if (authed) {
          // Auth already known — navigate immediately.
          try {
            router.push(`/chat/${conversationId}`);
          } catch (e) {
            console.warn('[Push] Warm navigation error:', e);
          }
        } else {
          // Auth still loading — store for deferred consumption.
          pendingConversationIdRef.current = conversationId;
        }
      },
    );
    return () => {
      subscription.remove();
    };
  }, [router]);

  // ── Consume pending notification destination after auth resolves ─────────
  useEffect(() => {
    if (!authValidated) return;
    if (!isAuthenticated) {
      // Unauthenticated — discard the pending destination.
      if (pendingConversationIdRef.current) {
        console.log(
          '[Push] Discarding pending destination — user not authenticated.',
        );
        pendingConversationIdRef.current = null;
      }
      return;
    }
    const conversationId = pendingConversationIdRef.current;
    if (!conversationId) return;
    // Clear before navigating to prevent re-entry.
    pendingConversationIdRef.current = null;
    console.log('[Push] Navigating to pending conversation:', conversationId);
    // Tiny delay ensures the navigator is mounted before push navigation.
    const timer = setTimeout(() => {
      try {
        router.push(`/chat/${conversationId}`);
      } catch (e) {
        console.warn('[Push] Cold-start navigation error:', e);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [authValidated, isAuthenticated, router]);

  // Re-fetch conversations and re-bind socket events when:
  //  1. App comes back to the foreground (background → active)
  //  2. Socket reconnects after being suspended by Android/iOS
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshData = () => {
      console.log('[AppState] Refreshing conversations after resume...');
      api
        .get('/conversations')
        .then((res) => setConversations(res.data))
        .catch((err) => console.warn('[AppState] Failed to refresh conversations:', err?.message));

      // Re-bind socket event listeners in case the socket was recreated
      bindSocketEvents();
      useCallStore.getState().bindSocketEvents();
    };

    // AppState listener: fires when app returns from background
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (prev === 'background' || prev === 'inactive') &&
        nextState === 'active'
      ) {
        console.log('[AppState] App resumed from background — refreshing data');
        refreshData();
      }
    });

    // Socket reconnect listener: fires when Socket.IO successfully reconnects
    const unsubReconnect = onSocketReconnect(() => {
      console.log('[Socket] Reconnected — re-binding events and refreshing conversations');
      refreshData();
    });

    return () => {
      subscription.remove();
      unsubReconnect();
    };
  }, [isAuthenticated, bindSocketEvents, setConversations]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* Only show StatusBar when the startup screen is gone to avoid flash */}
          {!showStartup && (
            <StatusBar
              style={
                resolvedScheme === 'dark'
                  ? 'light'
                  : 'dark'
              }
            />
          )}

          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(auth)" />

            <Stack.Screen name="(tabs)" />

            <Stack.Screen
              name="chat/[id]"
              options={{
                presentation: 'card',
              }}
            />

            <Stack.Screen
              name="chat/gallery"
              options={{
                presentation: 'card',
              }}
            />

            <Stack.Screen
              name="group/create"
              options={{
                presentation: 'modal',
              }}
            />

            <Stack.Screen
              name="profile/[id]"
              options={{
                presentation: 'card',
              }}
            />

            <Stack.Screen
              name="call/[id]"
              options={{
                presentation: 'fullScreenModal',
                headerShown: false,
                animation: 'fade',
              }}
            />
          </Stack>

          {/* Incoming Call Global Overlay */}
          <IncomingCallModal />

          {/*
           * Startup animation overlay — rendered above the Stack so it never
           * interferes with routing/navigation. Unmounts itself once done.
           *
           * isReady: auth loading is the only gate; we do NOT wait for
           * Socket.IO, conversations, notifications, or any API call.
           */}
          {showStartup && (
            <StartupScreen
              resolvedScheme={resolvedScheme === 'dark' ? 'dark' : 'light'}
              isReady={!authIsLoading}
              onFinish={() => setShowStartup(false)}
            />
          )}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}