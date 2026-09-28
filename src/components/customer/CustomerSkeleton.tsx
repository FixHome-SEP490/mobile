import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../../constants/theme';
import {
  CUSTOMER_SKELETON_ROWS,
  SKELETON_DURATION_MS,
  SKELETON_MAX_OPACITY,
  SKELETON_MIN_OPACITY,
} from '../../constants/motion';

export type CustomerSkeletonVariant = 'service' | 'notification';

type CustomerSkeletonProps = {
  variant: CustomerSkeletonVariant;
  rows?: number;
};

const MIN_ROWS = 3;
const MAX_ROWS = 4;

function resolveRowCount(rows?: number): number {
  if (!Number.isFinite(rows as number)) return CUSTOMER_SKELETON_ROWS;
  const count = Math.floor(rows as number);
  if (count < MIN_ROWS) return MIN_ROWS;
  if (count > MAX_ROWS) return MAX_ROWS;
  return count;
}

/**
 * Decorative loading skeleton for Customer lists (packet D1 foundation).
 * Non-interactive and hidden from assistive technology. The endless pulse
 * uses `ReduceMotion.System` so it does not continue when the OS Reduce
 * Motion setting is enabled, and the animation is cancelled on unmount.
 */
export default function CustomerSkeleton({ variant, rows }: CustomerSkeletonProps) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const progress = useSharedValue(0);
  const rowCount = resolveRowCount(rows);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SKELETON_DURATION_MS / 2 }),
      -1,
      true,
      undefined,
      ReduceMotion.System,
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [progress]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: SKELETON_MIN_OPACITY + (SKELETON_MAX_OPACITY - SKELETON_MIN_OPACITY) * progress.value,
  }));

  return (
    <View
      style={styles.list}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {Array.from({ length: rowCount }, (_, index) => (
        <View
          key={`${variant}-${index}`}
          style={styles.card}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View style={[styles.icon, pulseStyle]} accessible={false} />
          <View style={styles.body} accessible={false}>
            {variant === 'service' ? (
              <>
                <Animated.View style={[styles.lineLong, pulseStyle]} accessible={false} />
                <Animated.View style={[styles.lineShort, pulseStyle]} accessible={false} />
              </>
            ) : (
              <>
                <View style={styles.topRow} accessible={false}>
                  <Animated.View style={[styles.title, pulseStyle]} accessible={false} />
                  <Animated.View style={[styles.time, pulseStyle]} accessible={false} />
                </View>
                <Animated.View style={[styles.lineLong, pulseStyle]} accessible={false} />
                <Animated.View style={[styles.lineMedium, pulseStyle]} accessible={false} />
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    list: {
      padding: 16,
      gap: 12,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 16,
    },
    icon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      marginRight: 12,
      backgroundColor: colors.border,
    },
    body: {
      flex: 1,
      gap: 8,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      flex: 1,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.border,
    },
    time: {
      width: 40,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.border,
    },
    lineLong: {
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.border,
    },
    lineMedium: {
      width: '70%',
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.border,
    },
    lineShort: {
      width: '45%',
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.border,
    },
  });
