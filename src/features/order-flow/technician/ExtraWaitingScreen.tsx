import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TechnicianOrderFlowParamList } from '../navigation/order-flow-navigation.types';
import { sameOrderSession } from '../domain/order-session.types';
import { isHistoricalOrder, type CostRequest } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianExtraCost } from './useTechnicianExtraCost';
import { getRestoredExtraRecovery } from '../domain/extra-and-parts-recovery';
import { isCostDecisionBlocked } from '../../../screens/customer/customer-additional-cost-decision';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import PillText from '../../../components/PillText';
import VisitTechnicianPanel from './VisitTechnicianPanel';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { formatVnd } from '../../../utils/format';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { backFromFlow } from '../navigation/resume-order';

export default function ExtraWaitingScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<NativeStackNavigationProp<TechnicianOrderFlowParamList>>();
  const focused = useIsFocused();
  const { controller, state } = useTechnicianExtraCost();

  useLoadUnloadedResources(snapshot, ['extras'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'technician' && order.id === key.serviceOrderId && order.technician?.id === key.userId;

  const extrasResource = snapshot?.resources.extras;
  const rawExtras = useMemo(() => {
    return extrasResource?.status === 'ready' && Array.isArray(extrasResource.data)
      ? (extrasResource.data as unknown as CostRequest[])
      : [];
  }, [extrasResource]);

  const supersededIds = useMemo(() => new Set(rawExtras.map((e) => e.supersedesId).filter(Boolean)), [rawExtras]);

  // Lấy các đề xuất của đơn
  const ownPending = useMemo(() => {
    if (!current) return [];
    return rawExtras.filter(
      (e) =>
        e.serviceOrderId === key?.serviceOrderId &&
        !supersededIds.has(e.id) &&
        String(e.status).toUpperCase() === 'PENDING_APPROVAL',
    );
  }, [current, rawExtras, key?.serviceOrderId, supersededIds]);

  const [selection, setSelection] = useState<{ key: typeof key; id: string | null }>({ key, id: null });
  const latestCost = (key && sameOrderSession(selection.key, key) ? ownPending.find(c => c.id === selection.id) : null) ?? ownPending[0] ?? null;

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredExtraRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.isUnresolved && (recovery.operation === 'extra-create' || recovery.operation === 'extra-revise');

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const isExpired = latestCost ? isCostDecisionBlocked(latestCost.expiresAt) : false;
  const canRevise = current && order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt && !showRecovery && state.phase !== 'unknown' && latestCost && !isExpired && String(latestCost.status).toUpperCase() === 'PENDING_APPROVAL';
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.extras?.status === 'loading';

  const onRevise = () => {
    if (!canRevise || !latestCost) return;
    navigation.navigate('ExtraProposal', { proposalId: latestCost.id });
  };

  const onPrimary = () => {
    if (busy) return;
    if (state.phase === 'unknown' || showRecovery) {
      if (recovery.hasRecovery && recovery.isUnresolved && recovery.intentId && key) {
        void controller.verify(key, recovery.intentId);
      }
      return;
    }
    // Tiếp tục sửa chữa theo phạm vi cũ
    navigation.navigate('RepairWorkspace');
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chờ duyệt phát sinh" onBack={() => backFromFlow(navigation)}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Không tải trạng thái chi phí cho đơn lịch sử.'
            : 'Trạng thái chờ duyệt chỉ mở khi có quyền quản lý đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  const customerName = order.customerName || 'Khách hàng';
  const totalAmount = latestCost ? (latestCost.totalLaborDelta ?? 0) + (latestCost.totalPartsDelta ?? 0) + (latestCost.shippingFee ?? 0) : 0;

  return (
    <TaskScreenShell
      title="Chờ duyệt phát sinh"
      stage={3}
      onBack={() => backFromFlow(navigation)}
      secondary={
        canRevise
          ? {
              label: 'Sửa đề xuất',
              testID: 'waiting-revise-btn',
              disabled: busy,
              onPress: onRevise,
            }
          : {
              label: 'Làm mới dữ liệu',
              testID: 'task-refresh',
              disabled: busy || refreshing,
              onPress: () => {
                if (!busy && !refreshing) void refresh('manual');
              },
            }
      }
      primary={{
        label: busy
          ? 'Đang kiểm tra…'
          : state.phase === 'unknown' || showRecovery
            ? 'Kiểm tra lại'
            : 'Tiếp tục sửa phạm vi cũ',
        testID: state.phase === 'unknown' || showRecovery
          ? 'waiting-verify'
          : 'waiting-continue-base',
        disabled: busy,
        onPress: onPrimary,
      }}
    >
      {showRecovery && state.phase !== 'resolved' && (
        <ReadOnlyNotice>
          Có thao tác đề xuất phát sinh chưa rõ kết quả từ phiên trước. Vui lòng kiểm tra lại từ máy chủ.
        </ReadOnlyNotice>
      )}
      {ownPending.length > 1 && <View style={styles.card}>
        <Text style={styles.promptText}>Các đề xuất đang chờ duyệt</Text>
        {ownPending.map((cost, index) => <TouchableOpacity key={cost.id} testID={`waiting-select-${cost.id}`} accessibilityRole="radio" accessibilityState={{ selected: latestCost?.id === cost.id, disabled: busy || showRecovery || state.phase === 'unknown' }} disabled={busy || showRecovery || state.phase === 'unknown'} style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => { if (!busy && !showRecovery && state.phase !== 'unknown') setSelection({ key, id: cost.id }); }}><Text>Đề xuất {index + 1} · {cost.reason}</Text></TouchableOpacity>)}
      </View>}

      {latestCost ? (
        <View style={styles.proposalCard}>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={styles.title}>Đề xuất phát sinh</Text>
            <View style={[styles.chip, { backgroundColor: isExpired ? colors.tone.danger.bg : colors.tone.warning.bg }]}>
              <PillText style={[styles.chipText, { color: isExpired ? colors.tone.danger.text : colors.tone.warning.text }]}>{isExpired ? 'Đã hết hạn' : 'Chờ duyệt'}</PillText>
            </View>
          </View>
          {latestCost.createdAt ? <Text style={styles.meta}>Gửi lúc {vnDateTimeString(latestCost.createdAt)}</Text> : null}
          {latestCost.reason ? <Text style={styles.reason}>{latestCost.reason}</Text> : null}
          <View style={[styles.banner, { backgroundColor: isExpired ? colors.tone.warning.bg : colors.tone.info.bg }]}>
            <Clock size={20} strokeWidth={1.75} color={isExpired ? colors.tone.warning.fg : colors.tone.info.fg} />
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, { color: isExpired ? colors.tone.warning.text : colors.tone.info.text }]}>
                {isExpired ? 'Đề xuất đã hết hạn duyệt' : `Đang chờ ${customerName} duyệt`}
              </Text>
              <Text style={styles.meta}>
                {isExpired
                  ? 'Khách không duyệt được nữa. Bạn có thể tạo đề xuất mới hoặc tiếp tục phạm vi ban đầu.'
                  : `Sau khi khách duyệt bạn sửa thêm phần phát sinh.${latestCost.expiresAt ? ` Hạn duyệt ${vnDateTimeString(latestCost.expiresAt)}.` : ''}`}
              </Text>
            </View>
          </View>
          <View style={styles.totals}>
            <View style={styles.row}><Text style={styles.label}>Tiền công</Text><Text style={styles.value}>{quoteMoneyText(latestCost.totalLaborDelta ?? 0)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Linh kiện</Text><Text style={styles.value}>{quoteMoneyText(latestCost.totalPartsDelta ?? 0)}</Text></View>
            {latestCost.shippingFee ? <View style={styles.row}><Text style={styles.label}>Phí giao hàng</Text><Text style={styles.value}>{quoteMoneyText(latestCost.shippingFee)}</Text></View> : null}
            <View style={styles.row}><Text style={styles.totalLabel}>Tổng đề xuất</Text><Text style={styles.totalValue}>{formatVnd(totalAmount)}</Text></View>
          </View>
        </View>
      ) : (
        <ReadOnlyNotice>Chưa có đề xuất phát sinh nào đang chờ duyệt cho đơn này.</ReadOnlyNotice>
      )}

      {canRevise && (
        <View style={styles.actionPrompt}>
          <Text style={styles.promptText}>
            Bạn có thể chỉnh sửa lại đề xuất nếu muốn thay đổi chi tiết hoặc số lượng linh kiện trước khi khách duyệt.
          </Text>
        </View>
      )}
      <VisitTechnicianPanel section="devices" />
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  proposalCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '600' },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  reason: { color: colors.text, fontSize: 14, lineHeight: 20 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, padding: spacing.md },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  value: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalLabel: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  totalValue: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  actionPrompt: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  promptText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
