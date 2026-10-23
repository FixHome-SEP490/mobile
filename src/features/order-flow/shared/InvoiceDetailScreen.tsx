import React from 'react';
import { paymentStatusLabel } from './payment-status-label';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { invoiceDisplayState, invoiceVsQuotation } from './order-detail-view-models';
import { DetailRow, ReadOnlyNotice, Section, TaskScreenShell } from './TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';

function money(value: number | string) {
  return typeof value === 'number' ? formatVnd(value) : /^\d+(?:\.\d+)?$/.test(value) ? `${value} ₫` : 'Chưa có dữ liệu';
}

/** One invoice line: name and quantity on the left, money on the right; a quantity that differs from the quotation gets its own line. */
function LineRow({ name, detail, warn, value, last }: { name: string; detail: string; warn?: boolean; value: string; last: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>{name}</Text>
      <Text style={{ color: warn ? colors.tone.warning.text : colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{detail}</Text>
    </View>
    <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>{value}</Text>
  </View>;
}

export default function InvoiceDetailScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.invoice.status === 'loading';
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !!key;
  useLoadUnloadedResources(snapshot, ['invoice', 'quotations'], loadResource);
  const history = snapshot?.access === 'historical' && key?.role === 'technician';
  const state = current && snapshot ? invoiceDisplayState(snapshot.resources.invoice) : null;
  const quotations = snapshot?.resources.quotations.status === 'ready' ? snapshot.resources.quotations.data : null;
  const vs = state?.kind === 'invoice' ? invoiceVsQuotation(state.invoice, quotations) : null;
  return <TaskScreenShell title="Hóa đơn" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {history && <ReadOnlyNotice>Hóa đơn không được tải cho đơn lịch sử.</ReadOnlyNotice>}
    {!current && !history && <ReadOnlyNotice>Hóa đơn chỉ tải sau khi quyền xem đơn hiện tại được xác minh.</ReadOnlyNotice>}
    {state?.kind === 'loading' && <ReadOnlyNotice>Đang tải hóa đơn…</ReadOnlyNotice>}
    {state?.kind === 'unavailable' && <ReadOnlyNotice>Chưa xác minh được hóa đơn. Không thể suy ra rằng hóa đơn không tồn tại.</ReadOnlyNotice>}
    {state?.kind === 'absent' && <ReadOnlyNotice>Máy chủ xác nhận đơn hiện chưa có hóa đơn.</ReadOnlyNotice>}
    {state?.kind === 'invoice' && <>
      <Section title="Hóa đơn">
        <DetailRow label="Mã hóa đơn" value={state.invoice.id} />
        <DetailRow label="Tổng tiền do máy chủ trả về" value={money(state.total)} />
        <DetailRow label="Trạng thái thanh toán" value={paymentStatusLabel(state.paymentStatus)} />
      </Section>
      {state.invoice.items === undefined && <Text style={{ color: colors.textSecondary, paddingVertical: spacing.md }}>Hóa đơn cũ chưa có danh sách dòng hàng.</Text>}
      {state.invoice.items && state.invoice.items.length > 0 && (() => {
        const items = state.invoice.items!;
        const isLabor = (type?: string) => String(type ?? '').toLowerCase() === 'labor';
        const labor = items.filter(item => isLabor(item.type));
        const parts = items.filter(item => !isLabor(item.type));
        const partRow = (item: (typeof items)[number], i: number, all: typeof items) => {
          const quoted = vs?.quotedQty.get(item.id);
          const less = quoted !== undefined && quoted !== item.quantity;
          return <LineRow key={item.id} name={item.description} warn={less}
            detail={quoted === undefined ? `Số lượng ${item.quantity}` : `Báo giá cần dùng ${quoted} · Thực dùng ${item.quantity}`}
            value={money(item.lineTotal)} last={i === all.length - 1} />;
        };
        return <>
          {labor.length > 0 && <Section title="Tiền công">
            {labor.map((item, i) => <LineRow key={item.id} name={item.description} detail={`Số lượng ${item.quantity}`} value={money(item.lineTotal)} last={i === labor.length - 1} />)}
            {state.invoice.laborTotal !== undefined && <DetailRow label="Tổng tiền công" value={money(state.invoice.laborTotal)} />}
          </Section>}
          {parts.length > 0 && <Section title="Linh kiện">{parts.map(partRow)}{state.invoice.partsTotal !== undefined && <DetailRow label="Tổng linh kiện" value={money(state.invoice.partsTotal)} />}</Section>}
        </>;
      })()}
      {vs && vs.unused.length > 0 && <Section title="Linh kiện báo giá nhưng không dùng đến">
        {vs.unused.map((item, i, all) => <LineRow key={item.id} name={item.description} detail={`Báo giá cần dùng ${item.quantity} · Thực dùng 0`} warn value="Không tính tiền" last={i === all.length - 1} />)}
      </Section>}
      {vs?.differs && <ReadOnlyNotice>Linh kiện được tính theo số lượng thực tế đã dùng, nên hóa đơn có thể thấp hơn báo giá. Phần không dùng đến không bị tính tiền.</ReadOnlyNotice>}
      <ReadOnlyNotice>Thanh toán và hoàn tất đơn là hai trạng thái riêng. Màn hình này chỉ đọc, không gửi yêu cầu thanh toán hay xác nhận hoàn tất.</ReadOnlyNotice>
    </>}
  </TaskScreenShell>;
}
