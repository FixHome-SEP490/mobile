import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/** Three dots that bounce out of phase, the usual "is typing" tell. */
export default function TypingDots() {
  // useMemo, not useRef: these values are read while rendering the dots.
  const dots = useMemo(
    () => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)],
    [],
  );

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, {
            toValue: -5,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((2 - index) * 140),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.bubble}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[styles.dot, { transform: [{ translateY: dot }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 4,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
    marginHorizontal: 3,
  },
});
