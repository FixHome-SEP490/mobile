import React from 'react';
import { View } from 'react-native';
import { DetailRow } from './TaskScreenShell';
import { quoteMoneyText } from './DecisionSummary';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface M6InvoiceLike {
  id: string;
  grandTotal: number | string;
  paymentStatus: string;
  items?: { id: string; description: string; quantity: number; lineTotal: number | string }[];
}

/**
 * Pure server-invoice presentation. Renders the exact Backend lines and the
 * server grand total; never recomputes, sums, or fills missing values.
 */
export function M6InvoiceSummary({ invoice }: { invoice: M6InvoiceLike }) {
  const paid = String(invoice.paymentStatus).toUpperCase() === 'PAID';
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
      <DetailRow label="Mã hóa đơn" value={invoice.id} />
      {invoice.items?.map(item => (
        <DetailRow
          key={item.id}
          label={`${item.description} · Số lượng ${item.quantity}`}
          value={quoteMoneyText(item.lineTotal)}
        />
      ))}
      {invoice.items !== undefined && invoice.items.length === 0 ? (
        <DetailRow label="Dòng hóa đơn" value="Hóa đơn không có dòng hàng chi tiết." />
      ) : null}
      <DetailRow label="Tổng tiền do máy chủ trả về" value={quoteMoneyText(invoice.grandTotal)} />
      <DetailRow
        label="Trạng thái thanh toán"
        value={paid ? 'Đã thanh toán' : String(invoice.paymentStatus).toUpperCase() === 'REFUNDED' ? 'Đã hoàn tiền' : 'Chưa thanh toán'}
      />
    </View>
  );
}
