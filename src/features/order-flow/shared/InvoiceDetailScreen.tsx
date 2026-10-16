import React from 'react';
import { paymentStatusLabel } from './payment-status-label';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { invoiceDisplayState } from './order-detail-view-models';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';

function money(value: number | string) {
  return typeof value === 'number' ? formatVnd(value) : /^\d+(?:\.\d+)?$/.test(value) ? `${value} ₫` : 'Chưa có dữ liệu';
}

export default function InvoiceDetailScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.invoice.status === 'loading';
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !!key;
  useLoadUnloadedResources(snapshot, ['invoice'], loadResource);
  const history = snapshot?.access === 'historical' && key?.role === 'technician';
  const state = current && snapshot ? invoiceDisplayState(snapshot.resources.invoice) : null;
  return <TaskScreenShell title="Hóa đơn" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {history && <ReadOnlyNotice>Hóa đơn không được tải cho đơn lịch sử.</ReadOnlyNotice>}
    {!current && !history && <ReadOnlyNotice>Hóa đơn chỉ tải sau khi quyền xem đơn hiện tại được xác minh.</ReadOnlyNotice>}
    {state?.kind === 'loading' && <ReadOnlyNotice>Đang tải hóa đơn…</ReadOnlyNotice>}
    {state?.kind === 'unavailable' && <ReadOnlyNotice>Chưa xác minh được hóa đơn. Không thể suy ra rằng hóa đơn không tồn tại.</ReadOnlyNotice>}
    {state?.kind === 'absent' && <ReadOnlyNotice>Máy chủ xác nhận đơn hiện chưa có hóa đơn.</ReadOnlyNotice>}
    {state?.kind === 'invoice' && <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md }}>
      <DetailRow label="Mã hóa đơn" value={state.invoice.id} />
      <DetailRow label="Tổng tiền do máy chủ trả về" value={money(state.total)} />
      <DetailRow label="Trạng thái thanh toán" value={paymentStatusLabel(state.paymentStatus)} />
      <ReadOnlyNotice>Thanh toán và hoàn tất đơn là hai trạng thái riêng. Màn hình này chỉ đọc, không gửi yêu cầu thanh toán hay xác nhận hoàn tất.</ReadOnlyNotice>
      {state.invoice.items === undefined && <Text style={{ color: colors.textSecondary, paddingVertical: spacing.md }}>Hóa đơn cũ chưa có danh sách dòng hàng.</Text>}
      {state.invoice.items?.map(item => <DetailRow key={item.id} label={`${item.description} · ${item.quantity}`} value={money(item.lineTotal)} />)}
    </View>}
  </TaskScreenShell>;
}
