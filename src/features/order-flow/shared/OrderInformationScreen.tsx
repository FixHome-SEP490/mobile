import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { isHistoricalOrder } from '../../../api/orders.api';
import { DetailRow, ReadOnlyNotice, Section, TaskScreenShell } from './TaskScreenShell';
import { HubSection, type HubLink } from './TechnicianOrderHub';
import { CalendarClock, Headset, MessageCircle, Repeat, XCircle } from 'lucide-react-native';
import OrderCostHistory from './OrderCostHistory';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import RebookSheet from '../../../components/RebookSheet';
import AcceptedRescheduleSheet from '../../../components/AcceptedRescheduleSheet';
import { serviceOrderStatusView } from '../../../screens/technician/technician-status';
import { sessionLabel } from '../../../utils/booking-session';
import { findChatForBooking } from '../../../screens/technician/technician-chat-shortcut';

const PRICING_LABELS: Record<string, string> = {
  FIXED_PRICE: 'Giá cố định',
  INSPECTION_REQUIRED: 'Báo giá sau khi kiểm tra',
};

export default function OrderInformationScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading';
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const history = snapshot?.access === 'historical' && snapshot.key.role === 'technician' && !!orderValue && isHistoricalOrder(orderValue);
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const [openingChat, setOpeningChat] = useState(false);
  const [rebookOpen, setRebookOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const canRebook = snapshot?.key.role === 'customer' && !!order?.bookingId && ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase());
  // Same rule as the web: the technician accepted but has not set out yet.
  const canReschedule = snapshot?.key.role === 'customer' && !!order?.bookingId && String(order.status).toUpperCase() === 'ACCEPTED';
  const openChat = async (bookingId: string) => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const target = await findChatForBooking(bookingId);
      if (!target) { Alert.alert('Chưa có cuộc trò chuyện', 'Chưa có cuộc trò chuyện nào cho đơn này.'); return; }
      navigation.navigate('ChatThread', { conversationId: target.conversationId, counterpartName: target.counterpartName, serviceName: target.serviceName });
    } catch {
      Alert.alert('Không mở được', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.');
    } finally {
      setOpeningChat(false);
    }
  };
  const copyOrderCode = async (code: string) => {
    if (snapshot?.key.role !== 'customer' || !code.trim()) return;
    try {
      await Clipboard.setStringAsync(code);
      setCopyMessage('Đã sao chép mã đơn.');
    } catch {
      setCopyMessage('Không thể sao chép mã đơn.');
    }
  };
  const actions: HubLink[] = [
    ...(order?.bookingId ? [{ screen: 'chat', testID: 'order-chat-entry', label: openingChat ? 'Đang mở…' : 'Nhắn tin', Icon: MessageCircle, disabled: openingChat, onPress: () => void openChat(order.bookingId) }] : []),
    ...(canReschedule ? [{ screen: 'reschedule', testID: 'order-reschedule-entry', label: 'Đổi lịch hẹn', Icon: CalendarClock, onPress: () => setRescheduleOpen(true) }] : []),
    ...(canRebook ? [{ screen: 'rebook', testID: 'order-rebook-entry', label: 'Đặt lại thợ', Icon: Repeat, onPress: () => setRebookOpen(true) }] : []),
    { screen: 'SupportCases', testID: 'order-support-entry', label: 'Yêu cầu hỗ trợ', Icon: Headset },
    { screen: 'OrderException', testID: 'order-cancel-entry', label: 'Hủy đơn hoặc kiểm tra điều kiện', Icon: XCircle },
  ];
  const historicalOrder = history && orderValue && isHistoricalOrder(orderValue) ? orderValue : null;
  return <TaskScreenShell title="Thông tin đơn" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {!order && <ReadOnlyNotice>{snapshot?.access === 'revoked' ? 'Quyền truy cập đã thay đổi; dữ liệu đơn đã được xóa.' : 'Đang tải hoặc chưa có quyền xem dữ liệu đơn.'}</ReadOnlyNotice>}
    {historicalOrder && <Section title="Đơn lịch sử">
      <DetailRow label="Mã đơn" value={historicalOrder.code} />
      <DetailRow label="Trạng thái" value={serviceOrderStatusView(historicalOrder.status).label} />
      <DetailRow label="Tạo lúc" value={vnDateTimeString(historicalOrder.createdAt)} />
      <DetailRow label="Hoàn tất lúc" value={historicalOrder.completedAt ? vnDateTimeString(historicalOrder.completedAt) : 'Không có dữ liệu'} />
      <DetailRow label="Hủy lúc" value={historicalOrder.cancelledAt ? vnDateTimeString(historicalOrder.cancelledAt) : 'Không có dữ liệu'} />
      <DetailRow label="Mã đơn dịch vụ" value={historicalOrder.id} />
      <DetailRow label="Loại bản ghi" value="Đơn lịch sử rút gọn" />
    </Section>}
    {order && !history && <>
      <Section title="Đơn hàng">
      {snapshot?.key.role === 'customer' && order.code ? (
        <View style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 5 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Mã đơn</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text selectable style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 }}>{order.code}</Text>
            <Pressable testID="order-code-copy" accessibilityRole="button" accessibilityLabel="Sao chép mã đơn" onPress={() => void copyOrderCode(order.code)}
              style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, backgroundColor: colors.primarySoft }}>
              <Ionicons name="copy-outline" size={16} color={colors.primaryStrong} />
              <Text style={{ color: colors.primaryStrong, fontSize: 13, fontWeight: '600' }}>Sao chép</Text>
            </Pressable>
          </View>
          {copyMessage ? <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, fontSize: 13 }}>{copyMessage}</Text> : null}
        </View>
      ) : <DetailRow label="Mã đơn" value={order.code} />}
      <DetailRow label="Dịch vụ" value={order.serviceName} />
      <DetailRow label="Trạng thái" value={serviceOrderStatusView(order.status).label} />
      <DetailRow label="Lịch hẹn" value={order.bookingMode || order.slot ? sessionLabel({ bookingMode: order.bookingMode, slot: order.slot, start: order.scheduledAt }) : vnDateTimeString(order.scheduledAt)} />
      <DetailRow label="Địa chỉ" value={order.addressSummary} />
      </Section>
      <Section title="Liên hệ">
      {snapshot?.key.role === 'customer'
        ? <DetailRow label="Kỹ thuật viên" value={order.technician ? [order.technician.fullName, order.technician.phoneNumber].filter(Boolean).join(' · ') : 'Chưa có kỹ thuật viên'} />
        : <DetailRow label="Khách hàng" value={[order.customerName, order.customerPhone].filter(Boolean).join(' · ') || 'Chưa có thông tin'} />}
      {order.customerNote ? <DetailRow label="Ghi chú của khách" value={order.customerNote} /> : null}
      </Section>
      <Section title="Giá và bảo hành">
      <DetailRow label="Hình thức giá" value={PRICING_LABELS[String(order.pricingMode ?? '').toUpperCase()] ?? 'Chưa xác định'} />
      {String(order.pricingMode ?? '').toUpperCase() === 'FIXED_PRICE' ? <>
        <DetailRow label="Giá đã chốt" value={formatVnd(order.fixedUnitPrice)} />
        <DetailRow label="Số lượng" value={order.quantity ?? 'Chưa có dữ liệu'} />
      </> : null}
      {order.laborWarrantyDays ?<DetailRow label="Bảo hành tiền công" value={`${order.laborWarrantyDays} ngày`} /> : null}
      <DetailRow label="Tổng tiền" value={formatVnd(typeof order.grandTotal === 'number' ? order.grandTotal : Number.isFinite(Number(order.grandTotal)) ? Number(order.grandTotal) : undefined)} />
      </Section>
      {order.scopeDescription ? <Section title="Phạm vi ban đầu"><DetailRow label="Nội dung" value={order.scopeDescription} /></Section> : null}
    </>}
    {order && !history ? <OrderCostHistory /> : null}
    {order && !history ? <HubSection title="Thao tác" items={actions} onOpen={screen => navigation.navigate(screen as never)} /> : null}
    {canReschedule ? <AcceptedRescheduleSheet bookingId={order!.bookingId} current={{ bookingMode: order!.bookingMode, slot: order!.slot, start: order!.scheduledAt }} visible={rescheduleOpen} onClose={() => setRescheduleOpen(false)} onDone={() => void refresh('manual')} /> : null}
    {canRebook ? <RebookSheet bookingId={order!.bookingId} visible={rebookOpen} onClose={() => setRebookOpen(false)} /> : null}
  </TaskScreenShell>;
}

