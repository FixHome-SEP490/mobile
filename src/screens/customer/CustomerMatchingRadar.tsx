import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useAppTheme } from '../../constants/theme';

/**
 * Purely decorative pulse for a server-confirmed MATCHING state.
 * No technician position, proximity, ETA or percentage is calculated here.
 */
export default function CustomerMatchingRadar({ active }: { active: boolean }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion(true);
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 0;
    if (active && !reduceMotion) {
      pulse.value = withRepeat(withTiming(1, { duration: 1900 }), -1, false);
    }
    return () => cancelAnimation(pulse);
  }, [active, pulse, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: active && !reduceMotion ? 0.52 - 0.42 * pulse.value : 0,
    transform: [{ scale: 1 + 0.2 * pulse.value }],
  }), [active, reduceMotion]);

  return (
    <View
      testID="matching-state-radar"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { backgroundColor: colors.primarySoft }]}
    >
      {active && !reduceMotion && (
        <Animated.View
          testID="matching-radar-pulse"
          pointerEvents="none"
          style={[styles.pulse, { borderColor: colors.primary }, pulseStyle]}
        />
      )}
      <View style={[styles.outerRing, { borderColor: colors.border }]}>
        <View style={[styles.center, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
          <Ionicons name="build-outline" size={27} color={colors.primaryStrong} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 104, height: 104, borderRadius: 52,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
  },
  pulse: {
    position: 'absolute', left: 6, top: 6,
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 2,
  },
  outerRing: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  center: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
});
