import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { isHistoricalOrder } from '../../../api/orders.api';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';
import { costLineDisplay } from './order-detail-view-models';

const amount = (value: unknown) => typeof value === 'number' ? formatVnd(value) : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? `${value} ₫` : 'Chưa có dữ liệu';

export default function ScopeDetailScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.quotations.status === 'loading'
    || snapshot?.resources.extras.status === 'loading' || snapshot?.resources.parts.status === 'loading';
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !!key;
  useLoadUnloadedResources(snapshot, ['quotations', 'extras', 'parts'], loadResource);
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const historical = snapshot?.access === 'historical' && key?.role === 'technician';
  const quotations = current && snapshot?.resources.quotations.status === 'ready'
    ? snapshot.resources.quotations.data.filter(item => item.serviceOrderId === key!.serviceOrderId && item.status.toUpperCase() === 'APPROVED') : [];
  const extras = current && snapshot?.resources.extras.status === 'ready'
    ? snapshot.resources.extras.data.filter(item => item.serviceOrderId === key!.serviceOrderId && ['PENDING_APPROVAL', 'APPROVED'].includes(item.status.toUpperCase())) : [];
  const parts = current && snapshot?.resources.parts.status === 'ready'
    ? snapshot.resources.parts.data.filter(item => item.serviceOrderId === key!.serviceOrderId) : [];
  return <TaskScreenShell title="Phạm vi và báo giá" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {historical && <ReadOnlyNotice>Đơn lịch sử không tải báo giá, vật tư hoặc tài nguyên chi tiết.</ReadOnlyNotice>}
    {!current && !historical && <ReadOnlyNotice>Phạm vi chỉ được đọc sau khi máy chủ xác minh quyền xem đơn hiện tại.</ReadOnlyNotice>}
    {current && order && <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md }}>
      {order.pricingMode === 'FIXED_PRICE' ? <>
        <DetailRow label="Giá đã chốt" value={amount(order.fixedUnitPrice)} />
        <DetailRow label="Số lượng" value={order.quantity ?? 'Chưa có dữ liệu'} />
        <DetailRow label="Tổng tiền theo máy chủ" value={formatVnd(order.grandTotal)} />
        {order.scopeDescription && <DetailRow label="Phạm vi đã chốt" value={order.scopeDescription} />}
      </> : <DetailRow label="Hình thức giá" value="Cần khảo sát hoặc báo giá theo dữ liệu đơn" />}
    </View>}
    {current && snapshot?.resources.quotations.status === 'loading' && <ReadOnlyNotice>Đang tải báo giá…</ReadOnlyNotice>}
    {current && snapshot?.resources.quotations.status === 'error' && <ReadOnlyNotice>Không tải được báo giá. Không thể kết luận rằng đơn không có báo giá.</ReadOnlyNotice>}
    {current && snapshot?.resources.quotations.status === 'ready' && quotations.length === 0 && <ReadOnlyNotice>Chưa có báo giá đã được duyệt cho đơn này.</ReadOnlyNotice>}
    {quotations.map(quote => <View key={quote.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Báo giá đã được duyệt · {quote.id}</Text>
      {quote.items.map((item, index) => <DetailRow key={item.id ?? `${quote.id}-${index}`} label={item.description} value={`${item.quantity} × ${amount(item.unitPrice)}`} />)}
    </View>)}
    {current && snapshot?.resources.extras.status === 'loading' && <ReadOnlyNotice>Đang tải đề xuất chi phí phát sinh…</ReadOnlyNotice>}
    {current && snapshot?.resources.extras.status === 'error' && <ReadOnlyNotice>Không tải được đề xuất phát sinh; dữ liệu lỗi không đồng nghĩa là không có đề xuất.</ReadOnlyNotice>}
    {current && snapshot?.resources.extras.status === 'ready' && extras.length === 0 && <ReadOnlyNotice>Chưa có đề xuất phát sinh đang chờ hoặc đã được duyệt.</ReadOnlyNotice>}
    {extras.map(item => <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Đề xuất {item.status.toUpperCase() === 'PENDING_APPROVAL' ? 'đang chờ duyệt' : 'đã duyệt'}</Text>
      <DetailRow label="Lý do" value={item.reason} />
      <DetailRow label="Mã đề xuất" value={item.id} />
      {item.items.map(entry => <DetailRow key={entry.id} label={entry.description} value={costLineDisplay(entry)} />)}
    </View>)}
    {current && snapshot?.resources.parts.status === 'loading' && <ReadOnlyNotice>Đang tải danh sách vật tư…</ReadOnlyNotice>}
    {current && snapshot?.resources.parts.status === 'error' && <ReadOnlyNotice>Không tải được danh sách vật tư.</ReadOnlyNotice>}
    {current && snapshot?.resources.parts.status === 'ready' && parts.every(part => part.items.length === 0) && <ReadOnlyNotice>Chưa có dòng vật tư được ghi nhận.</ReadOnlyNotice>}
    {parts.flatMap(part => part.items.map(item => <View key={`${part.id}-${item.id}`} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md }}>
      <DetailRow label="Vật tư" value={item.partNameSnapshot} /><DetailRow label="Số lượng" value={item.quantity} />
    </View>))}
  </TaskScreenShell>;
}
