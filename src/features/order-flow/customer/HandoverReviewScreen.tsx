import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { hasCompletionRequest } from './payment-facts';
import { handoverSeenKey, markHandoverSeen } from './handover-seen';
import { DetailRow, ReadOnlyNotice, Section, TaskScreenShell } from '../shared/TaskScreenShell';
import { M6InvoiceSummary } from '../shared/M6InvoiceSummary';
import { HubSection, type HubLink } from '../shared/TechnicianOrderHub';
import { Camera, Info, ReceiptText } from 'lucide-react-native';
import { vnDateTimeString } from '../../../utils/vn-time';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

/**
 * C08 — handover review. Shows actual AFTER, completion note, approved scope
 * and invoice links. Navigation-only continue; no acceptance mutation.
 */
const LINKS: HubLink[] = [
  { screen: 'EvidenceGallery', label: 'Ảnh bàn giao', Icon: Camera },
  { screen: 'OrderInformation', label: 'Thông tin đơn', Icon: Info },
  { screen: 'InvoiceDetail', label: 'Chi tiết hóa đơn', Icon: ReceiptText },
];

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
        onPress: () => {
          if (revoked) return;
          markHandoverSeen(handoverSeenKey(order.id, order.completionRequestedAt));
          navigation.navigate('OrderTask');
        },
      }}
    >
      <Section title="Thông tin bàn giao">
        <DetailRow label="Mã đơn" value={order.code} />
        <DetailRow label="Thời điểm bàn giao" value={order.completionRequestedAt ? vnDateTimeString(order.completionRequestedAt) : 'Chưa có thông tin'} />
        {order.completionNote ? <DetailRow label="Ghi chú bàn giao" value={order.completionNote} /> : null}
        <DetailRow
          label="Ảnh sau sửa chữa"
          value={evidence === null ? 'Đang tải…' : evidence.length ? `${evidence.length} ảnh từ máy chủ` : 'Chưa có ảnh sau sửa chữa'}
        />
      </Section>
      {!invoiceReady ? (
        <ReadOnlyNotice>Đang chờ hóa đơn từ máy chủ. Bạn vẫn có thể xem bàn giao; nút tiếp tục đưa bạn về đúng bước hiện tại.</ReadOnlyNotice>
      ) : invoice ? (
        <M6InvoiceSummary invoice={invoice} />
      ) : null}
      <ReadOnlyNotice>Bạn không cần xác nhận đồng ý mới được thanh toán. Cần báo vấn đề, hãy dùng kênh hỗ trợ riêng.</ReadOnlyNotice>
      <HubSection title="Xem thêm" items={LINKS.map(link => ({ ...link, disabled: revoked }))} onOpen={screen => { if (!revoked) navigation.navigate(screen as never); }} />
    </TaskScreenShell>
  );
}
