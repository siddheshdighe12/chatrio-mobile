import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

interface StartupScreenProps {
  resolvedScheme?: 'light' | 'dark';
  isReady?: boolean;
  onFinish?: () => void;
}

export function StartupScreen({
  resolvedScheme = 'dark',
  isReady = true,
  onFinish,
}: StartupScreenProps) {
  const isDark = resolvedScheme !== 'light';
  const bgColor = isDark ? '#0F0F14' : '#FFFFFF';
  const indicatorColor = '#6366F1'; // Brand Indigo

  // Animation values
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.95)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const exitCalledRef = useRef(false);

  useEffect(() => {
    // Hide the native splash screen as soon as React Native mounts this component
    SplashScreen.hideAsync().catch(() => {
      // Native splash might already be hidden or running in web/dev preview
    });

    // Entrance animation: Logo fade-in + slight scale up from 0.95 to 1.0
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1.0,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Indicator fades in subtly shortly after logo
      Animated.timing(indicatorOpacity, {
        toValue: 1,
        duration: 350,
        delay: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Subtle, gentle pulse/breathing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.025,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    });

    // Ensure a minimum visual animation duration (~750ms) within 600-1200ms target
    const minTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 750);

    // Safety fallback: Never keep the startup screen stuck longer than 2.5s
    const fallbackTimer = setTimeout(() => {
      triggerExit();
    }, 2500);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const triggerExit = () => {
    if (exitCalledRef.current) return;
    exitCalledRef.current = true;
    setIsExiting(true);

    // Smooth exit fade out transition
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 250,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onFinish?.();
    });
  };

  // Trigger exit when both minimum visual duration has elapsed and auth/app is ready
  useEffect(() => {
    if (minTimeElapsed && isReady) {
      triggerExit();
    }
  }, [minTimeElapsed, isReady]);

  return (
    <Animated.View
      pointerEvents={isExiting ? 'none' : 'auto'}
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          opacity: containerOpacity,
        },
      ]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} translucent />

      <View style={styles.centerContent}>
        {/* Animated Chatrio Logo */}
        <Animated.Image
          source={require('../assets/chatrio-logo.png')}
          style={[
            styles.logo,
            {
              opacity: logoOpacity,
              transform: [
                { scale: logoScale },
                { scale: pulseScale },
              ],
            },
          ]}
          resizeMode="contain"
          accessibilityLabel="Chatrio"
        />

        {/* Subtle Brand Loading Indicator */}
        <Animated.View
          style={[
            styles.indicatorWrapper,
            {
              opacity: indicatorOpacity,
            },
          ]}
        >
          <ActivityIndicator
            size="small"
            color={indicatorColor}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 99999, // Ensure it stays on top on Android
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 104,
    height: 104,
    borderRadius: 22,
  },
  indicatorWrapper: {
    marginTop: 28,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
