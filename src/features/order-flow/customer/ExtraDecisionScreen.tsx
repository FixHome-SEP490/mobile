import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { sameOrderSession, type OrderSessionKey } from '../domain/order-session.types';
import { isHistoricalOrder, type CostRequest } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useCustomerExtraCostDecision } from './useCustomerExtraCostDecision';
import {
  isCostDecisionBlocked,
  eligibleExtraWarrantyOptions,
} from '../../../screens/customer/customer-additional-cost-decision';
import { getRestoredExtraRecovery } from '../domain/extra-and-parts-recovery';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

interface FrozenConfirmSheet {
  costId: string;
  action: 'approve' | 'reject';
  ownerKey: string | null;
  key: OrderSessionKey;
  signature: string;
  selectedIds: string[];
}

function costTotal(c: CostRequest | null | undefined): number | null {
  if (!c || !Number.isFinite(c.totalLaborDelta) || !Number.isFinite(c.totalPartsDelta) || c.shippingFee !== undefined && !Number.isFinite(c.shippingFee)) return null;
  return c.totalLaborDelta + c.totalPartsDelta + (c.shippingFee ?? 0);
}

export default function ExtraDecisionScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const focused = useIsFocused();
  const { controller, state } = useCustomerExtraCostDecision();

  useLoadUnloadedResources(snapshot, ['extras'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'customer' && order.id === key.serviceOrderId;
  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;

  // Lấy danh sách các đề xuất phát sinh đang chờ duyệt
  const extrasResource = snapshot?.resources.extras;
  const rawExtras = useMemo(() => {
    return extrasResource && extrasResource.status === 'ready' && Array.isArray(extrasResource.data)
      ? (extrasResource.data as unknown as CostRequest[])
      : [];
  }, [extrasResource]);

  const supersededIds = useMemo(() => new Set(rawExtras.map((e) => e.supersedesId).filter(Boolean)), [rawExtras]);

  const pendingProposals = useMemo(() => {
    if (!current) return [];
    return rawExtras.filter(
      (e) =>
        e.serviceOrderId === key?.serviceOrderId &&
        !supersededIds.has(e.id) &&
        String(e.status).toUpperCase() === 'PENDING_APPROVAL',
    );
  }, [current, rawExtras, key?.serviceOrderId, supersededIds]);

  const [activeCostId, setActiveCostId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<FrozenConfirmSheet | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [draftKey, setDraftKey] = useState(key);
  const [draftCurrent, setDraftCurrent] = useState(current);
  if (draftCurrent !== current || !(draftKey === key || !!key && sameOrderSession(draftKey, key))) {
    setDraftCurrent(current);
    setDraftKey(key);
    setActiveCostId(null);
    setSheet(null);
    setSelection([]);
  }

  // Chọn proposal đầu tiên nếu chưa chọn hoặc id đã chọn không còn trong list
  const selectedCost = useMemo(() => {
    if (!pendingProposals.length) return null;
    if (activeCostId) {
      const found = pendingProposals.find((p) => p.id === activeCostId);
      if (found) return found;
    }
    return pendingProposals[0];
  }, [pendingProposals, activeCostId]);

  const eligibleWarranty = useMemo(() => {
    if (!selectedCost || !selectedCost.items) return [];
    return eligibleExtraWarrantyOptions(selectedCost.items);
  }, [selectedCost]);

  const targetKey = selectedCost ? selectedCost.id : null;
  const signature = JSON.stringify(selectedCost);
  const [selectionTarget, setSelectionTarget] = useState(targetKey);
  if (selectionTarget !== targetKey) { setSelectionTarget(targetKey); setSelection([]); setSheet(null); }
  const sheetValid = current && sheet !== null && sameOrderSession(sheet.key, key) && sheet.ownerKey === ownerKey && sheet.costId === targetKey && sheet.signature === signature;

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredExtraRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.isUnresolved && recovery.operation === 'extra-decision';
  const recoveryIntentId = recovery.hasRecovery && recovery.isUnresolved ? recovery.intentId : null;

  const isExpired = selectedCost ? isCostDecisionBlocked(selectedCost.expiresAt) : false;
  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const verifyAvailable = state.phase === 'unknown' || showRecovery;
  const frozen = busy || state.phase === 'unknown' || showRecovery;
  const resolved = state.phase === 'resolved' && (!selectedCost || state.targetCostId === targetKey);
  const canDecide = current && order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt && !!selectedCost && !isExpired && !frozen && !resolved;
  const latest = useRef({ key, current, sheet, sheetValid, canDecide, busy, targetKey, signature });
  useLayoutEffect(() => { latest.current = { key, current, sheet, sheetValid, canDecide, busy, targetKey, signature }; });
  const appliedTarget = useRef(targetKey);
  useLayoutEffect(() => {
    if (appliedTarget.current === targetKey || busy || frozen) return;
    appliedTarget.current = targetKey;
    if (targetKey) controller.reset();
  }, [controller, targetKey, busy, frozen]);
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.extras.status === 'loading';

  const openConfirm = (action: 'approve' | 'reject') => {
    if (!canDecide || !selectedCost || !key || !latest.current.canDecide || latest.current.targetKey !== selectedCost.id || latest.current.signature !== signature || !sameOrderSession(latest.current.key, key)) return;
    controller.prepareDecision(key, selectedCost.id, action);
    const selectedIds = action === 'approve' ? selection.filter(id => eligibleWarranty.some(w => w.itemId === id)) : [];
    selectedIds.forEach(id => controller.toggleWarranty(id));
    setSheet({
      costId: selectedCost.id,
      action,
      ownerKey,
      key: { ...key }, signature, selectedIds,
    });
  };

  const cancelConfirm = () => {
    controller.reset();
    setSheet(null);
    latest.current = { ...latest.current, sheet: null };
  };

  const submitConfirm = () => {
    const live = latest.current;
    if (!sheet || !key || !sheetValid || live.sheet !== sheet || !live.sheetValid || !live.canDecide || live.busy || !sameOrderSession(live.key, sheet.key)) return;
    const action = sheet.action;
    setSheet(null);
    latest.current = { ...live, sheet: null };
    void controller.submitDecision(sheet.key, sheet.costId, action);
  };

  const onPrimary = () => {
    if (busy) return;
    if (verifyAvailable) {
      if (recoveryIntentId && key) {
        void controller.verify(key, recoveryIntentId);
      }
      return;
    }
    if (resolved) {
      navigation.navigate('OrderTask');
      return;
    }
    openConfirm('approve');
  };

  const onBack = () => {
    if (sheetValid && sheet) {
      cancelConfirm();
      return;
    }
    navigation.goBack();
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chi phí phát sinh" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Chi phí phát sinh không được tải cho đơn lịch sử.'
            : 'Chi phí phát sinh chỉ được đọc sau khi máy chủ xác minh quyền xem đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }


  return (
    <TaskScreenShell
      title="Chi phí phát sinh"
      stage={3}
      onBack={onBack}
      secondary={
        sheetValid && sheet
          ? {
              label: 'Hủy',
              testID: 'extra-confirm-cancel',
              disabled: busy,
              onPress: cancelConfirm,
            }
          : resolved || state.phase === 'unknown' || showRecovery
            ? {
                label: 'Làm mới dữ liệu',
                testID: 'task-refresh',
                disabled: busy || refreshing,
                onPress: () => {
                  if (!busy && !refreshing) void refresh('manual');
                },
              }
            : {
                label: 'Từ chối phát sinh',
                testID: 'extra-reject',
                disabled: !canDecide,
                accessibilityHint: 'Từ chối chi phí phát sinh nhưng vẫn tiếp tục sửa chữa theo phạm vi cũ',
                onPress: () => openConfirm('reject'),
              }
      }
      primary={
        sheetValid && sheet
          ? {
              label: sheet.action === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối',
              testID: 'extra-confirm-submit',
              disabled: busy,
              accessibilityHint: sheet.action === 'approve' ? 'Duyệt chi phí phát sinh chưa phải thanh toán ngay' : 'Từ chối phát sinh và tiếp tục sửa chữa ban đầu',
              onPress: submitConfirm,
            }
          : {
              label: busy
                ? 'Đang xử lý…'
                : verifyAvailable
                  ? 'Kiểm tra lại'
                  : resolved
                    ? 'Tiếp tục'
                    : 'Duyệt chi phí',
              testID: verifyAvailable ? 'extra-verify' : resolved ? 'extra-continue' : 'extra-approve',
              disabled: busy || (!canDecide && !verifyAvailable && !resolved),
              accessibilityHint: 'Duyệt chi phí phát sinh bổ sung',
              onPress: onPrimary,
            }
      }
    >
      {showRecovery && state.phase !== 'resolved' && (
        <ReadOnlyNotice>
          Có thao tác quyết định chi phí phát sinh chưa rõ kết quả từ phiên trước. Hãy kiểm tra lại từ máy chủ, không gửi lại.
          {recovery.intentId && (
            <TouchableOpacity
              testID="extra-recovery-verify"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                if (!busy && key) void controller.verify(key, recovery.intentId);
              }}
              style={styles.recoveryButton}
            >
              <Text style={styles.recoveryButtonText}>Kiểm tra lại từ máy chủ</Text>
            </TouchableOpacity>
          )}
        </ReadOnlyNotice>
      )}

      {(!state.targetCostId || state.targetCostId === targetKey || frozen) && state.error && <ReadOnlyNotice>{state.error}</ReadOnlyNotice>}
      {resolved && state.actionSuccess && <ReadOnlyNotice>{state.actionSuccess}</ReadOnlyNotice>}

      {pendingProposals.length > 1 && (
        <View style={styles.multiProposalCard} testID="extra-proposal-selector">
          <Text style={styles.multiProposalTitle}>
            Có {pendingProposals.length} đề xuất phát sinh đang chờ duyệt:
          </Text>
          <View style={styles.proposalTabs}>
            {pendingProposals.map((prop, idx) => {
              const isSelected = selectedCost?.id === prop.id;
              return (
                <TouchableOpacity
                  key={prop.id}
                  testID={`extra-select-proposal-${prop.id}`}
                  accessibilityRole="button"
                  disabled={frozen}
                  accessibilityState={{ selected: isSelected, disabled: frozen }}
                  style={[styles.proposalTab, isSelected && styles.proposalTabSelected]}
                  onPress={() => {
                    if (!frozen) {
                      setActiveCostId(prop.id);
                      controller.reset();
                      setSheet(null);
                      setSelection([]);
                      latest.current = { ...latest.current, sheet: null };
                    }
                  }}
                >
                  <Text style={[styles.proposalTabText, isSelected && styles.proposalTabTextSelected]}>
                    Đề xuất #{idx + 1} ({quoteMoneyText(costTotal(prop))})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {selectedCost ? (
        <>
          <View style={styles.card}>
            <DetailRow label="Mã đề xuất" value={selectedCost.id} />
            {selectedCost.supersedesId ? (
              <DetailRow label="Thay thế đề xuất" value={selectedCost.supersedesId} />
            ) : null}
            <DetailRow label="Lý do phát sinh" value={selectedCost.reason || 'Kỹ thuật viên không ghi lý do'} />
            {selectedCost.expiresAt ? (
              <DetailRow
                label="Hạn duyệt"
                value={`${vnDateTimeString(selectedCost.expiresAt)}${isExpired ? ' (Đã hết hạn)' : ''}`}
              />
            ) : null}
            {typeof selectedCost.shippingFee === 'number' && selectedCost.shippingFee > 0 ? (
              <DetailRow label="Phí giao linh kiện" value={formatVnd(selectedCost.shippingFee)} />
            ) : null}
          </View>

          {isExpired && (
            <ReadOnlyNotice>
              Đề xuất chi phí phát sinh này đã hết hạn duyệt theo thời gian từ máy chủ. Bạn không thể duyệt hoặc từ chối đề xuất này nữa.
            </ReadOnlyNotice>
          )}

          {sheetValid && sheet ? (
            <View style={styles.confirmBox} testID="extra-confirm-sheet">
              <Text style={styles.confirmHeader}>
                {sheet.action === 'approve' ? 'Xác nhận duyệt chi phí' : 'Xác nhận từ chối chi phí'}
              </Text>
              {sheet.action === 'approve' ? (
                <Text style={styles.confirmText}>
                  Duyệt chi phí phát sinh chưa phải thanh toán ngay. Số tiền {quoteMoneyText(costTotal(selectedCost))} sẽ được cộng vào hóa đơn cuối cùng khi hoàn tất sửa chữa.
                </Text>
              ) : (
                <Text style={styles.confirmText}>
                  Từ chối chi phí phát sinh không hủy đơn sửa chữa gốc. Kỹ thuật viên sẽ tiếp tục thực hiện công việc theo phạm vi đã thống nhất ban đầu.
                </Text>
              )}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Chi tiết hạng mục phát sinh</Text>
            {(selectedCost.items ?? []).map((it, idx) => {
              const lineTotal = typeof it.lineTotal === 'number'
                ? it.lineTotal
                : (it.unitPrice ?? 0) * (it.quantity ?? 1);
              const isLabor = String(it.type).toLowerCase() === 'labor';
              const eligibleW = eligibleWarranty.find((w) => w.itemId === it.id);
              const isWarrantyChecked = !!eligibleW && selection.includes(eligibleW.itemId);

              return (
                <View key={it.id || String(idx)} style={styles.itemRow} testID={`extra-item-${it.id || idx}`}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemDescription}>{it.description}</Text>
                    <Text style={styles.itemSubtext}>
                      {isLabor ? 'Công thợ' : 'Linh kiện'} · {it.quantity ?? 1} x {formatVnd(it.unitPrice ?? 0)}
                    </Text>
                  </View>
                  <Text style={styles.itemLineTotal}>{formatVnd(lineTotal)}</Text>
                  {eligibleW && (
                    <TouchableOpacity
                      testID={`extra-toggle-warranty-${eligibleW.itemId}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isWarrantyChecked, disabled: !canDecide || sheetValid }}
                      disabled={!canDecide || (sheetValid && !!sheet)}
                      onPress={() => {
                        if (canDecide && !sheetValid) setSelection(ids => ids.includes(eligibleW.itemId) ? ids.filter(id => id !== eligibleW.itemId) : [...ids, eligibleW.itemId]);
                      }}
                      style={styles.warrantyToggleRow}
                    >
                      <View style={[styles.checkbox, isWarrantyChecked && styles.checkboxChecked]}>
                        {isWarrantyChecked && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.warrantyToggleLabel}>
                        Bảo hành thợ ({eligibleW.termDays} ngày, +{eligibleW.feeText})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.card} testID="extra-total-amount">
            <DetailRow
              label="Tổng tiền phát sinh"
              value={quoteMoneyText(costTotal(selectedCost))}
            />
            <DetailRow label="Bảo hành đã chọn (tính một lần mỗi hạng mục)" value={formatVnd(eligibleWarranty.filter(w => selection.includes(w.itemId)).reduce((sum, w) => sum + w.fee, 0))} />
          </View>
        </>
      ) : (
        <ReadOnlyNotice>Hiện không có đề xuất chi phí phát sinh nào cần xử lý.</ReadOnlyNotice>
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
  multiProposalCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  multiProposalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  proposalTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  proposalTab: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  proposalTabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  proposalTabText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  proposalTabTextSelected: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
  confirmBox: {
    backgroundColor: colors.tone.warning.bg,
    borderColor: colors.tone.warning.fg,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  confirmHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.tone.warning.text,
    marginBottom: 4,
  },
  confirmText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  recoveryButton: {
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  recoveryButtonText: {
    color: colors.primaryStrong,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  itemDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  itemSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemLineTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  warrantyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryStrong,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  warrantyToggleLabel: {
    fontSize: 14,
    color: colors.text,
  },
});
