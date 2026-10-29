import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Clock, HandCoins, Layers, LogOut, Wallet, Wrench } from 'lucide-react-native';
import { isHistoricalOrder, ordersApi } from '../../../api/orders.api';
import { fundedCheckoutApi, NoFundedCashReservationError } from '../../../api/funded-checkout.api';
import { REPAIR_FAILURE_REASONS, visitGroupsApi, type RepairFailureReason, type VisitCheckout } from '../../../api/visit-groups.api';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import { formatVnd } from '../../../utils/format';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useRegisterVisitDevices, visitDeviceTabName } from '../navigation/visit-device-tabs';
import { PanelRow } from '../shared/VisitPanelRow';
import { CASH_VOUCHER_UNCHECKED } from './technician-cash-controller';
import {
  canDeclareVisitCash,
  nextOpenVisitDevice,
  repairFailedAllowed,
  visitCashStatus,
  visitDeviceTechnicianStatus,
} from './technician-visit';

/**
 * One visit holds up to three devices, each with its own order. This panel only moves between the
 * orders and acts on the whole visit (cash, leaving, "Không sửa được"); quotes, parts and photos stay per order.
 * `section` limits what is shown: the hub shows devices and actions, the payment-waiting step shows the visit cash.
 */
export default function VisitTechnicianPanel({ section }: { section: 'devices' | 'cash' }) {
  const { snapshot } = useOrderSession();
  const value = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  // Only a device of a visit mounts the panel's hooks (socket, reads).
  return value && !isHistoricalOrder(value) && value.visitGroupId ? <VisitPanelBody section={section} /> : null;
}

// The service names the device; the stored label ("Máy 1") only repeats the number the row already shows.
const deviceName = (d: { serviceName: string | null; deviceLabel: string | null }) => d.serviceName || d.deviceLabel || 'Thiết bị';

