import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether the OS "Reduce Motion" accessibility setting is on. */
export function useReduceMotion(initialFallback = false) {
  const [reduceMotion, setReduceMotion] = useState(initialFallback);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
