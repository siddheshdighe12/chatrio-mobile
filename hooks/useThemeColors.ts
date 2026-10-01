import { useColorScheme } from 'react-native';
import { useThemeStore } from '../store/themeStore';
import { LightColors, DarkColors, ColorScheme } from '../constants/Colors';

export function useThemeColors(): ColorScheme {
  const systemScheme = useColorScheme();
  const { mode } = useThemeStore();

  const resolved = mode === 'system' ? (systemScheme ?? 'light') : mode;
  return resolved === 'dark' ? DarkColors : LightColors;
}
