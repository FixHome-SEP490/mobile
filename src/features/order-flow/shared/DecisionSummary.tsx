import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import type { OrderQuotation, OrderQuotationItem } from '../domain/order-session.types';
import type { EligibleWarrantyOption } from '../customer/customer-quotation-controller';
import { QUOTE_STATUS } from './OrderCostHistory';

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

const isLabor = (item: OrderQuotationItem) => String(item.type).toLowerCase() === 'labor';

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
  const status = QUOTE_STATUS[String(quotation.status).toUpperCase()];
  const tone = status ? colors.tone[status.tone] : colors.tone.neutral;
  const rows = quotation.items.map((item, index) => ({
    item,
    key: typeof item.id === 'string' && item.id ? item.id : `${quotation.id}-${index}`,
  }));

  const renderRow = ({ item, key }: { item: OrderQuotationItem; key: string }, last: boolean) => {
    const isEligible = eligibleIds.has(key);
    const checked = selectedSet.has(key);
    const total = item.lineTotal ?? item.unitPrice * item.quantity;
    return (
      <View key={key} style={[styles.item, !last && styles.itemDivider]}>
        <View style={styles.itemHead}>
          <Text style={styles.itemDescription}>{item.description}</Text>
          <Text style={styles.itemTotal}>{quoteMoneyText(total)}</Text>
        </View>
        <Text style={styles.meta}>{item.quantity} × {quoteMoneyText(item.unitPrice)}</Text>
        {item.warrantyDays ? <Text style={styles.meta}>Bảo hành {item.warrantyDays} ngày</Text> : null}
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
          <Text style={styles.chosen}>Đã chọn bảo hành dòng này.</Text>
        ) : null}
      </View>
    );
  };

  const section = (title: string, list: typeof rows) => (list.length ? (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {list.map((row, i) => renderRow(row, i === list.length - 1))}
    </View>
  ) : null);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Báo giá lần {quotation.version ?? '—'}</Text>
        {status ? (
          <View style={[styles.chip, { backgroundColor: tone.bg }]}>
            <Text style={[styles.chipText, { color: tone.text }]}>{status.label}</Text>
          </View>
        ) : null}
      </View>
      {quotation.sentAt ? <Text style={styles.meta}>Gửi lúc {vnDateTimeString(quotation.sentAt)}</Text> : null}

      {section('Tiền công', rows.filter(r => isLabor(r.item)))}
      {section('Linh kiện', rows.filter(r => !isLabor(r.item)))}

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tiền công</Text>
          <Text style={styles.totalValue}>{quoteMoneyText(quotation.laborTotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Linh kiện</Text>
          <Text style={styles.totalValue}>{quoteMoneyText(quotation.partsTotal)}</Text>
        </View>
        {eligible.length > 0 && (
          <Text style={styles.meta}>Phí bảo hành tính một lần cho mỗi dòng, không nhân theo số lượng.</Text>
        )}
      </View>

      {previewError ? (
        <Text testID="decision-preview-error" accessibilityRole="alert" style={styles.errorText}>
          {previewError}
        </Text>
      ) : preview ? (
        <View testID="decision-preview" style={styles.preview}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tạm tính bảo hành</Text>
            <Text style={styles.totalValue}>{quoteMoneyText(preview.warrantyTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.previewLabel}>Ước tính</Text>
            <Text style={styles.previewTotal}>{quoteMoneyText(preview.previewGrandTotal)}</Text>
          </View>
          <Text style={styles.meta}>Số ước tính để tham khảo; tổng theo máy chủ trên chi tiết đã duyệt mới có hiệu lực.</Text>
        </View>
      ) : (
        <Text testID="decision-preview-unavailable" style={styles.meta}>
          Chưa tính được xem trước vì thiếu hoặc sai dữ liệu giá. Tổng theo máy chủ vẫn hiển thị ở trên.
        </Text>
      )}

      {approveNote ? <Text style={styles.meta}>{approveNote}</Text> : null}
    </View>
  );
}

const money = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '600' },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  section: { gap: 4, marginTop: 4 },
  sectionTitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  item: { paddingVertical: 10, gap: 2 },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  itemDescription: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  itemTotal: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700', ...money },
  chosen: { color: colors.primaryStrong, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  checkbox: {
    minHeight: 48,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
  },
  checkboxChecked: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  checkboxText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  checkboxTextChecked: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  totalLabel: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  totalValue: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600', ...money },
  preview: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: spacing.md, gap: 6 },
  previewLabel: { color: colors.primaryStrong, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  previewTotal: { color: colors.primaryStrong, fontSize: 22, lineHeight: 30, fontWeight: '700', ...money },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 21 },
});
