import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ChevronDown, ChevronUp, Layers, Wrench } from 'lucide-react-native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { visitGroupsApi, type VisitCheckout } from '../../../api/visit-groups.api';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { VISIT_DEVICE_STATE_LABEL } from '../../../screens/customer/customer-visit';
import { useOptionalOrderSession } from '../runtime/OrderSessionProvider';
import { useRegisterVisitDevices, visitDeviceTabName } from '../navigation/visit-device-tabs';
import { PanelRow, visitPanelStyles as styles } from '../shared/VisitPanelRow';

// Screens of an order that make sense for any device of the visit and need no id: switching device keeps the customer on the same one.
const CARRY_SCREENS = ['OrderInformation', 'OrderProgressHistory', 'EvidenceGallery', 'InvoiceDetail', 'HandoverReview', 'SupportCases'];

/**
 * The customer's counterpart of the technician's "Thiết bị trong lượt": the devices of a multi-device visit, one tab each in the order
 * screen, so the customer follows and switches between them without leaving the order. Shown only for a device of a visit.
 */
export default function VisitCustomerPanel() {
  const session = useOptionalOrderSession();
  const snapshot = session?.snapshot;
  const value = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  // Only a device of a visit, read as its customer, mounts the panel's hooks (socket, reads).
  return snapshot?.key.role === 'customer' && value && !isHistoricalOrder(value) && value.visitGroupId
    ? <Body groupId={value.visitGroupId} orderId={value.id} status={String(value.status).toUpperCase()} />
    : null;
}

function Body({ groupId, orderId, status }: { groupId: string; orderId: string; status: string }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeName: string = route.name;
  // Set on a screen opened by switching device: where the customer started (the tab whose page they were on).
  const returnTab: string | undefined = typeof route.params?.returnTab === 'string' ? route.params.returnTab : undefined;
  const registerDevices = useRegisterVisitDevices();
  const [checkout, setCheckout] = useState<VisitCheckout | null>(null);
  const [error, setError] = useState('');
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const generation = useRef(0);
  const switching = useRef(false);

  const load = useCallback(async () => {
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

  const resolved = devices.filter((d) => d.state !== 'open').length;
  const early = status === 'ACCEPTED' || status === 'EN_ROUTE';
  const open = openChoice ?? !early;

  // Switching device on a detail screen is one action inside that page: back goes to the page the customer came from, not to
  // the other device. So the screen left is closed, and leaving the opened one by back jumps to where it all started.
  useEffect(() => {
    if (!returnTab) return undefined;
    return navigation.addListener('beforeRemove', () => {
      if (switching.current) return;
      const tabs = navigation.getParent?.();
      setTimeout(() => { try { tabs?.navigate(returnTab); } catch { /* the whole order is closing */ } }, 0);
    });
  }, [navigation, returnTab]);

  // One switch at a time keeps the transitions from piling up.
  const goDevice = (serviceOrderId: string) => {
    if (switching.current || !navigation.isFocused()) return;
    switching.current = true;
    setTimeout(() => { switching.current = false; }, 800);
    const tab = visitDeviceTabName(serviceOrderId);
    // On e.g. the handover photos of this device, the other device opens on its own handover photos, not on its first screen.
    const tabs = navigation.getParent?.();
    const tabState = tabs?.getState?.();
    const currentTab: string | undefined = tabState?.routes?.[tabState.index]?.name;
    const carry = CARRY_SCREENS.includes(routeName);
    const go = () => {
      if (!carry) { navigation.navigate(tab); return; }
      // Close the screen being left (its own page stays as it was), then open the same screen of the other device.
      const origin = returnTab ?? currentTab;
      navigation.goBack();
      tabs?.navigate(tab, { screen: routeName, initial: false, params: { returnTab: origin } });
    };
    if (tabState?.routeNames?.includes(tab)) go();
    else {
      registerDevices(devices.flatMap((d) => (d.serviceOrderId ? [d.serviceOrderId] : [])));
      setTimeout(go, 50);
    }
  };

  return (
    <View testID="visit-customer-panel" style={styles.wrap}>
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
            {devices.map((d) => {
              const active = d.serviceOrderId === orderId;
              const state = VISIT_DEVICE_STATE_LABEL[d.state];
              return (
                <View key={d.bookingId} style={styles.divider}>
                  <PanelRow
                    testID={`customer-visit-device-${d.sequence}`}
                    Icon={Wrench}
                    label={`Máy ${d.sequence} · ${d.serviceName || d.deviceLabel || 'Thiết bị'}`}
                    sub={d.serviceOrderId ? state : 'Đang chờ kỹ thuật viên'}
                    badge={active ? 'Đang xem' : undefined}
                    selected={active}
                    disabled={active || !d.serviceOrderId}
                    chevron={!active && !!d.serviceOrderId}
                    accessibilityLabel={`Máy ${d.sequence}: ${d.serviceName || d.deviceLabel || 'Thiết bị'}, ${state}`}
                    onPress={() => d.serviceOrderId && goDevice(d.serviceOrderId)}
                  />
                </View>
              );
            })}
            <View style={styles.divider}>
              <PanelRow
                testID="customer-visit-open"
                Icon={Layers}
                label="Xem cả lượt sửa"
                sub="Thanh toán và lịch của cả lượt"
                chevron
                onPress={() => navigation.navigate('CustomerVisit', { visitGroupId: groupId })}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}
