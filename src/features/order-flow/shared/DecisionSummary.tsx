import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';
import type { OrderQuotation } from '../domain/order-session.types';
import type { EligibleWarrantyOption } from '../customer/customer-quotation-controller';

export interface DecisionPreview {
  baseLabor: number;
  baseParts: number;
  warrantyTotal: number;
  previewGrandTotal: number;
}

/** Display-only money: Backend owns math; unknown values never render as 0. */
export function quoteMoneyText(value: unknown): string {
  if (typeof value === 'number') return formatVnd(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return formatVnd(Number(value.trim()));
  return 'Chưa có dữ liệu';
}

export interface DecisionSummaryProps {
  quotation: OrderQuotation;
  eligible: EligibleWarrantyOption[];
  selectedIds: string[];
  /** Null means unavailable (invalid components), which is distinct from a 0 preview. */
  preview: DecisionPreview | null;
  previewError?: string | null;
  interactive: boolean;
  onToggleItem?: (itemId: string) => void;
  approveNote?: string | null;
}

/**
 * Shared server-quotation summary. Renders actual Backend items and totals,
 * paid-warranty opt-ins default OFF, and an explicitly estimated preview.
 * The same module renders the persisted approval scope read-only.
 */
export function DecisionSummary({
  quotation,
  eligible,
  selectedIds,
  preview,
  previewError,
  interactive,
  onToggleItem,
  approveNote,
}: DecisionSummaryProps) {
  const eligibleIds = new Set(eligible.map(option => option.itemId));
  const eligibleById = new Map(eligible.map(option => [option.itemId, option]));
  const selectedSet = new Set(selectedIds);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Báo giá {quotation.id}</Text>
      <Text style={styles.meta}>
        Phiên bản {quotation.version ?? 'chưa rõ'}
        {quotation.sentAt ? ` · Gửi lúc ${quotation.sentAt}` : ''}
      </Text>

      {quotation.items.map((item, index) => {
        const key = typeof item.id === 'string' && item.id ? item.id : `${quotation.id}-${index}`;
        const isEligible = eligibleIds.has(key);
        const checked = selectedSet.has(key);
        return (
          <View key={key} style={styles.item}>
            <Text style={styles.itemDescription}>{item.description}</Text>
            <Text style={styles.itemMoney}>
              {item.quantity} × {quoteMoneyText(item.unitPrice)}
              {item.lineTotal !== undefined ? ` · Thành tiền: ${quoteMoneyText(item.lineTotal)}` : ''}
            </Text>
            {isEligible && interactive ? (
              <TouchableOpacity
                testID={`warranty-toggle-${key}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityHint="Chọn hoặc bỏ bảo hành có phí cho dòng này"
                onPress={() => onToggleItem?.(key)}
                style={[styles.checkbox, checked && styles.checkboxChecked]}
              >
                <Text style={checked ? styles.checkboxTextChecked : styles.checkboxText}>
                  {checked ? 'Đã chọn bảo hành' : 'Chọn bảo hành'}
                  {(() => {
                    const option = eligibleById.get(key);
                    return option ? ` · ${quoteMoneyText(option.fee)} / ${option.termDays} ngày` : '';
                  })()}
                </Text>
              </TouchableOpacity>
            ) : null}
            {isEligible && !interactive && checked ? (
              <Text style={styles.meta}>Đã chọn bảo hành dòng này.</Text>
            ) : null}
          </View>
        );
      })}

      <View style={styles.totals}>
        <Text style={styles.totalRow}>Tiền công: {quoteMoneyText(quotation.laborTotal)}</Text>
        <Text style={styles.totalRow}>Linh kiện: {quoteMoneyText(quotation.partsTotal)}</Text>
        {eligible.length > 0 && (
          <Text style={styles.hint}>Phí bảo hành tính một lần cho mỗi dòng, không nhân theo số lượng.</Text>
        )}
      </View>

      {previewError ? (
        <Text testID="decision-preview-error" accessibilityRole="alert" style={styles.errorText}>
          {previewError}
        </Text>
      ) : preview ? (
        <View testID="decision-preview" style={styles.preview}>
          <Text style={styles.totalRow}>Tạm tính bảo hành: {quoteMoneyText(preview.warrantyTotal)}</Text>
          <Text style={styles.previewTotal}>Ước tính: {quoteMoneyText(preview.previewGrandTotal)}</Text>
          <Text style={styles.hint}>Số ước tính để tham khảo; tổng theo máy chủ trên chi tiết đã duyệt mới có hiệu lực.</Text>
        </View>
      ) : (
        <Text testID="decision-preview-unavailable" style={styles.hint}>
          Chưa tính được xem trước vì thiếu hoặc sai dữ liệu giá. Tổng theo máy chủ vẫn hiển thị ở trên.
        </Text>
      )}

      {approveNote ? <Text style={styles.note}>{approveNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 8 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10, gap: 4 },
  itemDescription: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemMoney: { color: colors.text, fontSize: 14, lineHeight: 20 },
  checkbox: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
  },
  checkboxChecked: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  checkboxText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  checkboxTextChecked: { color: colors.primaryStrong, fontSize: 15, fontWeight: '700' },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10, gap: 4 },
  totalRow: { color: colors.text, fontSize: 15, lineHeight: 22 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: colors.primarySoft, borderRadius: 10, padding: 12, gap: 4 },
  previewTotal: { color: colors.primaryStrong, fontSize: 17, fontWeight: '700' },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 21 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
