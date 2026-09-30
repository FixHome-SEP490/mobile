// src/constants/theme.ts
import { useUIStore } from '../store/ui.store';

// Base Web Palettes
const brand = {
  50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD',
  400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8',
  800: '#1E40AF', 900: '#1E3A8A',
};

const ink = {
  25: '#FCFBF9', 50: '#FFFFFF', 100: '#EFECE7', 200: '#F2F2F2',
  300: '#CBC4BA', 400: '#A69D91', 500: '#7D7468', 600: '#5C554C',
  700: '#443E37', 800: '#2B2722', 900: '#1A1714',
};

const semantic = {
  error: '#DC2626', // matches the red already hardcoded across most screens
  success: '#059669', // matches the green already hardcoded across most screens
  warning: '#D97706',
  info: '#175CD3', // info-600
};

// Status/tone palette, DS §5.3. `bg` = badge fill, `fg` = icon/dot, `text` = badge label
// (darker than `fg` so small text clears 4.5:1). Dark values are new, measured separately.
export type Tone = { bg: string; fg: string; text: string };
export type ToneName = 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'repair' | 'neutral';

const lightTones: Record<ToneName, Tone> = {
  success: { bg: '#E7F6F0', fg: '#0E8A5F', text: '#08734F' },
  warning: { bg: '#FEF6E0', fg: '#B07D00', text: '#805B00' },
  danger: { bg: '#FEECEB', fg: '#D92D20', text: '#B42318' },
  info: { bg: '#EAF1FE', fg: '#175CD3', text: '#175CD3' },
  violet: { bg: '#F3EEFE', fg: '#6335D9', text: '#6335D9' },
  repair: { bg: '#EFF6FF', fg: '#2563EB', text: '#1D4ED8' },
  neutral: { bg: '#EFECE7', fg: '#7D7468', text: '#5C554C' },
};

const darkTones: Record<ToneName, Tone> = {
  success: { bg: '#0F2E24', fg: '#34D399', text: '#6EE7B7' },
  warning: { bg: '#33280A', fg: '#FBBF24', text: '#FCD34D' },
  danger: { bg: '#3B1512', fg: '#F87171', text: '#FCA5A5' },
  info: { bg: '#13294B', fg: '#60A5FA', text: '#93C5FD' },
  violet: { bg: '#251A47', fg: '#A78BFA', text: '#C4B5FD' },
  repair: { bg: '#1E3A5F', fg: '#60A5FA', text: '#93C5FD' },
  neutral: { bg: '#334155', fg: '#94A3B8', text: '#CBD5E1' },
};

// Neutrals aligned to the slate palette most screens already hardcode
// (not the unused warm `ink` scale below), so referencing these tokens
// is a no-visual-change swap for the majority of existing screens.
export const lightTheme = {
  primary: brand[500],
  primaryDark: brand[700],
  primaryStrong: brand[600], // the darker blue most screens hardcode as '#2563EB'
  primarySoft: brand[50], // pill/badge backgrounds tinted with primary
  primaryTint: brand[100], // avatar/icon-circle backgrounds tinted with primary
  secondary: ink[600],
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  muted: '#94A3B8', // placeholders, disabled text, inactive icons
  border: '#E2E8F0',
  divider: '#F1F5F9', // hairline separators, lighter than border
  tone: lightTones,
  ...semantic,
};

// Dark theme matches structure but inverted (simplified inversion for now)
export const darkTheme = {
  primary: brand[500],
  primaryDark: brand[400],
  primaryStrong: brand[300],
  primarySoft: '#1E3A5F',
  primaryTint: '#1E3A5F',
  secondary: ink[400],
  background: '#0F172A',
  surface: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  muted: '#64748B',
  border: '#334155',
  divider: '#334155',
  tone: darkTones,
  ...semantic,
};

export type ThemeColors = typeof lightTheme;


export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const useAppTheme = () => {
  const themeMode = useUIStore((state) => state.themeMode);
  const isDark = themeMode === 'dark';
  
  return {
    colors: isDark ? darkTheme : lightTheme,
    spacing,
    fontSize,
    isDark,
  };
};
