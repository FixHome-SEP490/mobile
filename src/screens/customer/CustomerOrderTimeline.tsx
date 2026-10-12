import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';
import { vnDateTimeString } from '../../utils/vn-time';
import type { OrderDetailSection, OrderMilestone } from './customer-order-timeline';

export default function CustomerOrderTimeline({ steps, onOpenSection, actionLabel, actionTitle, onAction }: {
  steps: OrderMilestone[];
  onOpenSection: (section: OrderDetailSection) => void;
  actionLabel: string | null;
  actionTitle?: string;
  onAction: () => void;
}) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  return <View style={styles.list}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Tiến độ</Text>
    {steps.map((step, index) => <View key={step.key} style={styles.row}>
      <View style={styles.track}>
        <View style={[styles.circle, { borderColor: step.state === 'upcoming' ? colors.border : colors.primaryStrong, backgroundColor: step.state === 'upcoming' ? colors.surface : colors.primaryStrong }]}>
          <Text style={{ color: step.state === 'upcoming' ? colors.textSecondary : colors.surface }}>{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}</Text>
        </View>
        {index < steps.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
      </View>
      <View style={styles.copy}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Tiến độ: ${step.label}`} accessibilityState={{ expanded: expanded === step.key }}
          style={styles.stepButton} onPress={() => { setExpanded(expanded === step.key ? null : step.key); onOpenSection(step.section); }}>
          <Text style={[styles.title, { color: step.state === 'current' ? colors.primaryStrong : colors.text }]}>{step.key === 'action' ? actionTitle ?? step.label : step.label}</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>{step.state === 'done' ? 'Đã ghi nhận' : step.state === 'current' ? 'Hiện tại' : 'Sắp tới'}</Text>
          {!!step.timestamp && <Text style={[styles.caption, { color: colors.textSecondary }]}>{vnDateTimeString(step.timestamp)}</Text>}
        </TouchableOpacity>
        {expanded === step.key && <Text style={[styles.detail, { color: colors.textSecondary }]}>{step.detail}</Text>}
        {step.key === 'action' && !!actionLabel && <TouchableOpacity testID="order-detail-primary-next-action" accessibilityRole="button" accessibilityLabel={actionLabel} style={[styles.action, { backgroundColor: colors.primaryStrong }]} onPress={onAction}><Text style={[styles.title, { color: colors.surface }]}>{actionLabel}</Text></TouchableOpacity>}
      </View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  list: { gap: 8 }, heading: { fontSize: 20, lineHeight: 28, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 }, track: { width: 28, alignItems: 'center' },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  line: { width: 1, flex: 1, minHeight: 16, marginTop: 4 }, copy: { flex: 1, minWidth: 0, paddingBottom: 12, gap: 8 },
  stepButton: { minHeight: 44, justifyContent: 'center', gap: 4, paddingVertical: 8 },
  title: { fontSize: 15, lineHeight: 22, fontWeight: '600' }, caption: { fontSize: 12, lineHeight: 18 },
  detail: { fontSize: 14, lineHeight: 20 }, action: { minHeight: 48, borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center' },
});
