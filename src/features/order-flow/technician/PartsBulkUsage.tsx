import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { PartCustodyReturnRecord } from '../../../api/part-requests.api';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface BulkChange { itemId: string; requestId: string; record: PartCustodyReturnRecord; quantity: number }

/** Open usage editors that hold a different quantity than what is recorded; a never-recorded line left at 0 is skipped. */
export const bulkChanges = (
  drafts: Record<string, number>,
  find: (itemId: string) => { requestId: string; record: PartCustodyReturnRecord } | undefined,
): BulkChange[] => Object.entries(drafts).flatMap(([itemId, quantity]) => {
  const hit = find(itemId);
  if (!hit) return [];
  const { record } = hit;
  return (record.usageRecorded === true ? quantity !== record.usedQty : quantity > 0) ? [{ itemId, requestId: hit.requestId, record, quantity }] : [];
});

/** One extra button: saves the quantity typed in every open usage editor at once. */
export default function PartsBulkUsage({ count, locked, onSave }: { count: number; locked: boolean; onSave: () => void }) {
  const off = locked || count === 0;
  return (
    <Pressable testID="parts-bulk-save" accessibilityRole="button" accessibilityState={{ disabled: off }} disabled={off} onPress={onSave}
      style={({ pressed }) => [styles.save, off && styles.dim, pressed && styles.pressed]}>
      <Text style={styles.saveText}>{count ? `Lưu số lượng đã dùng của ${count} linh kiện` : 'Lưu số lượng đã dùng'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  save: { minHeight: 48, borderRadius: 10, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  saveText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
