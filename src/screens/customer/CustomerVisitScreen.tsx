import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import BackButton from '../../components/BackButton';
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
import {
  canStartVisitPayment,
  needsQuoteDecision,
  resolveVisitCheckoutState,
  visitActions,
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

  const [visit, setVisit] = useState<Visit | null>(null);
  const [checkout, setCheckout] = useState<VisitCheckout | null>(null);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string> | null>(null);
  const [orderReadIncomplete, setOrderReadIncomplete] = useState(false);
  const [quoteOrderBySequence, setQuoteOrderBySequence] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<VisitPayMethod>('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  // Set after the VNPay page was opened; only a fresh read of the visit can say whether it was paid.
  const [vnpayOpened, setVnpayOpened] = useState(false);
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
        setOrderStatuses({}); setQuoteOrderBySequence({}); setOrderReadIncomplete(false);
        return;
      }
      const results = await Promise.allSettled(orderIds.map((id) => ordersApi.getOrder(id)));
      if (mine !== generation.current) return;
      const statuses: Record<string, string> = {};
      const quotes: Record<number, string> = {};
      let incomplete = false;
      results.forEach((result, index) => {
        const device = nextCheckout!.devices.find((d) => d.serviceOrderId?.trim() === orderIds[index]);
        if (result.status !== 'fulfilled' || result.value?.id !== orderIds[index]) { incomplete = true; return; }
        statuses[orderIds[index]] = result.value.status;
        if (device && needsQuoteDecision(result.value)) quotes[device.sequence] = orderIds[index];
      });
      setOrderStatuses(statuses); setQuoteOrderBySequence(quotes); setOrderReadIncomplete(incomplete);
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
  const methods = visitPayMethods(checkout?.total ?? 0);
  const method = methods.includes(payMethod) ? payMethod : 'wallet';
  const payState = resolveVisitCheckoutState(checkout, method, walletBalance);
  const priorityQuote = devices.map((item) => ({ item, orderId: quoteOrderBySequence[item.sequence] })).find((entry) => entry.orderId);

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
    if (method === 'wallet') {
      if (payState === 'wallet_short' || walletBalance === null || walletBalance < checkout.total) return;
      void run(async () => {
        const result = await visitGroupsApi.payWithWallet(visitGroupId);
        return `Đã thanh toán ${formatVnd(result.amount)} bằng ví cho cả lượt.`;
      }, 'Chưa thanh toán được bằng ví.');
    } else if (method === 'vnpay') {
      void run(async () => {
        const url = await visitGroupsApi.createVnpayUrl(visitGroupId);
        setVnpayOpened(true);
        await WebBrowser.openAuthSessionAsync(url, 'fixhome://');
        // Coming back from VNPay is not a payment: the read after this step decides.
        return 'Đang chờ VNPay xác nhận. Nếu chưa thấy "Đã thanh toán", chạm "Kiểm tra thanh toán".';
      }, 'Chưa mở được trang thanh toán VNPay. Vui lòng thử lại.');
    }
  };

  const answerCash = (agreed: boolean) => void run(async () => {
    await visitGroupsApi.confirmCash(visitGroupId, agreed, agreed ? undefined : 'Số tiền mặt chưa đúng');
    return agreed ? 'Đã xác nhận trả tiền mặt cho cả lượt.' : 'Đã báo FixHome kiểm tra lại số tiền mặt.';
  }, agreed ? 'Chưa xác nhận được.' : 'Chưa gửi được yêu cầu kiểm tra tiền mặt. Vui lòng thử lại.');

  const tone = (name: ToneName) => colors.tone[name];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <BackButton />
        <Text accessibilityRole="header" style={styles.headerTitle}>Lượt sửa nhiều thiết bị</Text>
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
        <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
          {!!loadError && <Text style={styles.errorText} accessibilityRole="alert">{loadError}</Text>}
          {message && (
            <View style={[styles.banner, { backgroundColor: tone(message.type === 'success' ? 'success' : 'danger').bg }]} accessibilityRole="alert" testID="visit-message">
              <Text style={{ color: tone(message.type === 'success' ? 'success' : 'danger').text, fontSize: 14, lineHeight: 20 }}>{message.text}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Lịch hẹn</Text>
            <Text style={styles.value} testID="visit-schedule">
              {sessionLabel({ bookingMode: visit.bookingMode, slot: visit.slot, start: visit.preferredStartAt })}
            </Text>
            {visit.status === 'cancelled'
              ? <Text style={styles.hint}>Lượt sửa đã hủy.</Text>
              : checkout && <Text style={styles.hint}>Kết quả {resolved}/{checkout.devices.length} máy</Text>}
          </View>

          {priorityQuote && (
            <TouchableOpacity
              style={[styles.card, { borderColor: tone('warning').fg }]}
              onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: priorityQuote.orderId })}
              accessibilityRole="button"
              testID="visit-quote-shortcut"
            >
              <Text style={styles.cardTitle}>Máy {priorityQuote.item.sequence} chờ bạn duyệt báo giá</Text>
              <Text style={[styles.link, { color: colors.primaryStrong }]}>Xem và duyệt báo giá</Text>
            </TouchableOpacity>
          )}

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
                  <TouchableOpacity onPress={() => setExpanded((cur) => ({ ...cur, [item.id]: !open }))} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <Text style={styles.hint} numberOfLines={open ? undefined : 2}>{description}</Text>
                    <Text style={[styles.link, { color: colors.primaryStrong }]}>{open ? 'Thu gọn' : 'Xem mô tả'}</Text>
                  </TouchableOpacity>
                )}
                {!!device?.serviceOrderId && (
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

          {actions?.canChooseTechnician && lead && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('CustomerMatching', { bookingId: lead.id, visitGroupId })}
              accessibilityRole="button"
              testID="visit-choose-technician"
            >
              <Text style={styles.primaryText}>Chọn kỹ thuật viên</Text>
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
                  <Text style={styles.cardTitle}>Tổng cộng</Text>
                  <Text style={styles.cardTitle} testID="visit-total">{payState === 'waiting' ? '—' : formatVnd(checkout.total)}</Text>
                </View>
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
              {(payState === 'ready' || payState === 'vnpay' || payState === 'wallet_short') && (
                <View style={{ gap: 8 }}>
                  {methods.map((m) => (
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
                  {method === 'cash' && <Text style={styles.hint}>Trả tiền mặt cho kỹ thuật viên. Kỹ thuật viên khai báo số tiền đã thu, bạn xác nhận ở đây.</Text>}
                  {payState === 'wallet_short' && (
                    <Text style={[styles.hint, { color: tone('danger').text }]} accessibilityRole="alert">Ví chưa đủ. Nạp thêm vào ví hoặc chọn cách thanh toán khác.</Text>
                  )}
                  {method !== 'cash' && (
                    <TouchableOpacity
                      style={[styles.primaryBtn, (busy || payState === 'wallet_short') && styles.disabled]}
                      disabled={busy || payState === 'wallet_short'}
                      onPress={pay}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy || payState === 'wallet_short', busy }}
                      testID="visit-pay-submit"
                    >
                      {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{method === 'vnpay' ? 'Thanh toán qua VNPay' : `Thanh toán ${formatVnd(checkout.total)}`}</Text>}
                    </TouchableOpacity>
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
});
