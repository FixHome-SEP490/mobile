import { StatusBar } from 'react-native';

/** Pushes Home's light status bar icons and returns the undo, for useFocusEffect: they apply only while Home is in front. */
export function homeStatusBar(): () => void {
  const entry = StatusBar.pushStackEntry({ barStyle: 'light-content' });
  return () => StatusBar.popStackEntry(entry);
}
