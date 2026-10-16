import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useUIStore } from '../store/ui.store';

export const useScrollHideTabBar = () => {
  const setTabBarVisible = useUIStore((state) => state.setTabBarVisible);
  const lastScrollY = useRef(0);

  // The flag is global: leaving a screen that hid the bar (another tab, a pushed screen)
  // must bring it back, or the next screen starts with no tab bar until a reload.
  useFocusEffect(useCallback(() => () => {
    lastScrollY.current = 0;
    setTabBarVisible(true);
  }, [setTabBarVisible]));

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    
    if (currentScrollY > lastScrollY.current + 10 && currentScrollY > 50) {
      setTabBarVisible(false);
    } else if (currentScrollY < lastScrollY.current - 10 || currentScrollY <= 50) {
      setTabBarVisible(true);
    }
    
    lastScrollY.current = currentScrollY;
  };

  return handleScroll;
};
