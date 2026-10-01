import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { LightColors, DarkColors } from '../../constants/Colors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

export default function LoginScreen() {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DarkColors : LightColors;
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setErrorMessage(
        'Please enter your email/username and password'
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.post('/auth/login', {
        identifier: identifier.trim(),
        password,
      });

      const { user, accessToken, refreshToken } = response.data;

      await SecureStore.setItemAsync(
        'chatrio_refresh_token',
        refreshToken
      );

      setAuth(user, accessToken);
      router.replace('/(tabs)/chats');
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        'Login failed. Please check credentials.';

      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,
        {
          backgroundColor: C.background,
        },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={
          Platform.OS === 'ios' ? 'interactive' : 'on-drag'
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Image
            source={require('../../assets/chatrio-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Chatrio Logo"
          />

          <Text style={[styles.appName, { color: C.textPrimary }]}>
            Chatrio
          </Text>

          <Text
            style={[
              styles.tagline,
              { color: C.textSecondary },
            ]}
          >
            Real-time messaging, reimagined
          </Text>
        </View>

        {errorMessage && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: C.error + '18',
                borderColor: C.error,
              },
            ]}
          >
            <Text
              style={[
                styles.errorText,
                { color: C.error },
              ]}
            >
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.form}>
          {/* Email / Username */}
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: C.inputBackground,
                borderColor: C.inputBorder,
              },
            ]}
          >
            <TextInput
              style={[
                styles.input,
                { color: C.inputText },
              ]}
              placeholder="Email or username"
              placeholderTextColor={C.inputPlaceholder}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: C.inputBackground,
                borderColor: C.inputBorder,
              },
            ]}
          >
            <TextInput
              style={[
                styles.input,
                {
                  color: C.inputText,
                  flex: 1,
                },
              ]}
              placeholder="Password"
              placeholderTextColor={C.inputPlaceholder}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
              returnKeyType="done"
            />

            <TouchableOpacity
              onPress={() =>
                setShowPassword(!showPassword)
              }
              style={styles.eyeBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.eyeText}>
                {showPassword ? '👁️' : '🔒'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sign In */}
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: C.primary,
                opacity: isLoading ? 0.7 : 1,
              },
            ]}
            activeOpacity={0.85}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={C.primaryText} />
            ) : (
              <Text
                style={[
                  styles.buttonText,
                  { color: C.primaryText },
                ]}
              >
                Sign In
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text
            style={[
              styles.footerText,
              { color: C.textSecondary },
            ]}
          >
            Don't have an account?{' '}
          </Text>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity>
              <Text
                style={[
                  styles.link,
                  { color: C.primary },
                ]}
              >
                Sign up
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['3xl'],
  },

  brand: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },

  logo: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },

  appName: {
    fontSize: FontSize['3xl'],
    fontWeight: '800',
    letterSpacing: -0.6,
  },

  tagline: {
    fontSize: FontSize.base,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },

  errorBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },

  errorText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
  },

  form: {
    gap: Spacing.md,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },

  input: {
    paddingVertical: Spacing.md,
    fontSize: FontSize.base,
    flex: 1,
  },

  eyeBtn: {
    padding: Spacing.xs,
  },

  eyeText: {
    fontSize: 16,
  },

  button: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
    shadowColor: '#6366f1',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },

  buttonText: {
    fontSize: FontSize.base,
    fontWeight: '700',
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing['2xl'],
  },

  footerText: {
    fontSize: FontSize.sm,
  },

  link: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});