function VisitPanelBody({ section }: { section: 'devices' | 'cash' }) {
  const { key, snapshot, refresh } = useOrderSession();
  const navigation = useNavigation<any>();
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const groupId = order?.visitGroupId ?? null;
  const [checkout, setCheckout] = useState<VisitCheckout | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failedOpen, setFailedOpen] = useState(false);
  // The first steps (accepted, on the way) are about getting there: the visit starts folded, one tap opens it. From the repair on it is open.
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const generation = useRef(0);
  const switching = useRef(false);
  const registerDevices = useRegisterVisitDevices();

  const load = useCallback(async () => {
    if (!groupId) return;
    const mine = ++generation.current;
    try {
      const next = await visitGroupsApi.getCheckout(groupId);
      if (mine === generation.current && next.visitGroupId === groupId) { setCheckout(next); setError(''); }
    } catch (e) {
      if (mine === generation.current) setError(extractApiErrorMessage(e, 'Chưa tải được các máy trong lượt. Vui lòng thử lại.'));
    }
  }, [groupId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the visit once the order says it belongs to one
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['order:updated', 'realtime:resync'], () => { void load(); }, undefined, { pollMs: 30_000 });
  // Events of the time this device's tab was behind another one are lost: read again when it comes back to the front.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    void load();
  }, [load]));

  const devices = useMemo(() => [...(checkout?.devices ?? [])].sort((a, b) => a.sequence - b.sequence).slice(0, 3), [checkout]);
  // Each device order gets its own tab in the order screen once the visit is known.
  useEffect(() => { registerDevices(devices.flatMap((d) => (d.serviceOrderId ? [d.serviceOrderId] : []))); }, [devices, registerDevices]);
  if (!groupId || !order || !key) return null;
  const resolved = devices.filter((d) => d.state !== 'open').length;
  const next = nextOpenVisitDevice(devices, order.id);
  const cash = checkout ? visitCashStatus(checkout) : null;
  const afterAction = () => { void load(); void refresh('manual'); };
  // Each device is its own tab: one switch at a time keeps the transitions from piling up.
  const goDevice = (serviceOrderId: string) => {
    if (switching.current || !navigation.isFocused()) return;
    switching.current = true;
    setTimeout(() => { switching.current = false; }, 800);
    const tab = visitDeviceTabName(serviceOrderId);
    // The tab of a device exists once the visit has been registered; if it does not yet (registered a moment ago, or the screen was
    // rebuilt), register now and go on the next tick, after the tab has been added.
    if (navigation.getParent?.()?.getState?.()?.routeNames?.includes(tab)) navigation.navigate(tab);
    else {
      registerDevices(devices.flatMap((d) => (d.serviceOrderId ? [d.serviceOrderId] : [])));
      setTimeout(() => navigation.navigate(tab), 50);
    }
  };
  const early = order.status === 'ACCEPTED' || order.status === 'EN_ROUTE';
  const open = openChoice ?? !early;

  const declareCash = async () => {
    if (!checkout || busy) return;
    // Ask the server whether the customer holds a voucher before anything is said about the amount. Only an explicit "none"
    // allows the full total; a failed lookup collects nothing.
    setBusy(true); setMessage('');
    let due = checkout.total;
    let reservationId: string | null = null;
    try {
      const held = await fundedCheckoutApi.cashReservation({ kind: 'VISIT_GROUP', id: groupId });
      due = held.customerDueVnd;
      reservationId = held.voucherReservationId;
    } catch (e) {
      if (!(e instanceof NoFundedCashReservationError)) { setMessage(CASH_VOUCHER_UNCHECKED); setBusy(false); return; }
    }
    setBusy(false);
    const voucherNote = reservationId ? ' Khách đang dùng voucher nên đây là số sau khi trừ phần giảm.' : '';
    Alert.alert('Khai báo tiền mặt cả lượt?', `Bạn xác nhận đã thu ${formatVnd(due)} tiền mặt cho cả lượt.${voucherNote} Khách sẽ được hỏi xác nhận.`, [
      { text: 'Chưa', style: 'cancel' },
      {
        text: 'Đã thu đủ',
        onPress: async () => {
          setBusy(true); setMessage('');
          try {
            if (reservationId) await fundedCheckoutApi.declareCash({ kind: 'VISIT_GROUP', id: groupId }, reservationId, { declaredAmount: due });
            else await visitGroupsApi.declareCash(groupId, due);
            setMessage('Đã báo nhận tiền mặt cả lượt, chờ khách xác nhận.');
          } catch (e) {
            setMessage(extractApiErrorMessage(e, 'Chưa khai báo được tiền mặt. Vui lòng kiểm tra lại trạng thái trước khi thử lại.'));
          } finally { setBusy(false); afterAction(); }
        },
      },
    ]);
  };

  const withdraw = () => Alert.alert(
    'Rút khỏi cả lượt sửa?',
    'Bạn sẽ rời tất cả thiết bị trong lượt. Các đơn quay lại bước tìm thợ cho khách.',
    [
      { text: 'Giữ lại', style: 'cancel' },
      {
        text: 'Rút khỏi lượt', style: 'destructive',
        onPress: async () => {
          setBusy(true); setMessage('');
          try {
            await visitGroupsApi.withdraw(groupId, 'Kỹ thuật viên rút khỏi lượt sửa');
            navigation.navigate('TechnicianMain');
          } catch (e) {
            setMessage(extractApiErrorMessage(e, 'Chưa rút khỏi lượt được. Vui lòng thử lại.'));
            setBusy(false);
          }
        },
      },
    ],
  );

  if (section === 'cash') {
    const state = checkout ? cash : null;
    const status = !checkout ? { Icon: Clock, label: error || 'Đang tải…', sub: undefined as string | undefined }
      : state === 'paid' ? { Icon: CheckCircle2, label: 'Khách đã thanh toán cả lượt', sub: undefined }
      : state === 'pending_cash' ? { Icon: Clock, label: 'Chờ khách xác nhận tiền mặt', sub: undefined }
      : state === 'zero_due' ? { Icon: CheckCircle2, label: 'Không phát sinh khoản cần thanh toán', sub: undefined }
      : state === 'waiting' ? { Icon: Clock, label: 'Chờ các máy khác trong lượt', sub: 'Khách trả tiền một lần khi mọi thiết bị đã có kết quả.' }
      : { Icon: Clock, label: 'Chờ khách thanh toán', sub: 'Khách thanh toán một lần cho cả lượt.' };
    return (
      <View testID="visit-cash-panel" style={styles.wrap}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Thu tiền cả lượt</Text>
        <View style={styles.card}>
          {checkout && (
            <PanelRow testID="visit-cash-total" Icon={Wallet} readOnly label="Tổng cả lượt"
              sub={state === 'waiting' ? 'Chờ kết quả các máy' : formatVnd(checkout.total)} />
          )}
          <View style={checkout ? styles.divider : undefined}>
            <PanelRow testID="visit-cash-status" Icon={status.Icon} readOnly label={status.label} sub={status.sub} />
          </View>
          {checkout && canDeclareVisitCash(checkout) && (
            <View style={styles.divider}>
              <PanelRow testID="visit-declare-cash" Icon={HandCoins} label="Khai báo đã thu tiền mặt cả lượt" disabled={busy} chevron onPress={declareCash} />
            </View>
          )}
          {!!message && <Text accessibilityRole="alert" style={styles.note}>{message}</Text>}
        </View>
      </View>
    );
  }

  const rows: React.ReactNode[] = [];
  devices.forEach((d) => {
    const active = d.serviceOrderId === order.id;
    const status = visitDeviceTechnicianStatus(d.state);
    rows.push(
      <PanelRow
        key={d.bookingId}
        testID={`tech-visit-device-${d.sequence}`}
        Icon={Wrench}
        label={`Máy ${d.sequence} · ${deviceName(d)}`}
        sub={d.serviceOrderId ? status : 'Chưa có công việc'}
        badge={active ? 'Đang xem' : undefined}
        selected={active}
        disabled={active || !d.serviceOrderId}
        chevron={!active && !!d.serviceOrderId}
        accessibilityLabel={`Máy ${d.sequence}: ${deviceName(d)}, ${status}`}
        onPress={() => d.serviceOrderId && goDevice(d.serviceOrderId)}
      />,
    );
  });
  if (next) {
    rows.push(<PanelRow key="next" testID="visit-next-device" Icon={ArrowRight} label={`Xử lý tiếp: Máy ${next.sequence}`} chevron onPress={() => goDevice(next.serviceOrderId!)} />);
  }
  if (repairFailedAllowed(order)) {
    rows.push(<PanelRow key="failed" testID="visit-repair-failed" Icon={AlertTriangle} label="Không sửa được" disabled={busy} chevron onPress={() => setFailedOpen(true)} />);
  }
  if (order.status !== 'UNDER_REPAIR' && order.status !== 'COMPLETED' && order.status !== 'CANCELLED') {
    rows.push(<PanelRow key="withdraw" testID="visit-withdraw" Icon={LogOut} label="Rút khỏi cả lượt" danger disabled={busy} onPress={withdraw} />);
  }

  return (
    <View testID="visit-device-panel" style={styles.wrap}>
      <View style={styles.card}>
        <PanelRow
          testID="visit-panel-toggle"
          Icon={Layers}
          label={`Thiết bị trong lượt${devices.length ? ` (${devices.length})` : ''}`}
          sub={devices.length > 0 ? `Đã có kết quả ${resolved}/${devices.length} máy` : undefined}
          subTestID="visit-progress"
          accessibilityLabel={`Thiết bị trong lượt, ${open ? 'đang mở' : 'đang thu gọn'}`}
          expanded={open}
          toggle={open ? ChevronUp : ChevronDown}
          onPress={() => setOpenChoice(!open)}
        />
        {open && (
          <>
            {!!error && <Text accessibilityRole="alert" style={styles.note}>{error}</Text>}
            {rows.map((row) => <View key={(row as React.ReactElement).key} style={styles.divider}>{row}</View>)}
            {!!message && <Text accessibilityRole="alert" style={styles.note}>{message}</Text>}
          </>
        )}
      </View>
      <RepairFailedSheet
        visible={failedOpen}
        orderId={order.id}
        parts={snapshot?.resources.parts.status === 'ready'
          ? snapshot.resources.parts.data.filter((p) => p.serviceOrderId === order.id && p.technicianId === key.userId && p.status === 'received')
          : []}
        onClose={() => setFailedOpen(false)}
        onDone={() => { setFailedOpen(false); setMessage('Đã báo không sửa được. Máy này không tính tiền, quản lý sẽ kiểm tra linh kiện.'); afterAction(); }}
      />
    </View>
  );
}

