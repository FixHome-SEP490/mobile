import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Clock, MapPin, MessageCircle, Phone, User } from 'lucide-react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import BackButton, { HomeButton } from '../../components/BackButton';
import OrderStepBar from '../../features/order-flow/customer/OrderStepBar';
import { findChatForBooking } from '../technician/technician-chat-shortcut';
import BookingRescheduleSheet from '../../components/BookingRescheduleSheet';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { customerWalletApi, wholeVnd } from '../../api/customer-wallet.api';
import { ordersApi } from '../../api/orders.api';
import { visitGroupsApi, type Visit, type VisitCheckout, type VisitDeviceState } from '../../api/visit-groups.api';
import { useAppTheme, type ToneName } from '../../constants/theme';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import type { RootStackParamList } from '../../types';
import { sessionLabel, type BookingSchedule } from '../../utils/booking-session';
import { formatVnd } from '../../utils/format';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { failedBookingIds } from './failed-repair-rebook';
import { fundedCheckoutApi } from '../../api/funded-checkout.api';
import VoucherCheckoutSection from '../../features/order-flow/customer/VoucherCheckoutSection';
import { secondsLeft, type AppliedVoucher } from '../../features/order-flow/customer/voucher-checkout';
import {
  canStartVisitPayment,
  needsQuoteDecision,
  resolveVisitCheckoutState,
  visitActions,
  visitStep,
  visitDeviceStatusText,
  visitPayMethods,
  type VisitPayMethod,
} from './customer-visit';

type VisitRoute = RouteProp<RootStackParamList, 'CustomerVisit'>;
type Message = { type: 'success' | 'error'; text: string };

const PAY_LABEL: Record<VisitPayMethod, string> = { wallet: 'Ví FixHome', vnpay: 'Thanh toán qua VNPay', cash: 'Tiền mặt' };
const DEVICE_TONE: Record<VisitDeviceState, ToneName> = { succeeded: 'success', failed: 'danger', quote_declined: 'neutral', cancelled: 'neutral', open: 'repair' };

