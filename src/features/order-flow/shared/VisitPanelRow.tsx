import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** A row of the "devices in the visit" panels, in the same look as the order hub rows: icon tile, label, optional sub line and badge, chevron. */
export function PanelRow({ Icon, label, sub, subTestID, value, badge, selected, danger, disabled, readOnly, chevron, toggle, expanded, onPress, testID, accessibilityLabel }: {
  Icon: LucideIcon; label: string; sub?: string; subTestID?: string; value?: string; badge?: string; selected?: boolean; danger?: boolean; disabled?: boolean; readOnly?: boolean;
  chevron?: boolean; toggle?: LucideIcon; expanded?: boolean; onPress?: () => void; testID: string; accessibilityLabel?: string;
}) {
  const tone = danger ? colors.tone.danger : colors.tone.neutral;
  const Trailing = toggle ?? (chevron ? ChevronRight : null);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected, ...(expanded !== undefined ? { expanded } : {}) }}
      disabled={disabled || readOnly}
      onPress={onPress}
      style={({ pressed }) => [styles.panelRow, selected && styles.rowSelected, pressed && !readOnly && styles.pressed, disabled && !selected && !readOnly && styles.disabledRow]}
    >
      <View style={[styles.tile, { backgroundColor: danger ? tone.bg : colors.primarySoft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon size={20} strokeWidth={1.75} color={danger ? tone.fg : colors.primaryStrong} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.tone.danger.text }]} numberOfLines={2}>{label}</Text>
        {sub ? <Text style={styles.rowSub} testID={subTestID}>{sub}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {badge ? <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}><Text style={[styles.badgeText, { color: colors.primaryStrong }]}>{badge}</Text></View> : null}
      {Trailing ? <Trailing size={20} strokeWidth={1.75} color={colors.muted} /> : null}
    </Pressable>
  );
}

/** Card, divider and note styles shared by the panels. */
export const visitPanelStyles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});

const styles = StyleSheet.create({
  panelRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 8 },
  rowSelected: { backgroundColor: colors.primarySoft },
  rowLabel: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  rowValue: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  rowSub: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  pressed: { backgroundColor: colors.divider },
  disabledRow: { opacity: 0.5 },
  tile: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
