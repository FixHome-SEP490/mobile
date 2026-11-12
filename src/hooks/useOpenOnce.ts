// src/hooks/useOpenOnce.ts
import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Runs a screen-opening action once per visit of the current screen.
 *
 * `navigation.push` always adds a screen, so a fast double tap on a button that
 * pushes opened the next screen twice and Back then landed on the duplicate.
 * The first tap locks the guard; coming back to this screen unlocks it.
 */
export function useOpenOnce(): (open: () => void) => void {
  const opened = useRef(false);
  useFocusEffect(useCallback(() => {
    opened.current = false;
  }, []));
  return useCallback((open: () => void) => {
    if (opened.current) return;
    opened.current = true;
    open();
  }, []);
}
