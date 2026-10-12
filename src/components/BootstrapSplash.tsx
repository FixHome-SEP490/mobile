import React, { useEffect, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

/** Visible only while preference/session bootstrap is actually pending. */
export default function BootstrapSplash() {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.65, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => { animation.stop(); pulse.setValue(1); };
  }, [pulse, reduceMotion]);
  return <View style={[styles.container, { backgroundColor: colors.background }]} accessibilityLabel="FixHome đang khởi động" accessibilityRole="progressbar">
    <Animated.View style={{ opacity: pulse, alignItems: 'center', gap: 16 }}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} accessible={false} />
      <Text style={[styles.name, { color: colors.primaryStrong }]}>FixHome</Text>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', alignItems: 'center' }, logo: { width: 88, height: 88, borderRadius: 20 }, name: { fontSize: 32, fontWeight: '700' } });
