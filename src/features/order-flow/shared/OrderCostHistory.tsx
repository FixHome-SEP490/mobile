import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';
import { ReadOnlyNotice } from './TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing, type ToneName } from '../../../constants/theme';

const QUOTE_STATUS: Record<string, { label: string; tone: ToneName }> = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  SENT: { label: 'Chờ duyệt báo giá', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt báo giá', tone: 'success' },
  REJECTED: { label: 'Đã từ chối báo giá', tone: 'danger' },
  SUPERSEDED: { label: 'Đã được thay thế', tone: 'neutral' },
};
const EXTRA_STATUS: Record<string, { label: string; tone: ToneName }> = {
  PENDING_APPROVAL: { label: 'Chờ duyệt chi phí phát sinh', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt chi phí phát sinh', tone: 'success' },
  REJECTED: { label: 'Đã từ chối chi phí phát sinh', tone: 'danger' },
  EXPIRED: { label: 'Đã hết hạn', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

/** Money may arrive as a digit string (bigint columns); anything else is unknown, never 0. */
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : undefined;
const money = (value: unknown) => formatVnd(num(value));

interface Line { id?: string; type?: string; description: string; quantity: number; unitPrice?: unknown; lineTotal?: unknown; warrantyTermDays?: number | null }

function Chip({ status, map }: { status: string; map: Record<string, { label: string; tone: ToneName }> }) {
  const view = map[status.toUpperCase()] ?? { label: 'Trạng thái chưa xác định', tone: 'neutral' as ToneName };
  const tone = colors.tone[view.tone];
  return <View style={[styles.chip, { backgroundColor: tone.bg }]}><Text style={[styles.chipText, { color: tone.text }]}>{view.label}</Text></View>;
}

function LineRow({ line }: { line: Line }) {
  const isLabor = String(line.type ?? '').toLowerCase() === 'labor';
  const total = num(line.lineTotal) ?? (num(line.unitPrice) !== undefined ? num(line.unitPrice)! * line.quantity : undefined);
  return (
    <View style={styles.line}>
      <View style={styles.lineMain}>
        <Text style={styles.lineName}>{line.description}</Text>
        <Text style={styles.meta}>{isLabor ? 'Tiền công' : 'Linh kiện'} · {line.quantity} × {money(line.unitPrice)}</Text>
        {!isLabor && line.warrantyTermDays ? <Text style={styles.meta}>Bảo hành {line.warrantyTermDays} ngày</Text> : null}
      </View>
      <Text style={styles.lineTotal}>{formatVnd(total)}</Text>
    </View>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.totalRow}><Text style={strong ? styles.totalStrong : styles.meta}>{label}</Text><Text style={strong ? styles.totalStrong : styles.totalValue}>{value}</Text></View>;
}

/**
 * Every quotation round and every extra-cost proposal of the order, oldest first, each with its status,
 * lines and totals, so the customer or technician can see how the price got to where it is. Read only.
 */
export default function OrderCostHistory() {
  const { key, snapshot, loadResource } = useOrderSession();
  useLoadUnloadedResources(snapshot, ['quotations', 'extras'], loadResource);
  if (!key || !snapshot || snapshot.access !== 'current') return null;

  const quotes = snapshot.resources.quotations;
  const extras = snapshot.resources.extras;
  const own = (row: { serviceOrderId: string; technicianId?: string }) => row.serviceOrderId === key.serviceOrderId
    && (key.role !== 'technician' || !row.technicianId || row.technicianId === key.userId);
  const quoteRows = quotes.status === 'ready'
    ? quotes.data.filter(own).filter(q => String(q.status).toUpperCase() !== 'DRAFT' || key.role === 'technician')
      .sort((a, b) => (a.version ?? 0) - (b.version ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    : [];
  const extraRows = extras.status === 'ready'
    ? extras.data.filter(own).sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    : [];
  const failed = quotes.status === 'error' || extras.status === 'error';

  if (!failed && !quoteRows.length && !extraRows.length) return null;
  return (
    <View testID="order-cost-history" style={styles.wrap}>
      {failed ? <ReadOnlyNotice tone="error">Không tải được lịch sử báo giá hoặc chi phí phát sinh.</ReadOnlyNotice> : null}

      {quoteRows.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>Báo giá</Text>
          {quoteRows.map((quote, index) => (
            <View key={quote.id} testID={`cost-quote-${quote.id}`} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.cardTitle}>Báo giá lần {quote.version ?? index + 1}</Text>
                <Chip status={quote.status} map={QUOTE_STATUS} />
              </View>
              {quote.sentAt ? <Text style={styles.meta}>Gửi lúc {vnDateTimeString(quote.sentAt)}</Text> : null}
              {quote.items.map((item, i) => <LineRow key={item.id ?? `${quote.id}-${i}`} line={item} />)}
              {quote.note ? <Text style={styles.meta}>Ghi chú: {quote.note}</Text> : null}
              <Total label="Tiền công" value={money(quote.laborTotal)} />
              <Total label="Linh kiện" value={money(quote.partsTotal)} />
            </View>
          ))}
        </View>
      ) : null}

      {extraRows.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>Chi phí phát sinh</Text>
          {extraRows.map((cost, index) => {
            const labor = num(cost.totalLaborDelta);
            const parts = num(cost.totalPartsDelta);
            const shipping = num(cost.shippingFee) ?? 0;
            return (
              <View key={cost.id} testID={`cost-extra-${cost.id}`} style={styles.card}>
                <View style={styles.head}>
                  <Text style={styles.cardTitle}>Phát sinh lần {index + 1}</Text>
                  <Chip status={cost.status} map={EXTRA_STATUS} />
                </View>
                {cost.createdAt ? <Text style={styles.meta}>Đề xuất lúc {vnDateTimeString(cost.createdAt)}</Text> : null}
                {cost.reason ? <Text style={styles.reason}>{cost.reason}</Text> : null}
                {cost.items.map((item, i) => <LineRow key={item.id ?? `${cost.id}-${i}`} line={item} />)}
                <Total label="Tiền công" value={formatVnd(labor)} />
                <Total label="Linh kiện" value={formatVnd(parts)} />
                {shipping > 0 ? <Total label="Phí giao linh kiện" value={formatVnd(shipping)} /> : null}
                {labor !== undefined && parts !== undefined ? <Total strong label="Tổng phát sinh" value={formatVnd(labor + parts + shipping)} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { gap: 8 },
  title: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  reason: { color: colors.text, fontSize: 14, lineHeight: 21 },
  line: { flexDirection: 'row', gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineMain: { flex: 1, minWidth: 0, gap: 2 },
  lineName: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  lineTotal: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  totalValue: { color: colors.text, fontSize: 14, lineHeight: 20 },
  totalStrong: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
});
