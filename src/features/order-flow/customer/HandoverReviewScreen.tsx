import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { hasCompletionRequest } from './payment-facts';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { M6InvoiceSummary } from '../shared/M6InvoiceSummary';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

/**
 * C08 — handover review. Shows actual AFTER, completion note, approved scope
 * and invoice links. Navigation-only continue; no acceptance mutation.
 */
export default function HandoverReviewScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  useLoadUnloadedResources(snapshot, ['evidence', 'invoice', 'cash'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && snapshot.key.userId === key.userId
    && snapshot.key.serviceOrderId === key.serviceOrderId && key.role === 'customer'
    && order.id === key.serviceOrderId && hasCompletionRequest(order);
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.invoice.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const evidence = snapshot?.resources.evidence.status === 'ready'
    ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.type === 'AFTER')
    : null;
  const invoice = snapshot?.resources.invoice.status === 'ready' ? snapshot.resources.invoice.data : null;
  const invoiceReady = !!invoice;
  const revoked = !current;

  if (!current || !order) {
    return (
      <TaskScreenShell title="Bàn giao" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Thông tin bàn giao không được tải cho đơn lịch sử.'
            : 'Bàn giao chỉ hiển thị sau khi máy chủ xác minh quyền xem đơn hiện tại và kỹ thuật viên gửi yêu cầu bàn giao.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Bàn giao"
      stage={4}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh,
        onPress: () => { if (canRefresh) void refresh('manual'); },
      }}
      primary={{
        label: 'Tiếp tục thanh toán',
        testID: 'handover-continue-payment',
        disabled: revoked,
        accessibilityHint: 'Trở về bước thanh toán hiện tại theo trạng thái máy chủ',
        onPress: () => { if (!revoked) navigation.navigate('OrderTask'); },
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order.code} />
        <DetailRow label="Thời điểm bàn giao" value={order.completionRequestedAt ? vnDateTimeString(order.completionRequestedAt) : 'Chưa có thông tin'} />
        {order.completionNote ? <DetailRow label="Ghi chú bàn giao" value={order.completionNote} /> : null}
        <DetailRow
          label="Ảnh sau sửa chữa"
          value={evidence === null ? 'Đang tải…' : evidence.length ? `${evidence.length} ảnh từ máy chủ` : 'Chưa có ảnh sau sửa chữa'}
        />
      </View>
      {!invoiceReady ? (
        <ReadOnlyNotice>Đang chờ hóa đơn từ máy chủ. Bạn vẫn có thể xem bàn giao; nút tiếp tục đưa bạn về đúng bước hiện tại.</ReadOnlyNotice>
      ) : invoice ? (
        <M6InvoiceSummary invoice={invoice} />
      ) : null}
      <ReadOnlyNotice>Bạn không cần xác nhận đồng ý mới được thanh toán. Cần báo vấn đề, hãy dùng kênh hỗ trợ riêng.</ReadOnlyNotice>
      <View style={{ gap: 8 }}>
        {(
          [
            ['EvidenceGallery', 'Xem ảnh bàn giao'],
            ['OrderInformation', 'Xem thông tin đơn'],
            ['InvoiceDetail', 'Xem hóa đơn'],
          ] as const
        ).map(([screen, label]) => (
          <TouchableOpacity
            key={screen}
            testID={`task-link-${screen}`}
            accessibilityRole="button"
            disabled={revoked}
            onPress={() => { if (!revoked) navigation.navigate(screen as never); }}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              minHeight: 52,
              justifyContent: 'center',
              paddingHorizontal: spacing.md,
              opacity: revoked ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>{label} ›</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        Tổng thanh toán dự kiến: {invoice ? quoteMoneyText(invoice.grandTotal) : 'Chưa có dữ liệu'}
      </Text>
    </TaskScreenShell>
  );
}