export default function CustomerVisitScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { visitGroupId } = useRoute<VisitRoute>().params;
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  const [visit, setVisit] = useState<Visit | null>(null);
  const [checkout, setCheckout] = useState<VisitCheckout | null>(null);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string> | null>(null);
  const [orderReadIncomplete, setOrderReadIncomplete] = useState(false);
  const [technician, setTechnician] = useState<{ fullName: string; phoneNumber?: string } | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [quoteOrderBySequence, setQuoteOrderBySequence] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [truncated, setTruncated] = useState<Record<string, boolean>>({});
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<VisitPayMethod>('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  // Set after the VNPay page was opened; only a fresh read of the visit can say whether it was paid.
  const [vnpayOpened, setVnpayOpened] = useState(false);
  // A voucher held for the whole visit; the amounts are the server's.
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (mode: 'first' | 'refresh' = 'refresh') => {
    const mine = ++generation.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const nextVisit = await visitGroupsApi.get(visitGroupId);
      if (mine !== generation.current) return;
      setVisit(nextVisit);
      setLoadError('');
      let nextCheckout: VisitCheckout | null = null;
      try {
        nextCheckout = await visitGroupsApi.getCheckout(visitGroupId);
        if (mine === generation.current) setCheckoutError('');
      } catch {
        if (mine === generation.current) setCheckoutError('Chưa tải được thông tin thanh toán. Vui lòng thử lại.');
      }
      if (mine !== generation.current) return;
      setCheckout(nextCheckout);
      // Each device order tells whether repair has started and whether a quotation waits for the customer.
      const orderIds = [...new Set((nextCheckout?.devices ?? []).flatMap((d) => (d.serviceOrderId?.trim() ? [d.serviceOrderId.trim()] : [])))].slice(0, 3);
      if (orderIds.length === 0) {
        setOrderStatuses({}); setQuoteOrderBySequence({}); setOrderReadIncomplete(false); setTechnician(null);
        return;
      }
      const results = await Promise.allSettled(orderIds.map((id) => ordersApi.getOrder(id)));
      if (mine !== generation.current) return;
      const statuses: Record<string, string> = {};
      const quotes: Record<number, string> = {};
      let incomplete = false;
      let tech: { fullName: string; phoneNumber?: string } | null = null;
      results.forEach((result, index) => {
        const device = nextCheckout!.devices.find((d) => d.serviceOrderId?.trim() === orderIds[index]);
        if (result.status !== 'fulfilled' || result.value?.id !== orderIds[index]) { incomplete = true; return; }
        statuses[orderIds[index]] = result.value.status;
        if (!tech && result.value.technician?.fullName) tech = { fullName: result.value.technician.fullName, phoneNumber: result.value.technician.phoneNumber };
        if (device && needsQuoteDecision(result.value)) quotes[device.sequence] = orderIds[index];
      });
      setOrderStatuses(statuses); setQuoteOrderBySequence(quotes); setOrderReadIncomplete(incomplete); setTechnician(tech);
    } catch (error) {
      if (mine === generation.current) setLoadError(extractApiErrorMessage(error, 'Không tải được lượt sửa. Vui lòng thử lại.'));
    } finally {
      if (mine === generation.current) { setLoading(false); setRefreshing(false); }
    }
  }, [visitGroupId]);

  const loadWallet = useCallback(async () => {
    try {
      const wallet = await customerWalletApi.getSummary({ page: 1, pageSize: 1 });
      setWalletBalance(wholeVnd(wallet.balance));
    } catch {
      setWalletBalance(null);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load('first'); void loadWallet(); }, [load, loadWallet]));
  // A technician taking the visit, an outcome or a payment all show up here at once; poll only while the socket is down.
  useLiveRefresh(['order:updated', 'booking:updated', 'notification:new', 'realtime:resync'], () => { void load(); }, undefined, { pollMs: 20_000 });

  const actions = visit ? visitActions({ visit, checkout, orderStatuses, orderReadIncomplete }) : null;
  const lead = visit?.items.find((item) => item.booking?.id === visit.leadBookingId)?.booking ?? null;
  const devices = visit?.items ?? [];
  const resolved = checkout ? checkout.devices.filter((d) => d.state !== 'open').length : 0;
  // With a held voucher the visit is paid at the server-calculated due; a cash declaration made against it keeps the hold past the 15 minutes.
  const held = voucher && voucher.scopeId === visitGroupId && !checkout?.paid && (!!checkout?.pendingCash || secondsLeft(voucher) > 0) ? voucher : null;
  const payable = held ? held.customerDueVnd : checkout?.total ?? 0;
  const methods = visitPayMethods(payable);
  const method = methods.includes(payMethod) ? payMethod : 'wallet';
  const baseState = resolveVisitCheckoutState(checkout, method, walletBalance);
  const payState = held && checkout && ['ready', 'vnpay', 'wallet_short'].includes(baseState)
    ? (payable <= 0 ? 'ready' : resolveVisitCheckoutState({ ...checkout, total: payable }, method, walletBalance))
    : baseState;
  const fullyFunded = !!held && payable === 0;
  const scope = { kind: 'VISIT_GROUP' as const, id: visitGroupId };
  const priorityQuote = devices.map((item) => ({ item, orderId: quoteOrderBySequence[item.sequence] })).find((entry) => entry.orderId);

  const failedIds = failedBookingIds(devices, checkout?.devices);
  const deviceOf = (bookingId: string | undefined) => checkout?.devices.find((d) => d.bookingId === bookingId) ?? null;
  const statusOf = (item: Visit['items'][number]) => {
    const device = deviceOf(item.booking?.id);
    return visitDeviceStatusText({
      visit: visit!, deviceState: device?.state, hasOrder: !!device?.serviceOrderId,
      quoteWaiting: !!quoteOrderBySequence[item.sequence], leadStatus: lead?.status,
    });
  };

  // One write at a time. A failed or unclear write is followed by a fresh read, so the screen shows what the server holds.
  const run = async (action: () => Promise<string | void>, failure: string) => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ type: 'success', text: done });
    } catch (error) {
      setMessage({ type: 'error', text: extractApiErrorMessage(error, failure) });
    } finally {
      setBusy(false);
      void load(); void loadWallet();
    }
  };

  const openReschedule = () => { setSchedule(null); setRescheduleError(null); setRescheduleOpen(true); };
  const saveReschedule = async () => {
    if (schedule?.mode !== 'scheduled' || busy) return;
    setBusy(true); setRescheduleError(null);
    try {
      await visitGroupsApi.reschedule(visitGroupId, { date: schedule.date, slot: schedule.slot });
      setRescheduleOpen(false);
      setMessage({ type: 'success', text: 'Đã đổi lịch hẹn cho cả lượt sửa.' });
      void load();
    } catch (error) {
      setRescheduleError(extractApiErrorMessage(error, 'Chưa đổi được lịch. Vui lòng chọn buổi khác.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = () => Alert.alert(
    'Hủy cả lượt sửa?',
    `Tất cả ${devices.length} thiết bị trong lượt này sẽ bị hủy cùng lúc. Nếu thợ đã nhận lịch, điểm uy tín của bạn có thể bị trừ.`,
    [
      { text: 'Giữ lại lượt sửa', style: 'cancel' },
      { text: 'Hủy lượt sửa', style: 'destructive', onPress: () => void run(async () => { await visitGroupsApi.cancel(visitGroupId, 'Khách hủy lượt sửa'); return 'Đã hủy lượt sửa.'; }, 'Chưa hủy được lượt sửa.') },
    ],
  );

  const pay = () => {
    if (!checkout || !canStartVisitPayment(payState)) return;
    if (held && fullyFunded) {
      void run(async () => {
        await fundedCheckoutApi.zero(scope, held.reservationId);
        setVoucher(null);
        return 'Voucher đã trả đủ cho cả lượt, bạn không phải trả thêm.';
      }, 'Chưa xác nhận được thanh toán 0 ₫. Voucher vẫn được giữ đến khi hết hạn; chưa ghi nhận thanh toán.');
    } else if (method === 'wallet') {
      if (payState === 'wallet_short' || walletBalance === null || walletBalance < payable) return;
      void run(async () => {
        const result = held ? await fundedCheckoutApi.wallet(scope, held.reservationId) : await visitGroupsApi.payWithWallet(visitGroupId);
        if (held) setVoucher(null);
        return `Đã thanh toán ${formatVnd(result.amount)} bằng ví cho cả lượt.`;
      }, 'Chưa thanh toán được bằng ví.');
    } else if (method === 'vnpay') {
      void run(async () => {
        const url = held ? await fundedCheckoutApi.vnpay(scope, held.reservationId) : await visitGroupsApi.createVnpayUrl(visitGroupId);
        setVnpayOpened(true);
        await WebBrowser.openAuthSessionAsync(url, 'fixhome://');
        // Coming back from VNPay is not a payment: the read after this step decides.
        return 'Đang chờ VNPay xác nhận. Nếu chưa thấy "Đã thanh toán", chạm "Kiểm tra thanh toán".';
      }, 'Chưa mở được trang thanh toán VNPay. Vui lòng thử lại.');
    }
  };

  const answerCash = (agreed: boolean) => void run(async () => {
    if (held) {
      await fundedCheckoutApi.confirmCash(scope, held.reservationId, agreed ? { agreed: true } : { agreed: false, disputeReason: 'Số tiền mặt chưa đúng' });
      if (agreed) setVoucher(null);
    } else {
      await visitGroupsApi.confirmCash(visitGroupId, agreed, agreed ? undefined : 'Số tiền mặt chưa đúng');
    }
    return agreed ? 'Đã xác nhận trả tiền mặt cho cả lượt.' : 'Đã báo FixHome kiểm tra lại số tiền mặt.';
  }, agreed ? 'Chưa xác nhận được.' : 'Chưa gửi được yêu cầu kiểm tra tiền mặt. Vui lòng thử lại.');

  const tone = (name: ToneName) => colors.tone[name];

  const openChat = async () => {
    if (openingChat || !lead) return;
    setOpeningChat(true);
    try {
      const target = await findChatForBooking(lead.id);
      if (!target) { Alert.alert('Chưa có cuộc trò chuyện', 'Chưa có cuộc trò chuyện nào cho lượt sửa này.'); return; }
      navigation.navigate('ChatThread', { conversationId: target.conversationId, counterpartName: target.counterpartName, serviceName: target.serviceName });
    } catch {
      Alert.alert('Không mở được', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.');
    } finally {
      setOpeningChat(false);
    }
  };

  // The one thing to do now stays at the bottom, so it is never found by scrolling past every device.
  const canPay = (payState === 'ready' || payState === 'vnpay' || payState === 'wallet_short') && (fullyFunded || method !== 'cash');
  const footerPrimary = !visit || visit.status === 'cancelled' ? undefined
    : priorityQuote ? {
      label: 'Xem và duyệt báo giá', testID: 'visit-quote-shortcut',
      onPress: () => navigation.navigate('CustomerOrderDetail', { serviceOrderId: priorityQuote.orderId }),
    }
      : actions?.canChooseTechnician && lead ? {
        label: lead.status === 'CLOSED' ? 'Chọn kỹ thuật viên khác cho cả lượt' : `Chọn 1 kỹ thuật viên sửa cả ${visit.items.length} thiết bị`,
        testID: 'visit-choose-technician',
        onPress: () => navigation.navigate('CustomerMatching', { bookingId: lead.id, visitGroupId }),
      }
        : checkout && canPay ? {
          label: busy ? 'Đang xử lý…' : fullyFunded ? 'Xác nhận thanh toán 0 ₫' : method === 'vnpay' ? 'Thanh toán qua VNPay' : `Thanh toán ${formatVnd(payable)}`,
          testID: 'visit-pay-submit', disabled: busy || payState === 'wallet_short', onPress: pay,
        }
          : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <BackButton />
        <Text accessibilityRole="header" style={styles.headerTitle}>Lượt sửa nhiều thiết bị</Text>
        <HomeButton />
      </View>

      {loading ? (
        <View style={styles.body}><CustomerSkeleton variant="booking" rows={3} /></View>
      ) : !visit ? (
        <View style={styles.center}>
          <Text style={styles.errorText} accessibilityRole="alert">{loadError || 'Không tải được lượt sửa. Vui lòng thử lại.'}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { setLoading(true); void load('first'); }} accessibilityRole="button">
            <Text style={styles.primaryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
        <ScrollView style={styles.flex} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
          {!!loadError && <Text style={styles.errorText} accessibilityRole="alert">{loadError}</Text>}
          {message && (
            <View style={[styles.banner, { backgroundColor: tone(message.type === 'success' ? 'success' : 'danger').bg }]} accessibilityRole="alert" testID="visit-message">
              <Text style={{ color: tone(message.type === 'success' ? 'success' : 'danger').text, fontSize: 14, lineHeight: 20 }}>{message.text}</Text>
            </View>
          )}

          {visit.status !== 'cancelled' && <OrderStepBar step={visitStep({ payState, orderStatuses })} />}
          <View style={styles.card} testID="visit-summary">
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Lượt sửa · {devices.length} thiết bị</Text>
                <View style={styles.iconLine} accessible accessibilityLabel={technician ? `Kỹ thuật viên: ${technician.fullName}` : 'Chưa có kỹ thuật viên'}>
                  <User size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.lineIcon} />
                  <Text style={[styles.hint, styles.flex]} numberOfLines={1}>{technician ? technician.fullName : 'Chưa có kỹ thuật viên'}</Text>
                </View>
              </View>
              {!!technician?.phoneNumber && (
                <TouchableOpacity style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Gọi kỹ thuật viên" testID="visit-call"
                  onPress={() => void Linking.openURL(`tel:${technician.phoneNumber}`)}>
                  <Phone size={20} color={colors.primaryStrong} strokeWidth={1.75} />
                </TouchableOpacity>
              )}
              {!!technician && !!lead && (
                <TouchableOpacity style={[styles.iconBtn, openingChat && styles.disabled]} accessibilityRole="button" accessibilityLabel="Nhắn tin cho kỹ thuật viên"
                  accessibilityState={{ disabled: openingChat }} disabled={openingChat} testID="visit-chat" onPress={() => void openChat()}>
                  <MessageCircle size={20} color={colors.primaryStrong} strokeWidth={1.75} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.iconLine}>
              <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.lineIcon} />
              <Text style={[styles.value, styles.flex]} testID="visit-schedule">
                {sessionLabel({ bookingMode: visit.bookingMode, slot: visit.slot, start: visit.preferredStartAt })}
              </Text>
            </View>
            {!!lead?.addressSummary && (
              <View style={styles.iconLine}>
                <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.lineIcon} />
                <Text style={[styles.hint, styles.flex]} numberOfLines={2}>{lead.addressSummary}</Text>
              </View>
            )}
            {visit.status === 'cancelled'
              ? <Text style={styles.hint}>Lượt sửa đã hủy.</Text>
              : checkout && (
                <View style={styles.iconLine}>
                  <CheckCircle2 size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.lineIcon} />
                  <Text style={[styles.hint, styles.flex]}>Kết quả {resolved}/{checkout.devices.length} máy</Text>
                </View>
              )}
          </View>

          <Text style={styles.section}>Thiết bị trong lượt ({devices.length})</Text>
          {devices.map((item) => {
            const device = deviceOf(item.booking?.id);
            const t = tone(DEVICE_TONE[device?.state ?? 'open']);
            const description = item.booking?.description?.trim();
            const open = expanded[item.id] === true;
            return (
              <View key={item.id} style={styles.card} testID={`visit-device-${item.sequence}`}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle} numberOfLines={2}>Máy {item.sequence}: {item.booking?.serviceName || device?.serviceName || item.deviceLabel || 'Thiết bị'}</Text>
                  <View style={[styles.chip, { backgroundColor: t.bg }]}>
                    <Text style={[styles.chipText, { color: t.text }]}>{statusOf(item)}</Text>
                  </View>
                </View>
                {!!description && (
                  <TouchableOpacity style={styles.toggle} onPress={() => setExpanded((cur) => ({ ...cur, [item.id]: !open }))} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <Text
                      style={styles.hint}
                      numberOfLines={open ? undefined : 2}
                      onTextLayout={(e) => { if (e.nativeEvent.lines.length > 2 && !truncated[item.id]) setTruncated((cur) => ({ ...cur, [item.id]: true })); }}
                    >{description}</Text>
                    {truncated[item.id] && <Text style={[styles.link, { color: colors.primaryStrong }]}>{open ? 'Thu gọn' : 'Xem mô tả'}</Text>}
                  </TouchableOpacity>
                )}
                {device?.state === 'failed' && !!item.booking?.id && (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => navigation.navigate('CustomerFailedRepairRebook', { sourceBookingIds: [item.booking!.id] })}
                    accessibilityRole="button"
                    testID={`visit-rebook-${item.sequence}`}
                  >
                    <Text style={styles.primaryText}>Đặt lại máy này</Text>
                  </TouchableOpacity>
                )}
                {!!device?.serviceOrderId && !!quoteOrderBySequence[item.sequence] && (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: device.serviceOrderId! })}
                    accessibilityRole="button"
                    accessibilityLabel={`Xem và duyệt báo giá máy ${item.sequence}`}
                    testID={`visit-quote-${item.sequence}`}
                  >
                    <Text style={styles.primaryText}>Xem và duyệt báo giá</Text>
                  </TouchableOpacity>
                )}
                {!!device?.serviceOrderId && !quoteOrderBySequence[item.sequence] && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: device.serviceOrderId! })}
                    accessibilityRole="button"
                    accessibilityLabel={`Xem đơn của máy ${item.sequence}`}
                  >
                    <Text style={styles.secondaryText}>Xem đơn sửa chữa</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {failedIds.length > 1 && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('CustomerFailedRepairRebook', { sourceBookingIds: failedIds })}
              accessibilityRole="button"
              testID="visit-rebook-all"
            >
              <Text style={styles.primaryText}>Đặt lại {failedIds.length} máy không sửa được</Text>
            </TouchableOpacity>
          )}

          {checkout && visit.status !== 'cancelled' && (
            <View style={styles.card} testID="visit-payment">
              <Text style={styles.cardTitle}>Thanh toán cả lượt</Text>
              {!!checkoutError && <Text style={styles.errorText} accessibilityRole="alert">{checkoutError}</Text>}
              <View style={{ gap: 4 }}>
                {checkout.devices.map((d) => (
                  <View key={d.bookingId} style={styles.row}>
                    <Text style={styles.hint}>Máy {d.sequence}</Text>
                    <Text style={styles.value}>{d.state === 'open' ? 'Chờ kết quả' : formatVnd(d.amount)}</Text>
                  </View>
                ))}
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{held ? 'Tổng gốc' : 'Tổng cộng'}</Text>
                  <Text style={styles.cardTitle} testID="visit-total">{payState === 'waiting' ? '—' : formatVnd(checkout.total)}</Text>
                </View>
                {held ? (
                  <>
                    <View style={styles.row}><Text style={styles.hint}>Voucher giảm</Text><Text style={styles.value}>{`- ${formatVnd(held.discountVnd)}`}</Text></View>
                    <View style={styles.row}><Text style={styles.cardTitle}>Bạn trả</Text><Text style={styles.cardTitle} testID="visit-due">{formatVnd(held.customerDueVnd)}</Text></View>
                  </>
                ) : null}
              </View>

              {payState === 'waiting' && <Text style={styles.hint}>Chờ kết quả các thiết bị. Bạn chỉ trả tiền một lần, sau khi mọi thiết bị đã có kết quả, và chỉ trả cho máy đã sửa xong.</Text>}
              {payState === 'paid' && <Text style={[styles.value, { color: tone('success').text }]}>Đã thanh toán</Text>}
              {payState === 'zero_due' && <Text style={styles.hint}>Không phát sinh khoản cần thanh toán.</Text>}
              {payState === 'pending_cash' && checkout.pendingCash && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.value}>Kỹ thuật viên báo đã thu {formatVnd(checkout.pendingCash.amount)} tiền mặt.</Text>
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.primaryBtn, styles.flex]} disabled={busy} onPress={() => answerCash(true)} accessibilityRole="button" accessibilityState={{ disabled: busy }}>
                      <Text style={styles.primaryText}>Đúng, tôi đã trả</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} disabled={busy} onPress={() => answerCash(false)} accessibilityRole="button" accessibilityState={{ disabled: busy }}>
                      <Text style={styles.secondaryText}>Chưa đúng</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {(payState === 'pending_cash' || payState === 'ready' || payState === 'vnpay' || payState === 'wallet_short') && !!checkout.total && (
                <VoucherCheckoutSection
                  scopeId={visitGroupId}
                  applied={held}
                  disabled={busy}
                  keepWhenExpired={payState === 'pending_cash'}
                  onApplied={setVoucher}
                  onReleased={(reason) => { setVoucher(null); if (reason) setMessage({ type: 'error', text: reason }); }}
                />
              )}
              {(payState === 'ready' || payState === 'vnpay' || payState === 'wallet_short') && (
                <View style={{ gap: 8 }}>
                  {(fullyFunded ? [] : methods).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.method, method === m && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
                      onPress={() => setPayMethod(m)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: method === m }}
                      testID={`visit-pay-${m}`}
                    >
                      <Text style={styles.value}>{PAY_LABEL[m]}</Text>
                      {m === 'wallet' && <Text style={styles.hint}>{walletBalance === null ? 'Chưa tải được số dư' : `Số dư ${formatVnd(walletBalance)}`}</Text>}
                    </TouchableOpacity>
                  ))}
                  {!fullyFunded && method === 'cash' && <Text style={styles.hint}>{`Trả tiền trực tiếp cho kỹ thuật viên số tiền của cả lượt: ${formatVnd(payable)}. Đây chỉ là hướng dẫn, chưa ghi nhận đã thanh toán. Kỹ thuật viên khai báo số tiền đã nhận, sau đó bạn xác nhận đúng số tiền hoặc báo chưa đúng.`}</Text>}
                  {payState === 'wallet_short' && (
                    <Text style={[styles.hint, { color: tone('danger').text }]} accessibilityRole="alert">Ví chưa đủ. Nạp thêm vào ví hoặc chọn cách thanh toán khác.</Text>
                  )}
                  {vnpayOpened && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => void load()} accessibilityRole="button">
                      <Text style={styles.secondaryText}>Kiểm tra thanh toán</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {(actions?.canReschedule || actions?.canCancel) && (
            <View style={styles.row}>
              {actions.canReschedule && (
                <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} onPress={openReschedule} disabled={busy} accessibilityRole="button" testID="visit-reschedule">
                  <Text style={styles.secondaryText}>Đổi lịch cả lượt</Text>
                </TouchableOpacity>
              )}
              {actions.canCancel && (
                <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} onPress={confirmCancel} disabled={busy} accessibilityRole="button" testID="visit-cancel">
                  <Text style={[styles.secondaryText, { color: tone('danger').text }]}>Hủy lượt sửa</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {actions && !actions.canReschedule && visit.status !== 'cancelled' && visit.items.some((i) => (i.booking?.rescheduleCount ?? 0) >= 1) && (
            <Text style={styles.hint}>Đã đổi lịch một lần. Mỗi lượt sửa chỉ đổi lịch được một lần, mọi thiết bị đổi cùng nhau.</Text>
          )}
        </ScrollView>
        {footerPrimary && (
          <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]} testID="visit-footer">
            <TouchableOpacity
              style={[styles.primaryBtn, styles.footerBtn, footerPrimary.disabled && styles.disabled]}
              disabled={footerPrimary.disabled}
              onPress={footerPrimary.onPress}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!footerPrimary.disabled, busy }}
              testID={footerPrimary.testID}
            >
              <Text style={styles.footerText}>{footerPrimary.label}</Text>
            </TouchableOpacity>
          </View>
        )}
        </>
      )}

      {visit && lead && (
        <BookingRescheduleSheet
          visible={rescheduleOpen}
          booking={{ ...lead, serviceName: `Cả lượt sửa ${devices.length} thiết bị` }}
          notice="Mỗi lượt sửa chỉ đổi lịch được một lần, mọi thiết bị đổi cùng nhau. Thợ đã nhận có thể không rảnh buổi mới; khi đó bạn sẽ cần chọn lại."
          schedule={schedule}
          busy={busy}
          error={rescheduleError}
          animated={!reduceMotion}
          onChange={setSchedule}
          onSave={() => void saveReschedule()}
          onClose={() => { if (!busy) setRescheduleOpen(false); }}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  headerTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 8 },
  cardTitle: { flexShrink: 1, fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  section: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text, marginTop: 4 },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.tone.danger.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  // The text line is 20 high and the icon 16: 2 down puts the icon on the middle of the first line.
  lineIcon: { marginTop: 2 },
  flex: { flex: 1 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '55%' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  banner: { borderRadius: 12, padding: 12 },
  method: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 4, justifyContent: 'center' },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondaryBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  toggle: { minHeight: 44, justifyContent: 'center' },
  footer: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 16, paddingTop: 12 },
  footerBtn: { minHeight: 52 },
  footerText: { color: colors.surface, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
