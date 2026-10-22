import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Minus, Plus, X } from 'lucide-react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';
import { CatalogPicker } from './CatalogPicker';
import type { CostItemCatalogOption, CostItemCatalogPanel, CostItemRow } from './CostItemEditor';

/** Whole-number line total, or null until quantity and price are both whole numbers. */
export const partLineTotal = (row: Pick<CostItemRow, 'quantity' | 'unitPrice'>): number | null =>
  /^\d+$/.test(row.quantity.trim()) && /^\d+$/.test(row.unitPrice.trim()) ? Number(row.quantity) * Number(row.unitPrice) : null;

/**
 * Pre-repair "pick parts" sheet body. Search, tick as many parts as needed (the picks survive new
 * searches), set each quantity under its row, then add them all at once. Render inside a BottomSheetModal.
 */
export function PartPickerRow({ picked, catalog, error, maxQuantity = 100, canAdd = true, onToggle, onQuantity, onAdd, onClose, onLoadCatalog }: {
  picked: CostItemRow[];
  catalog?: CostItemCatalogPanel;
  error?: string | null;
  maxQuantity?: number;
  canAdd?: boolean;
  onToggle: (part: CostItemCatalogOption) => void;
  onQuantity: (key: string, quantity: string) => void;
  onAdd: () => void;
  onClose?: () => void;
  onLoadCatalog?: (search?: string) => void;
}) {
  const total = picked.reduce((sum, row) => sum + (partLineTotal(row) ?? 0), 0);
  const step = (row: CostItemRow, delta: number) => {
    const current = /^\d+$/.test(row.quantity.trim()) ? Number(row.quantity) : 1;
    onQuantity(row.key, String(Math.min(maxQuantity, Math.max(1, current + delta))));
  };
  const renderSelected = (part: CostItemCatalogOption) => {
    const row = picked.find(r => r.partCatalogId === part.id);
    if (!row) return null;
    const qty = /^\d+$/.test(row.quantity.trim()) ? Number(row.quantity) : null;
    return (
      <View style={styles.stepper}>
        <Text style={styles.stepLabel}>Số lượng</Text>
        <TouchableOpacity testID={`pick-qty-minus-${part.id}`} accessibilityRole="button" accessibilityLabel={`Giảm số lượng ${part.name}`} disabled={qty !== null && qty <= 1} onPress={() => step(row, -1)} style={[styles.stepBtn, qty !== null && qty <= 1 && styles.disabled]}>
          <Minus size={18} color={colors.primaryStrong} />
        </TouchableOpacity>
        <BottomSheetTextInput
          testID={`pick-qty-${part.id}`}
          accessibilityLabel={`Số lượng ${part.name}`}
          value={row.quantity}
          onChangeText={(quantity: string) => onQuantity(row.key, quantity.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
          style={styles.qtyInput}
        />
        <TouchableOpacity testID={`pick-qty-plus-${part.id}`} accessibilityRole="button" accessibilityLabel={`Tăng số lượng ${part.name}`} disabled={qty !== null && qty >= maxQuantity} onPress={() => step(row, 1)} style={[styles.stepBtn, qty !== null && qty >= maxQuantity && styles.disabled]}>
          <Plus size={18} color={colors.primaryStrong} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Chọn linh kiện</Text>
        {onClose && (
          <TouchableOpacity testID="pre-parts-sheet-close" accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} hitSlop={8} style={styles.close}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pickerArea}>
        <CatalogPicker
          fill
          ListComponent={BottomSheetScrollView}
          InputComponent={BottomSheetTextInput}
          idPrefix="pick-"
          selectedId=""
          selectedIds={picked.map(r => r.partCatalogId)}
          renderSelected={renderSelected}
          hint="Tìm và chạm để chọn. Có thể tìm nhiều lần, các linh kiện đã chọn được giữ lại."
          catalog={catalog}
          onLoad={onLoadCatalog}
          onSelect={onToggle}
        />
      </View>

      <View style={styles.footer}>
        {error ? <Text testID="pick-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>Đã chọn {picked.length} linh kiện</Text>
          <Text style={styles.summaryTotal}>{formatVnd(total)}</Text>
        </View>
        <TouchableOpacity testID="pre-parts-add-item" accessibilityRole="button" disabled={!canAdd || !picked.length} onPress={onAdd} style={[styles.add, (!canAdd || !picked.length) && styles.disabled]}>
          <Text style={styles.addText}>{picked.length ? `Thêm ${picked.length} linh kiện vào danh sách` : 'Chọn linh kiện để thêm'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickerArea: { flex: 1, minHeight: 0 },
  footer: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { color: colors.textSecondary, fontSize: 14 },
  summaryTotal: { color: colors.text, fontSize: 16, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 12, paddingBottom: 10 },
  stepLabel: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 64, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, textAlign: 'center', color: colors.text, fontSize: 16, backgroundColor: colors.surface },
  disabled: { opacity: 0.4 },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  add: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primaryStrong },
  addText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
});
