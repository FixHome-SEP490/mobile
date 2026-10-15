import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { isHistoricalOrder } from '../../../api/orders.api';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { findChatForBooking } from '../../../screens/technician/technician-chat-shortcut';

export default function OrderInformationScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading';
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const history = snapshot?.access === 'historical' && snapshot.key.role === 'technician' && !!orderValue && isHistoricalOrder(orderValue);
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const [openingChat, setOpeningChat] = useState(false);
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
  const historicalOrder = history && orderValue && isHistoricalOrder(orderValue) ? orderValue : null;
  return <TaskScreenShell title="Thông tin đơn" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {!order && <ReadOnlyNotice>{snapshot?.access === 'revoked' ? 'Quyền truy cập đã thay đổi; dữ liệu đơn đã được xóa.' : 'Đang tải hoặc chưa có quyền xem dữ liệu đơn.'}</ReadOnlyNotice>}
    {historicalOrder && <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
      <DetailRow label="Mã đơn" value={historicalOrder.code} />
      <DetailRow label="Trạng thái" value={historicalOrder.status} />
      <DetailRow label="Tạo lúc" value={vnDateTimeString(historicalOrder.createdAt)} />
      <DetailRow label="Hoàn tất lúc" value={historicalOrder.completedAt ? vnDateTimeString(historicalOrder.completedAt) : 'Không có dữ liệu'} />
      <DetailRow label="Hủy lúc" value={historicalOrder.cancelledAt ? vnDateTimeString(historicalOrder.cancelledAt) : 'Không có dữ liệu'} />
      <DetailRow label="Mã đơn dịch vụ" value={historicalOrder.id} />
      <DetailRow label="Loại bản ghi" value="Đơn lịch sử rút gọn" />
    </View>}
    {order && !history && <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
      <DetailRow label="Mã đơn" value={order.code} />
      <DetailRow label="Dịch vụ" value={order.serviceName} />
      <DetailRow label="Trạng thái" value={order.status} />
      <DetailRow label="Lịch hẹn" value={vnDateTimeString(order.scheduledAt)} />
      <DetailRow label="Địa chỉ" value={order.addressSummary} />
      <DetailRow label="Hình thức giá" value={order.pricingMode} />
      <DetailRow label="Tổng tiền máy chủ trả về" value={formatVnd(typeof order.grandTotal === 'number' ? order.grandTotal : Number.isFinite(Number(order.grandTotal)) ? Number(order.grandTotal) : undefined)} />
      {order.scopeDescription ? <DetailRow label="Phạm vi ban đầu" value={order.scopeDescription} /> : null}
    </View>}
    {order && !history ? <View style={{ gap: 8 }}>
      {order.bookingId ? <Pressable testID="order-chat-entry" accessibilityRole="button" disabled={openingChat} onPress={() => void openChat(order.bookingId)} style={entry}><Text style={entryText}>{openingChat ? 'Đang mở…' : 'Nhắn tin ›'}</Text></Pressable> : null}
      <Pressable testID="order-support-entry" accessibilityRole="button" onPress={() => navigation.navigate('SupportCases')} style={entry}><Text style={entryText}>Yêu cầu hỗ trợ ›</Text></Pressable>
      <Pressable testID="order-cancel-entry" accessibilityRole="button" onPress={() => navigation.navigate('OrderException')} style={entry}><Text style={entryText}>Hủy đơn hoặc kiểm tra điều kiện ›</Text></Pressable>
    </View> : null}
  </TaskScreenShell>;
}

const entry = { minHeight: 52, justifyContent: 'center' as const, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border };
const entryText = { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' as const };
