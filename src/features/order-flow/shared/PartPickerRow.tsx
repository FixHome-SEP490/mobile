import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';
import { CatalogPicker } from './CatalogPicker';
import type { CostItemCatalogOption, CostItemCatalogPanel, CostItemFieldErrors, CostItemRow } from './CostItemEditor';

export const PART_NOTE_MAX = 500;

/** Pre-repair part line: catalog pick + quantity + note only (no price, labor or source options). */
export function PartPickerRow({ row, errors, catalog, expanded, canRemove, maxQuantity = 100, onToggle, onChange, onRemove, onLoadCatalog, onSelectCatalogPart }: {
  row: CostItemRow;
  errors?: CostItemFieldErrors;
  catalog?: CostItemCatalogPanel;
  expanded: boolean;
  canRemove: boolean;
  maxQuantity?: number;
  onToggle: () => void;
  onChange: (next: CostItemRow) => void;
  onRemove: () => void;
  onLoadCatalog?: (search?: string) => void;
  onSelectCatalogPart?: (part: CostItemCatalogOption) => void;
}) {
  const id = (suffix: string) => `cost-item-${row.key}-${suffix}`;
  const qty = /^\d+$/.test(row.quantity.trim()) ? Number(row.quantity) : null;
  const title = row.partNameSnapshot || 'Chưa chọn linh kiện';
  const hasErrors = !!errors && Object.keys(errors).length > 0;
  const summary = `Số lượng: ${qty ?? '—'}${row.partSku ? ` · Mã ${row.partSku}` : ''}`;
  const setQty = (next: number) => onChange({ ...row, quantity: String(Math.min(maxQuantity, Math.max(1, next))) });

  return (
    <View style={styles.card}>
      <TouchableOpacity
        testID={id('header')}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}. ${hasErrors ? 'Cần bổ sung thông tin' : summary}`}
        accessibilityHint="Mở hoặc thu gọn linh kiện này"
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={[styles.title, !row.partNameSnapshot && styles.titleEmpty]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.meta, hasErrors && styles.metaError]} numberOfLines={1}>{hasErrors ? 'Cần bổ sung thông tin' : summary}</Text>
        </View>
        <View style={[styles.chevron, expanded && styles.chevronUp]} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <CatalogPicker
            idPrefix={`cost-item-${row.key}-`}
            selectedId={row.partCatalogId}
            catalog={catalog}
            hint="Chọn linh kiện FixHome cần mang theo. Kho sẽ chuẩn bị theo số lượng bên dưới."
            error={errors?.partCatalogId}
            onLoad={onLoadCatalog}
            onSelect={onSelectCatalogPart}
          />
          {!!row.partNameSnapshot && (
            <Text style={styles.chosenLine}>Đã chọn: {row.partNameSnapshot}{/^\d+$/.test(row.unitPrice) ? ` · ${formatVnd(Number(row.unitPrice))}` : ''}</Text>
          )}

          <Text style={styles.label}>Số lượng (tối đa {maxQuantity})</Text>
          <View style={styles.stepper}>
            <TouchableOpacity testID={id('qty-minus')} accessibilityRole="button" accessibilityLabel="Giảm số lượng" disabled={qty !== null && qty <= 1} onPress={() => setQty((qty ?? 2) - 1)} style={[styles.stepBtn, qty !== null && qty <= 1 && styles.disabled]}>
              <Text style={styles.stepText}>−</Text>
            </TouchableOpacity>
            <TextInput
              testID={id('quantity')}
              accessibilityLabel="Số lượng"
              value={row.quantity}
              onChangeText={quantity => onChange({ ...row, quantity: quantity.replace(/\D/g, '') })}
              keyboardType="number-pad"
              maxLength={3}
              style={[styles.input, styles.qtyInput]}
            />
            <TouchableOpacity testID={id('qty-plus')} accessibilityRole="button" accessibilityLabel="Tăng số lượng" disabled={qty !== null && qty >= maxQuantity} onPress={() => setQty((qty ?? 0) + 1)} style={[styles.stepBtn, qty !== null && qty >= maxQuantity && styles.disabled]}>
              <Text style={styles.stepText}>+</Text>
            </TouchableOpacity>
          </View>
          {errors?.quantity ? <Text testID={id('error-quantity')} accessibilityRole="alert" style={styles.error}>{errors.quantity}</Text> : null}

          <Text style={styles.label}>Ghi chú cho kho (tùy chọn)</Text>
          <TextInput
            testID={id('note')}
            accessibilityLabel="Ghi chú cho kho"
            value={row.description}
            onChangeText={description => onChange({ ...row, description })}
            placeholder="Ví dụ: loại 220V, mang kèm gioăng"
            placeholderTextColor={colors.textSecondary}
            maxLength={PART_NOTE_MAX}
            style={styles.input}
          />

          {canRemove && (
            <TouchableOpacity testID={id('remove')} accessibilityRole="button" accessibilityHint="Xóa linh kiện này khỏi yêu cầu" onPress={onRemove} style={styles.remove}>
              <Text style={styles.removeText}>Xóa linh kiện</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 8, gap: 8 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  titleEmpty: { color: colors.textSecondary, fontWeight: '500' },
  meta: { color: colors.textSecondary, fontSize: 13 },
  metaError: { color: colors.error, fontWeight: '600' },
  chevron: { width: 9, height: 9, borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.textSecondary, transform: [{ rotate: '45deg' }], marginBottom: 4 },
  chevronUp: { transform: [{ rotate: '225deg' }], marginBottom: 0, marginTop: 4 },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 8 },
  chosenLine: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  label: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.text, fontSize: 16, backgroundColor: colors.surface },
  stepper: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stepBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.primaryStrong, fontSize: 22, fontWeight: '600' },
  qtyInput: { flex: 1, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  remove: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.error, fontSize: 15, fontWeight: '600' },
});
