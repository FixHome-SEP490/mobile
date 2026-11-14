import { StatusBar } from 'react-native';

/**
 * Pushes Home's light status bar icons and returns the undo, for useFocusEffect: they apply only while Home is in front.
 * react-native-web has no status bar stack (pushStackEntry is undefined there), so the web build is a no-op.
 */
export function homeStatusBar(): () => void {
  if (typeof StatusBar.pushStackEntry !== 'function') return () => undefined;
  const entry = StatusBar.pushStackEntry({ barStyle: 'light-content' });
  return () => StatusBar.popStackEntry?.(entry);
}
