import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Wallet, Wrench } from 'lucide-react-native';
import { visitGroupsApi, type VisitCheckout, type VisitDeviceState } from '../../../api/visit-groups.api';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import { formatVnd } from '../../../utils/format';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { PanelRow, visitPanelStyles as styles } from './VisitPanelRow';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/**
 * Every device of a visit with what it comes to: code, service, result and money, then the total of the visit. Shown once the work is
 * handed over, so each device keeps its details next to the single payment of the visit (the same facts a single order shows).
 */
export default function VisitDevicesSummary({ groupId, stateLabel }: { groupId: string; stateLabel: (state: VisitDeviceState) => string }) {
  const [checkout, setCheckout] = useState<VisitCheckout | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const next = await visitGroupsApi.getCheckout(groupId);
      if (mine === generation.current && next.visitGroupId === groupId) { setCheckout(next); setError(''); }
    } catch (e) {
      if (mine === generation.current) setError(extractApiErrorMessage(e, 'Chưa tải được chi tiết các máy trong lượt. Vui lòng thử lại.'));
    }
  }, [groupId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the visit once on mount
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['order:updated', 'realtime:resync'], () => { void load(); }, undefined, { pollMs: 30_000 });

  const devices = [...(checkout?.devices ?? [])].sort((a, b) => a.sequence - b.sequence).slice(0, 3);
  const waiting = !!checkout && (checkout.waiting > 0 || !checkout.ready);
  return (
    <View testID="visit-devices-summary" style={styles.wrap}>
      <Text accessibilityRole="header" style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: spacing.sm }}>Chi tiết từng máy</Text>
      <View style={styles.card}>
        {!!error && <Text accessibilityRole="alert" style={styles.note}>{error}</Text>}
        {!checkout && !error && <Text style={styles.note}>Đang tải…</Text>}
        {devices.map((d, i) => (
          <View key={d.bookingId} style={i > 0 ? styles.divider : undefined}>
            <PanelRow
              testID={`visit-summary-device-${d.sequence}`}
              Icon={Wrench}
              readOnly
              label={`Máy ${d.sequence} · ${d.serviceName || d.deviceLabel || 'Thiết bị'}`}
              sub={[d.orderCode ? `#${d.orderCode}` : '', d.serviceOrderId ? stateLabel(d.state) : 'Chưa có công việc', d.paid ? 'Đã thanh toán' : ''].filter(Boolean).join(' · ')}
              value={d.state === 'open' ? 'Chờ kết quả' : formatVnd(d.amount)}
            />
          </View>
        ))}
        {!!checkout && (
          <View style={styles.divider}>
            <PanelRow
              testID="visit-summary-total"
              Icon={Wallet}
              readOnly
              label="Tổng cả lượt"
              sub={waiting ? 'Tính khi mọi máy đã có kết quả' : checkout.paid ? 'Đã thanh toán' : 'Khách trả một lần'}
              value={waiting ? '—' : formatVnd(checkout.total)}
            />
          </View>
        )}
      </View>
    </View>
  );
}