function RepairFailedSheet({ visible, orderId, parts, onClose, onDone }: {
  visible: boolean; orderId: string; parts: { id: string; items: { partNameSnapshot: string }[] }[]; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState<RepairFailureReason>('beyond_repair');
  const [note, setNote] = useState('');
  const [outcomes, setOutcomes] = useState<Record<string, 'installed' | 'returned'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await ordersApi.reportRepairFailed(orderId, {
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(parts.length ? { parts: parts.map((p) => ({ partRequestId: p.id, outcome: outcomes[p.id] ?? 'returned' })) } : {}),
      });
      onDone();
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Chưa báo được. Vui lòng kiểm tra lại trạng thái đơn trước khi thử lại.'));
    } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>Không sửa được máy này</Text>
          <Text style={styles.hint}>Máy này không tính tiền và bạn không bị trừ điểm. Chọn lý do:</Text>
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {REPAIR_FAILURE_REASONS.map((r) => (
              <Pressable key={r.code} testID={`repair-failed-${r.code}`} accessibilityRole="radio" accessibilityState={{ selected: reason === r.code }} onPress={() => setReason(r.code)}
                style={[styles.device, reason === r.code && styles.deviceActive]}>
                <Text style={styles.deviceTitle}>{r.label}</Text>
              </Pressable>
            ))}
            <TextInput accessibilityLabel="Ghi thêm" value={note} onChangeText={setNote} maxLength={1000} multiline placeholder="Ghi thêm (không bắt buộc)"
              placeholderTextColor={colors.muted} style={styles.input} />
            {parts.map((p) => (
              <View key={p.id} style={styles.device}>
                <Text style={styles.deviceTitle}>{p.items.map((i) => i.partNameSnapshot).join(', ') || 'Linh kiện đã nhận'}</Text>
                <View style={styles.row}>
                  {(['installed', 'returned'] as const).map((o) => {
                    const on = (outcomes[p.id] ?? 'returned') === o;
                    return (
                      <Pressable key={o} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setOutcomes((c) => ({ ...c, [p.id]: o }))} style={[styles.pill, on && styles.deviceActive]}>
                        <Text style={styles.deviceTitle}>{o === 'installed' ? 'Đã lắp' : 'Chưa lắp'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          {!!error && <Text accessibilityRole="alert" style={{ color: colors.tone.danger.text }}>{error}</Text>}
          <View style={styles.row}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.secondary, { flex: 1 }]}><Text style={styles.secondaryText}>Quay lại</Text></Pressable>
            <Pressable testID="repair-failed-confirm" accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.primary, { flex: 1 }, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Xác nhận không sửa được</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  sectionTitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cashCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  device: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, gap: 2, minHeight: 48, justifyContent: 'center' },
  deviceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  deviceTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  status: { color: colors.primaryStrong, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center', flex: 1, alignItems: 'center' },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  input: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, color: colors.text },
});
