/**
 * Vello Design System — Colors
 *
 * Two complete palettes: light and dark.
 * Dark mode is intentionally designed, NOT an inversion.
 */

export const Palette = {
  // Brand
  indigo50: '#EEF2FF',
  indigo100: '#E0E7FF',
  indigo200: '#C7D2FE',
  indigo300: '#A5B4FC',
  indigo400: '#818CF8',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',
  indigo800: '#3730A3',
  indigo900: '#312E81',

  // Neutrals
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray850: '#18202F',
  gray900: '#111827',
  gray950: '#0D1117',

  // Semantic
  green400: '#4ADE80',
  green500: '#22C55E',
  red400: '#F87171',
  red500: '#EF4444',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  blue400: '#60A5FA',
  blue500: '#3B82F6',
};

export type ColorScheme = typeof LightColors;

export const LightColors = {
  // Backgrounds
  background: Palette.white,
  backgroundSecondary: Palette.gray50,
  backgroundTertiary: Palette.gray100,
  surface: Palette.white,
  surfaceSecondary: Palette.gray50,
  overlay: 'rgba(0,0,0,0.5)',

  // Text
  textPrimary: Palette.gray900,
  textSecondary: Palette.gray500,
  textTertiary: Palette.gray400,
  textInverse: Palette.white,
  textDisabled: Palette.gray300,

  // Brand / Actions
  primary: Palette.indigo500,
  primaryLight: Palette.indigo100,
  primaryDark: Palette.indigo700,
  primaryText: Palette.white,

  // Borders & Dividers
  border: Palette.gray200,
  borderStrong: Palette.gray300,
  divider: Palette.gray100,

  // Message bubbles
  bubbleOut: Palette.indigo500,    // outgoing
  bubbleOutText: Palette.white,
  bubbleIn: Palette.gray100,       // incoming
  bubbleInText: Palette.gray900,

  // Status
  online: Palette.green500,
  offline: Palette.gray400,
  error: Palette.red500,
  warning: Palette.amber500,
  success: Palette.green500,
  info: Palette.blue500,

  // Unread badge
  badge: Palette.indigo500,
  badgeText: Palette.white,

  // Input
  inputBackground: Palette.gray100,
  inputBorder: Palette.gray200,
  inputText: Palette.gray900,
  inputPlaceholder: Palette.gray400,

  // Navigation
  tabBar: Palette.white,
  tabBarBorder: Palette.gray200,
  tabIconActive: Palette.indigo500,
  tabIconInactive: Palette.gray400,

  // Header
  header: Palette.white,
  headerBorder: Palette.gray200,
  headerText: Palette.gray900,

  // Misc
  shimmer: Palette.gray200,
  shimmerHighlight: Palette.gray100,
  shadow: 'rgba(0,0,0,0.08)',
};

export const DarkColors: ColorScheme = {
  // Backgrounds — layered dark surfaces, not pure black
  background: '#0F0F14',
  backgroundSecondary: '#16161D',
  backgroundTertiary: '#1C1C26',
  surface: '#16161D',
  surfaceSecondary: '#1C1C26',
  overlay: 'rgba(0,0,0,0.7)',

  // Text
  textPrimary: '#F0F0F5',
  textSecondary: '#8B8B9E',
  textTertiary: '#5A5A72',
  textInverse: Palette.gray900,
  textDisabled: '#3A3A50',

  // Brand / Actions
  primary: Palette.indigo400,
  primaryLight: '#2A2A45',
  primaryDark: Palette.indigo300,
  primaryText: Palette.white,

  // Borders & Dividers
  border: '#2A2A3A',
  borderStrong: '#3A3A50',
  divider: '#1E1E2A',

  // Message bubbles
  bubbleOut: Palette.indigo600,
  bubbleOutText: Palette.white,
  bubbleIn: '#252535',
  bubbleInText: '#F0F0F5',

  // Status
  online: Palette.green400,
  offline: '#5A5A72',
  error: Palette.red400,
  warning: Palette.amber400,
  success: Palette.green400,
  info: Palette.blue400,

  // Unread badge
  badge: Palette.indigo500,
  badgeText: Palette.white,

  // Input
  inputBackground: '#1C1C26',
  inputBorder: '#2A2A3A',
  inputText: '#F0F0F5',
  inputPlaceholder: '#5A5A72',

  // Navigation
  tabBar: '#16161D',
  tabBarBorder: '#2A2A3A',
  tabIconActive: Palette.indigo400,
  tabIconInactive: '#5A5A72',

  // Header
  header: '#16161D',
  headerBorder: '#2A2A3A',
  headerText: '#F0F0F5',

  // Misc
  shimmer: '#2A2A3A',
  shimmerHighlight: '#333348',
  shadow: 'rgba(0,0,0,0.3)',
};
