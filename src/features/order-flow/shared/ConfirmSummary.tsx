import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface ConfirmItem { title: string; detail?: string; amount?: string }
export interface ConfirmLine { label: string; value: string }

/** Read-back card shown before a submit so the technician reviews every line, not just a count or total. */
export function ConfirmSummary({ testID, title, intro, items, lines, total }: {
  testID: string;
  title: string;
  intro?: string;
  items: ConfirmItem[];
  lines?: ConfirmLine[];
  total?: ConfirmLine;
}) {
  return (
    <View style={styles.box} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {intro ? <Text style={styles.text}>{intro}</Text> : null}
      {items.map((item, index) => (
        <View key={index} style={styles.item}>
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>{index + 1}. {item.title}</Text>
            {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
          </View>
          {item.amount ? <Text style={styles.amount}>{item.amount}</Text> : null}
        </View>
      ))}
      {(lines ?? []).map(line => (
        <View key={line.label} style={styles.line}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          <Text style={styles.lineValue}>{line.value}</Text>
        </View>
      ))}
      {total ? (
        <View style={[styles.line, styles.totalLine]}>
          <Text style={styles.totalLabel}>{total.label}</Text>
          <Text style={styles.totalValue}>{total.value}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.primarySoft, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: spacing.md, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.primaryStrong },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  item: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemDetail: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  amount: { fontSize: 14, fontWeight: '600', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  lineValue: { flexShrink: 1, fontSize: 14, color: colors.text, fontWeight: '600', textAlign: 'right' },
  totalLine: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  totalLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.primaryStrong },
});
