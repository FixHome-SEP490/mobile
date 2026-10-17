import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Height of the floating pill in `GlassTabBar` and `CustomerAnimatedBottomBar` (both are absolute at the bottom). */
export const TAB_BAR_HEIGHT = 64;

/** Bottom padding that lets the last row of a tab screen scroll clear of the tab bar. */
export function useTabBarClearance(gap = 16): number {
  const { bottom } = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(bottom, 16) + gap;
}
