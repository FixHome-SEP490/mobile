import React from 'react';
import { Text, View } from 'react-native';
import { DetailRow, LineRow, Section } from './TaskScreenShell';
import { quoteMoneyText } from './DecisionSummary';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface M6InvoiceLike {
  id: string;
  grandTotal: number | string;
  paymentStatus: string;
  items?: { id: string; description: string; quantity: number; lineTotal: number | string; type?: string }[];
}

const isLabor = (type?: string) => String(type ?? '').toLowerCase() === 'labor';

/**
 * Pure server-invoice presentation. Renders the exact Backend lines and the
 * server grand total; never recomputes, sums, or fills missing values.
 * Labour and parts are shown as two groups; the total sits first and large, because it is what gets paid.
 */
export function M6InvoiceSummary({ invoice }: { invoice: M6InvoiceLike }) {
  const status = String(invoice.paymentStatus).toUpperCase();
  const items = invoice.items;
  const labor = items?.filter(item => isLabor(item.type)) ?? [];
  const parts = items?.filter(item => !isLabor(item.type)) ?? [];
  const lines = (list: NonNullable<typeof items>) => list.map((item, i) => (
    <LineRow key={item.id} name={item.description} detail={`Số lượng ${item.quantity}`} value={quoteMoneyText(item.lineTotal)} last={i === list.length - 1} />
  ));
  return (
    <>
      <Section title="Hóa đơn">
        <View style={{ paddingVertical: 12, gap: 4, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Tổng thanh toán</Text>
          <Text style={{ color: colors.primaryStrong, fontSize: 26, lineHeight: 34, fontWeight: '700' }}>{quoteMoneyText(invoice.grandTotal)}</Text>
        </View>
        <DetailRow label="Mã hóa đơn" value={`#${String(invoice.id).slice(0, 8).toUpperCase()}`} />
        <DetailRow label="Trạng thái" value={status === 'PAID' ? 'Đã thanh toán' : status === 'REFUNDED' ? 'Đã hoàn tiền' : 'Chưa thanh toán'} />
      </Section>
      {labor.length > 0 ? <Section title="Tiền công">{lines(labor)}</Section> : null}
      {parts.length > 0 ? <Section title="Linh kiện">{lines(parts)}</Section> : null}
      {items !== undefined && items.length === 0 ? (
        <Text style={{ color: colors.textSecondary, paddingVertical: spacing.sm }}>Hóa đơn không có dòng hàng chi tiết.</Text>
      ) : null}
    </>
  );
}
