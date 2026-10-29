import React, { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { paymentStatusLabel } from './payment-status-label';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { goHome } from '../../../components/BackButton';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { quoteMoneyText } from './DecisionSummary';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';
import { HubSection, type HubLink } from './TechnicianOrderHub';
import { Camera, Headset, History, Info, Package, ReceiptText, ShieldCheck, Star, Wrench } from 'lucide-react-native';
import VisitTechnicianPanel from '../technician/VisitTechnicianPanel';
import { backFromFlow } from '../navigation/resume-order';

const DETAILS: HubLink[] = [
  { screen: 'OrderInformation', label: 'Thông tin đơn', Icon: Info },
  { screen: 'InvoiceDetail', label: 'Hóa đơn', Icon: ReceiptText },
  { screen: 'EvidenceGallery', label: 'Ảnh và bằng chứng', Icon: Camera },
  { screen: 'OrderProgressHistory', label: 'Tiến độ', Icon: History },
];
const AFTER_CUSTOMER: HubLink[] = [
  { screen: 'CustomerReview', label: 'Đánh giá dịch vụ', Icon: Star },
  { screen: 'CustomerWarranty', label: 'Bảo hành', Icon: ShieldCheck },
  { screen: 'SupportCases', label: 'Yêu cầu hỗ trợ', Icon: Headset },
];
const AFTER_TECHNICIAN: HubLink[] = [
  { screen: 'PartsLifecycle', label: 'Linh kiện và khai trả', Icon: Package },
  { screen: 'TechnicianWarrantyInbox', label: 'Công việc bảo hành', Icon: Wrench },
  { screen: 'SupportCases', label: 'Yêu cầu hỗ trợ', Icon: Headset },
];

/**
 * C12/T16 — actual COMPLETED only. Links to server invoice/scope/gallery;
 * never writes COMPLETED locally. Customer review belongs to M7.
 */
export default function CompletedOrderScreen({ role }: { role: 'customer' | 'technician' }) {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
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
  const orderCode = order && typeof order.code === 'string' && order.code.trim().length > 0 ? order.code : null;
  const canCopyCode = role === 'customer' && !!orderCode;
  const open = (screen: string) => navigation.navigate(screen as never);

  const copyOrderCode = async () => {
    if (!canCopyCode || !orderCode) return;
    try {
      await Clipboard.setStringAsync(orderCode);
      setCopyMessage('Đã sao chép mã đơn.');
    } catch {
      setCopyMessage('Chưa sao chép được mã đơn. Vui lòng thử lại.');
    }
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Đơn hoàn thành" onBack={() => backFromFlow(navigation)}>
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
      onBack={() => backFromFlow(navigation)}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh,
        onPress: () => { if (canRefresh) void refresh('manual'); },
      }}
      primary={{
        label: role === 'customer' ? 'Về đơn của tôi' : 'Về danh sách công việc',
        testID: 'completed-back-home',
        onPress: goHome,
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <View testID="completed-order-code-row" style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 5 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Mã đơn</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text testID="completed-order-code" selectable style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 }}>
              {orderCode ?? 'Chưa có mã đơn'}
            </Text>
            {canCopyCode ? (
              <TouchableOpacity
                testID="completed-copy-order-code"
                accessibilityRole="button"
                accessibilityLabel="Sao chép mã đơn"
                accessibilityHint="Sao chép mã đơn đầy đủ vào bộ nhớ tạm"
                accessibilityState={{ busy: false, disabled: false }}
                onPress={() => void copyOrderCode()}
                activeOpacity={0.75}
                style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, backgroundColor: colors.primarySoft }}
              >
                <Ionicons name="copy-outline" size={16} color={colors.primaryStrong} />
                <Text style={{ color: colors.primaryStrong, fontSize: 13, fontWeight: '600' }}>Sao chép</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {copyMessage ? (
            <Text
              testID="completed-copy-feedback"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ color: copyMessage.startsWith('Đã') ? colors.success : colors.error, fontSize: 13, lineHeight: 18 }}
            >
              {copyMessage}
            </Text>
          ) : null}
        </View>
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
      {role === 'technician' && <VisitTechnicianPanel section="devices" />}
      <HubSection title="Chi tiết đơn" items={DETAILS} onOpen={open} />
      <HubSection title={role === 'customer' ? 'Sau dịch vụ' : 'Bảo hành và hỗ trợ'} items={role === 'customer' ? AFTER_CUSTOMER : AFTER_TECHNICIAN} onOpen={open} />
    </TaskScreenShell>
  );
}
