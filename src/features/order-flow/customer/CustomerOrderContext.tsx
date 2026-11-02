import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Clock, MapPin, MessageCircle, Phone, User } from 'lucide-react-native';
import { isHistoricalOrder, type ServiceOrderItem } from '../../../api/orders.api';
import { useOptionalOrderSession } from '../runtime/OrderSessionProvider';
import { OrderContextSlot, SheetCloseContext } from '../shared/order-context-slot';
import OrderInformationScreen from '../shared/OrderInformationScreen';
import OrderProgressHistoryScreen from '../shared/OrderProgressHistoryScreen';
import { customerActivityStage } from './customer-activity-stage';
import OrderStepBar from './OrderStepBar';
import { findChatForBooking } from '../../../screens/technician/technician-chat-shortcut';
import { sessionLabel } from '../../../utils/booking-session';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

const QUOTE_LABEL: Record<string, string> = { SENT: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };

function useCustomerOrder(): ServiceOrderItem | null {
  const session = useOptionalOrderSession();
  const snapshot = session?.snapshot;
  if (!snapshot || snapshot.key.role !== 'customer' || snapshot.access !== 'current' || snapshot.order.status !== 'ready') return null;
  return isHistoricalOrder(snapshot.order.data) ? null : snapshot.order.data;
}

/** The five steps of the order, kept on screen at every step so the customer always knows where the order is. */
function CustomerOrderStepper() {
  const order = useCustomerOrder();
  if (!order) return null;
  return <View style={styles.stepperWrap}><OrderStepBar step={customerActivityStage({ order }).step} /></View>;
}

type Sheet = 'detail' | 'progress' | null;

/** Technician, appointment, quotation and the shortcuts that used to be separate screens; details open in a sheet, not a new screen. */
function CustomerOrderSummary() {
  const order = useCustomerOrder();
  const navigation = useNavigation<any>();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [openingChat, setOpeningChat] = useState(false);
  // Anything the sheet navigates to (support, chat) opens over the order: close the sheet so it is not left on top.
  useEffect(() => navigation.addListener('blur', () => setSheet(null)), [navigation]);
  if (!order) return null;

  const phone = order.technician?.phoneNumber;
  const quote = order.quotation;
  const quoteLabel = QUOTE_LABEL[String(quote?.status).toUpperCase()];
  const when = order.bookingMode || order.slot
    ? sessionLabel({ bookingMode: order.bookingMode, slot: order.slot, start: order.scheduledAt })
    : vnDateTimeString(order.scheduledAt);
  const openChat = async () => {
    if (openingChat || !order.bookingId) return;
    setOpeningChat(true);
    try {
      const target = await findChatForBooking(order.bookingId);
      if (!target) { Alert.alert('Chưa có cuộc trò chuyện', 'Chưa có cuộc trò chuyện nào cho đơn này.'); return; }
      navigation.navigate('ChatThread', { conversationId: target.conversationId, counterpartName: target.counterpartName, serviceName: target.serviceName });
    } catch {
      Alert.alert('Không mở được', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.');
    } finally {
      setOpeningChat(false);
    }
  };
  const close = () => setSheet(null);
  const shortcut = (label: string, testID: string, onPress: () => void) =>
    <TouchableOpacity key={testID} testID={testID} accessibilityRole="button" onPress={onPress} style={styles.shortcut}>
      <Text numberOfLines={1} style={styles.shortcutText}>{label}</Text>
    </TouchableOpacity>;

  return <View testID="customer-order-summary" style={styles.card}>
    <View style={styles.techRow}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.title}>{order.serviceName}</Text>
        <View style={styles.iconLine} accessible accessibilityLabel={order.technician?.fullName ? `Kỹ thuật viên: ${order.technician.fullName}` : 'Chưa có kỹ thuật viên'}>
          <User size={16} color={colors.textSecondary} strokeWidth={1.75} />
          <Text numberOfLines={1} style={[styles.meta, { flex: 1 }]}>{order.technician?.fullName ?? 'Chưa có kỹ thuật viên'}</Text>
        </View>
      </View>
      {!!phone && <TouchableOpacity testID="order-call-technician" accessibilityRole="button" accessibilityLabel="Gọi kỹ thuật viên"
        onPress={() => void Linking.openURL(`tel:${phone}`)} style={styles.iconBtn}>
        <Phone size={20} color={colors.primaryStrong} strokeWidth={1.75} />
      </TouchableOpacity>}
      {!!order.bookingId && <TouchableOpacity testID="order-open-chat" accessibilityRole="button" accessibilityLabel="Nhắn tin cho kỹ thuật viên"
        accessibilityState={{ disabled: openingChat }} disabled={openingChat} onPress={() => void openChat()} style={[styles.iconBtn, openingChat && { opacity: 0.5 }]}>
        <MessageCircle size={20} color={colors.primaryStrong} strokeWidth={1.75} />
      </TouchableOpacity>}
    </View>
    <View style={styles.iconLine}>
      <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} />
      <Text style={[styles.meta, { flex: 1 }]}>{when}</Text>
    </View>
    {!!order.addressSummary && <View style={styles.iconLine}>
      <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} />
      <Text numberOfLines={1} style={[styles.meta, { flex: 1 }]}>{order.addressSummary}</Text>
    </View>}
    {!!quote && !!quoteLabel && <TouchableOpacity testID="order-quote-chip" accessibilityRole="button" onPress={() => setSheet('detail')} style={styles.quote}>
      <Text numberOfLines={1} style={styles.quoteText}>
        Báo giá {formatVnd((quote.laborTotal ?? 0) + (quote.partsTotal ?? 0))} · {quoteLabel}
      </Text>
    </TouchableOpacity>}
    <View style={styles.shortcuts}>
      {shortcut('Chi tiết đơn', 'order-open-detail', () => setSheet('detail'))}
      {shortcut('Tiến độ', 'order-open-progress', () => setSheet('progress'))}
      {shortcut('Hỗ trợ', 'order-open-support', () => navigation.navigate('SupportCases'))}
    </View>
    <Modal visible={sheet !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SheetCloseContext.Provider value={close}>
        {sheet === 'detail' && <OrderInformationScreen />}
        {sheet === 'progress' && <OrderProgressHistoryScreen />}
      </SheetCloseContext.Provider>
    </Modal>
  </View>;
}

const slot = { Stepper: CustomerOrderStepper, Summary: CustomerOrderSummary };
export function CustomerOrderContextProvider({ children }: { children: React.ReactNode }) {
  return <OrderContextSlot.Provider value={slot}>{children}</OrderContextSlot.Provider>;
}

const styles = StyleSheet.create({
  stepperWrap: { paddingHorizontal: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: 6 },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  quote: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: colors.tone.warning.bg },
  quoteText: { color: colors.tone.warning.text, fontSize: 14, fontWeight: '600' },
  shortcuts: { flexDirection: 'row', gap: 8, marginTop: 4 },
  shortcut: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  shortcutText: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600' },
});
