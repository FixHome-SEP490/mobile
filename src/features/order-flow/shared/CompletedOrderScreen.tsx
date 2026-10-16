import React from 'react';
import { paymentStatusLabel } from './payment-status-label';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { quoteMoneyText } from './DecisionSummary';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';

/**
 * C12/T16 — actual COMPLETED only. Links to server invoice/scope/gallery;
 * never writes COMPLETED locally. Customer review belongs to M7.
 */
export default function CompletedOrderScreen({ role }: { role: 'customer' | 'technician' }) {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  useLoadUnloadedResources(snapshot, ['invoice'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && snapshot.key.userId === key.userId
    && snapshot.key.serviceOrderId === key.serviceOrderId && key.role === role && order.id === key.serviceOrderId
    && order.status === 'COMPLETED';
  const historical = snapshot?.access === 'historical';
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const invoice = snapshot?.resources.invoice.status === 'ready' ? snapshot.resources.invoice.data : null;

  if (!current || !order) {
    return (
      <TaskScreenShell title="Đơn hoàn thành" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {historical
            ? 'Đơn lịch sử chỉ xem được thông tin cho phép; trạng thái hoàn thành do máy chủ xác nhận.'
            : 'Đơn hoàn thành chỉ hiển thị sau khi máy chủ xác minh quyền xem đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Đơn hoàn thành"
      stage={4}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh,
        onPress: () => { if (canRefresh) void refresh('manual'); },
      }}
      primary={{
        label: role === 'customer' ? 'Về đơn của tôi' : 'Về danh sách công việc',
        testID: 'completed-back-home',
        onPress: () => navigation.goBack(),
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order.code} />
        <DetailRow label="Dịch vụ" value={order.serviceName} />
        {order.completionRequestedAt ? (
          <DetailRow label="Thời điểm bàn giao" value={vnDateTimeString(order.completionRequestedAt)} />
        ) : null}
        {order.completionNote ? <DetailRow label="Ghi chú bàn giao" value={order.completionNote} /> : null}
        <DetailRow
          label="Tổng tiền"
          value={typeof order.grandTotal === 'number' ? formatVnd(order.grandTotal) : quoteMoneyText(order.grandTotal)}
        />
        <DetailRow label="Thanh toán" value={invoice ? paymentStatusLabel(invoice.paymentStatus) : 'Chưa có dữ liệu'} />
      </View>
      {role === 'customer' ? (
        <ReadOnlyNotice>Đơn đã hoàn thành theo xác nhận của máy chủ. Bạn có thể đánh giá khi sẵn sàng; đây là bước tùy chọn.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>Đơn đã hoàn thành theo xác nhận của máy chủ. Tiền công đã được ghi nhận vào ví của bạn; không còn thao tác nào cần gửi cho đơn này.</ReadOnlyNotice>
      )}
      <View style={{ gap: 8 }}>
        {(
          [
            ['ScopeDetail', 'Xem phạm vi và báo giá'],
            ['InvoiceDetail', 'Xem hóa đơn'],
            ['EvidenceGallery', 'Xem ảnh và bằng chứng'],
            ['OrderProgressHistory', 'Xem tiến độ'],
            ...(role === 'customer' ? [['CustomerReview', 'Đánh giá dịch vụ'], ['CustomerWarranty', 'Xem bảo hành'], ['SupportCases', 'Yêu cầu hỗ trợ']] as const : [['TechnicianWarrantyInbox', 'Công việc bảo hành'], ['SupportCases', 'Yêu cầu hỗ trợ']] as const),
          ] as const
        ).map(([screen, label]) => (
          <TouchableOpacity
            key={screen}
            testID={`task-link-${screen}`}
            accessibilityRole="button"
            onPress={() => navigation.navigate(screen as never)}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              minHeight: 52,
              justifyContent: 'center',
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>{label} ›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </TaskScreenShell>
  );
}
