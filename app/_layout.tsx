import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { AppState, AppStateStatus, useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useChatStore } from '../store/chatStore';
import { connectSocket, disconnectSocket, onSocketReconnect } from '../lib/socket';
import { api } from '../lib/api';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { StartupScreen } from '../components/StartupScreen';

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

export default function RootLayout() {
  const systemColorScheme = useColorScheme();

  const {
    loadStoredAuth,
    isAuthenticated,
    isLoading: authIsLoading,
    accessToken,
    setAuth,
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

      // Fetch fresh profile
      api
        .get('/auth/me')
        .then((res) => {
          if (res.data?.user) {
            setAuth(res.data.user, accessToken);
          }
        })
        .catch((err) => {
          console.warn(
            'Failed to fetch /auth/me:',
            err?.message
          );
        });

      // Register this device for push notifications
      registerForPushNotificationsAsync().catch((err) => {
        console.warn(
          '[Push] Registration error:',
          err
        );
      });
    } else {
      // Disconnect realtime socket when logged out
      disconnectSocket();
    }
  }, [isAuthenticated, accessToken]);

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
          </Stack>

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