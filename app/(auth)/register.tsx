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

export default function RegisterScreen() {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DarkColors : LightColors;
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRegister = async () => {
    if (
      !displayName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !password
    ) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.post('/auth/register', {
        displayName: displayName.trim(),
        username: username.trim(),
        email: email.trim(),
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
        'Registration failed.';

      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: C.background }]}
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
            Create Account
          </Text>

          <Text style={[styles.tagline, { color: C.textSecondary }]}>
            Join Chatrio and connect with anyone
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
            <Text style={[styles.errorText, { color: C.error }]}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.form}>
          {/* Display Name */}
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
              style={[styles.input, { color: C.inputText }]}
              placeholder="Display Name (e.g. Alex Smith)"
              placeholderTextColor={C.inputPlaceholder}
              value={displayName}
              onChangeText={setDisplayName}
              returnKeyType="next"
            />
          </View>

          {/* Username */}
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
              style={[styles.input, { color: C.inputText }]}
              placeholder="Username (e.g. alexsmith)"
              placeholderTextColor={C.inputPlaceholder}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Email */}
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
              style={[styles.input, { color: C.inputText }]}
              placeholder="Email address"
              placeholderTextColor={C.inputPlaceholder}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
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
              style={[styles.input, { color: C.inputText }]}
              placeholder="Password (min. 6 characters)"
              placeholderTextColor={C.inputPlaceholder}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleRegister}
              returnKeyType="done"
            />
          </View>

          {/* Create Account */}
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: C.primary,
                opacity: isLoading ? 0.7 : 1,
              },
            ]}
            activeOpacity={0.85}
            onPress={handleRegister}
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
                Create Account
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
            Already have an account?{' '}
          </Text>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={[styles.link, { color: C.primary }]}>
                Sign in
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
    fontSize: FontSize['2xl'],
    fontWeight: '800',
    letterSpacing: -0.5,
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
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },

  input: {
    paddingVertical: Spacing.md,
    fontSize: FontSize.base,
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