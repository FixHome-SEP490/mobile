import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TechnicianOrderFlowParamList } from '../navigation/order-flow-navigation.types';
import { sameOrderSession } from '../domain/order-session.types';
import { isHistoricalOrder, type CostRequest } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianExtraCost } from './useTechnicianExtraCost';
import { getRestoredExtraRecovery } from '../domain/extra-and-parts-recovery';
import { isCostDecisionBlocked } from '../../../screens/customer/customer-additional-cost-decision';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

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
      <TaskScreenShell title="Chờ duyệt phát sinh" onBack={() => navigation.goBack()}>
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
      onBack={() => navigation.goBack()}
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

      <View style={styles.card}>
        <DetailRow label="Người duyệt" value={customerName} />
        <DetailRow label="Trạng thái" value="Đang chờ khách duyệt" />
        {latestCost ? (
          <>
            <DetailRow label="Mã đề xuất" value={latestCost.id} />
            <DetailRow label="Lý do phát sinh" value={latestCost.reason} />
            <DetailRow label="Tổng đề xuất" value={formatVnd(totalAmount)} />
            {latestCost.expiresAt ? (
              <DetailRow
                label="Hạn duyệt (máy chủ)"
                value={`${vnDateTimeString(latestCost.expiresAt)}${isExpired ? ' (Đã hết hạn)' : ''}`}
              />
            ) : null}
          </>
        ) : null}
      </View>

      {isExpired ? (
        <ReadOnlyNotice>
          Đề xuất chi phí phát sinh đã hết hạn duyệt. Khách hàng không thể duyệt đề xuất này nữa. Bạn có thể tạo đề xuất mới hoặc tiếp tục sửa chữa theo phạm vi ban đầu.
        </ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>
          Đang chờ khách hàng phản hồi đề xuất phát sinh. Trong lúc chờ, bạn có thể tiếp tục các phần việc thuộc phạm vi sửa chữa ban đầu.
        </ReadOnlyNotice>
      )}

      {canRevise && (
        <View style={styles.actionPrompt}>
          <Text style={styles.promptText}>
            Bạn có thể chỉnh sửa lại đề xuất nếu muốn thay đổi chi tiết hoặc số lượng linh kiện trước khi khách duyệt.
          </Text>
        </View>
      )}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
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
