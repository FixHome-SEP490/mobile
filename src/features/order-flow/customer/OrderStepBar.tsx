import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_STEPS, type ActivityStep } from './customer-activity-stage';
import { useAppTheme } from '../../../constants/theme';

/** The five steps of a repair with the current one marked; shared by the order frame and the multi-device visit page. */
export default function OrderStepBar({ step }: { step: ActivityStep }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    wrap: { paddingBottom: 8 },
    track: { flexDirection: 'row', gap: 4 },
    segment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.border },
    segmentActive: { backgroundColor: colors.primaryStrong },
    labels: { flexDirection: 'row', marginTop: 6, gap: 4 },
    label: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 14, textAlign: 'center' },
    labelCurrent: { color: colors.primaryStrong, fontWeight: '700' },
  }), [colors]);
  return <View accessibilityLabel={`Tiến độ bước ${step} trên 5: ${ACTIVITY_STEPS[step - 1]}`} style={styles.wrap}>
    <View style={styles.track}>{ACTIVITY_STEPS.map((label, index) =>
      <View key={label} style={[styles.segment, index < step && styles.segmentActive]} />)}</View>
    <View style={styles.labels}>{ACTIVITY_STEPS.map((label, index) =>
      <Text key={label} numberOfLines={2} style={[styles.label, step === index + 1 && styles.labelCurrent]}>{label}</Text>)}</View>
  </View>;
}
