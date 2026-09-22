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
  error: '#D92D20', // danger-600
  success: '#0E8A5F', // success-600
  warning: '#B07D00', // warning-600
  info: '#175CD3', // info-600
};

export const lightTheme = {
  primary: brand[500],
  primaryDark: brand[700],
  secondary: ink[600],
  background: ink[50],
  surface: '#FFFFFF',
  text: ink[900],
  textSecondary: ink[600],
  border: ink[200],
  ...semantic,
};

// Dark theme matches structure but inverted (simplified inversion for now)
export const darkTheme = {
  primary: brand[500],
  primaryDark: brand[400],
  secondary: ink[400],
  background: ink[900],
  surface: ink[800],
  text: ink[50],
  textSecondary: ink[300],
  border: ink[700],
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
