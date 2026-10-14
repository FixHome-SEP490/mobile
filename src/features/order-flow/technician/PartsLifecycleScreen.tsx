import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import type { OrderPartReadModel } from '../domain/order-session.types';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { sameOrderSession } from '../domain/order-session.types';
import { validateReceiveQrToken } from './parts-controller';
import { PartsQrScanner } from './PartsQrScanner';
import { useTechnicianParts } from './useTechnicianParts';
import { getRestoredPartsRecovery } from '../domain/extra-and-parts-recovery';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { lightTheme as colors, spacing } from '../../../constants/theme';

interface QrReceiveModalState {
  requestId: string;
  fulfillmentMethod?: string;
  tokenInput: string;
  scanning: boolean;
}

interface CancelModalState {
  requestId: string;
  reason: string;
}

export default function PartsLifecycleScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const focused = useIsFocused();
  const { controller, state } = useTechnicianParts();

  useLoadUnloadedResources(snapshot, ['parts'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'technician' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const isUnderRepair = order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt;

  const partsResource = snapshot?.resources.parts;
  const partsList: OrderPartReadModel[] = partsResource?.status === 'ready' && Array.isArray(partsResource.data)
    ? partsResource.data.filter(pr => pr.serviceOrderId === key?.serviceOrderId && pr.technicianId === key?.userId)
    : [];

  const [qrModal, setQrModal] = useState<QrReceiveModalState | null>(null);
  const [cancelModal, setCancelModal] = useState<CancelModalState | null>(null);

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredPartsRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.isUnresolved;

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const isUnknown = state.phase === 'unknown';
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.parts?.status === 'loading';

  const frozen = busy || isUnknown || showRecovery;
  const [usageModal, setUsageModal] = useState<{ requestId: string; itemId: string; status: 'used' | 'returned' } | null>(null);
  const [draftScope, setDraftScope] = useState({ key, focused, current, frozen });
  if (!(draftScope.key === key || !!key && sameOrderSession(draftScope.key, key)) || draftScope.focused !== focused || draftScope.current !== current || draftScope.frozen !== frozen) {
    setDraftScope({ key, focused, current, frozen }); setQrModal(null); setCancelModal(null); setUsageModal(null);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => { if (status !== 'active') { setQrModal(null); setCancelModal(null); setUsageModal(null); } });
    return () => subscription.remove();
  }, []);
  const latest = useRef({ key, current, frozen, partsList, isUnderRepair, qrModal, cancelModal, usageModal });
  useLayoutEffect(() => { latest.current = { key, current, frozen, partsList, isUnderRepair, qrModal, cancelModal, usageModal }; });
  const receiveEligible = (pr: OrderPartReadModel) => (pr.fulfillmentMethod === 'pickup' && pr.status === 'ready') || (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering');
  const onOpenReceive = (pr: OrderPartReadModel) => {
    if (!key || !current || frozen || !latest.current.current || latest.current.frozen || !sameOrderSession(latest.current.key, key) || !receiveEligible(pr)) return;
    setCancelModal(null); setUsageModal(null);
    setQrModal({ requestId: pr.id, fulfillmentMethod: pr.fulfillmentMethod, tokenInput: '', scanning: false });
  };
  const onSubmitReceive = () => {
    const live = latest.current;
    const request = live.partsList.find(pr => pr.id === qrModal?.requestId);
    if (!qrModal || live.qrModal !== qrModal || !live.current || live.frozen || (!key || !sameOrderSession(live.key, key)) || !key || !request || !receiveEligible(request)) return;
    let token: string;
    try { token = validateReceiveQrToken(qrModal.tokenInput); } catch { return; }
    latest.current = { ...live, qrModal: null };
    setQrModal(null);
    void controller.receiveByQr(key, request.id, token);
  };
  const onOpenCancel = (pr: OrderPartReadModel) => {
    if (!key || !current || frozen || !latest.current.current || latest.current.frozen || !sameOrderSession(latest.current.key, key) || pr.status !== 'requested') return;
    setQrModal(null); setUsageModal(null); setCancelModal({ requestId: pr.id, reason: '' });
  };
  const onSubmitCancel = () => {
    const live = latest.current;
    const request = live.partsList.find(pr => pr.id === cancelModal?.requestId);
    if (!cancelModal || live.cancelModal !== cancelModal || !live.current || live.frozen || (!key || !sameOrderSession(live.key, key)) || !key || request?.status !== 'requested') return;
    latest.current = { ...live, cancelModal: null };
    setCancelModal(null);
    void controller.cancelPartRequest(key, request.id, cancelModal.reason.trim() || undefined);
  };
  const onUpdateUsage = (requestId: string, itemId: string, usageStatus: 'used' | 'returned') => {
    if (!key || !current || frozen || !latest.current.current || latest.current.frozen || !sameOrderSession(latest.current.key, key) || !isUnderRepair) return;
    const request = partsList.find(pr => pr.id === requestId && pr.status === 'received');
    if (!request?.items.some(item => item.id === itemId)) return;
    setQrModal(null); setCancelModal(null); setUsageModal({ requestId, itemId, status: usageStatus });
  };
  const onSubmitUsage = () => {
    const live = latest.current;
    const request = live.partsList.find(pr => pr.id === usageModal?.requestId && pr.status === 'received');
    if (!usageModal || live.usageModal !== usageModal || !live.current || live.frozen || !live.isUnderRepair || (!key || !sameOrderSession(live.key, key)) || !key || !request?.items.some(item => item.id === usageModal.itemId)) return;
    latest.current = { ...live, usageModal: null };
    setUsageModal(null);
    void controller.updateItemUsage(key, request.id, usageModal.itemId, usageModal.status);
  };
  const closeDraft = () => { setQrModal(null); setCancelModal(null); setUsageModal(null); latest.current = { ...latest.current, qrModal: null, cancelModal: null, usageModal: null }; };
  const focusedRequestId = qrModal?.requestId ?? cancelModal?.requestId ?? usageModal?.requestId;

  const onPrimary = () => {
    if (busy) return;
    if (isUnknown || showRecovery) {
      if (recovery.hasRecovery && recovery.isUnresolved && recovery.intentId && key) {
        void controller.verify(key, recovery.intentId);
      }
      return;
    }
    navigation.navigate('OrderTask');
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Quản lý linh kiện" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Không quản lý linh kiện cho đơn lịch sử.'
            : 'Màn hình chỉ mở khi có quyền quản lý đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  const statusLabel = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === 'requested') return 'Đã gửi yêu cầu';
    if (s === 'ready') return 'Sẵn sàng lấy';
    if (s === 'delivering') return 'Đang giao';
    if (s === 'received') return 'Đã nhận linh kiện';
    if (s === 'cancelled') return 'Đã hủy';
    if (s === 'completed') return 'Đã hoàn thành';
    return status;
  };

  const getStatusBadgeStyle = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === 'requested') return styles.status_requested;
    if (s === 'ready') return styles.status_ready;
    if (s === 'delivering') return styles.status_delivering;
    if (s === 'received') return styles.status_received;
    if (s === 'cancelled') return styles.status_cancelled;
    return null;
  };

  return (
    <TaskScreenShell
      title="Quản lý linh kiện"
      stage={3}
      onBack={() => navigation.goBack()}
      secondary={{
        label: focusedRequestId && !frozen ? 'Hủy xác nhận' : 'Làm mới dữ liệu',
        testID: focusedRequestId && !frozen ? 'parts-draft-cancel' : 'task-refresh', disabled: busy || refreshing,
        onPress: () => { if (busy) return; if (focusedRequestId && !frozen) closeDraft(); else if (!refreshing) void refresh('manual'); },
      }}
      primary={{
        label: frozen ? busy ? 'Đang xử lý…' : 'Kiểm tra lại' : qrModal ? 'Xác nhận nhận linh kiện' : cancelModal ? 'Xác nhận hủy yêu cầu' : usageModal ? usageModal.status === 'used' ? 'Xác nhận đã dùng' : 'Xác nhận hoàn trả' : 'Quay lại tiến độ',
        testID: frozen ? 'parts-verify' : qrModal ? 'parts-qr-submit' : cancelModal ? 'parts-cancel-confirm' : usageModal ? 'parts-usage-confirm' : 'parts-back-task',
        disabled: busy || !frozen && !!qrModal && !qrModal.tokenInput.trim(),
        onPress: () => { if (frozen) onPrimary(); else if (qrModal) onSubmitReceive(); else if (cancelModal) onSubmitCancel(); else if (usageModal) onSubmitUsage(); else onPrimary(); },
      }}
    >
      {showRecovery && (
        <ReadOnlyNotice>
          Có thao tác linh kiện chưa rõ kết quả từ phiên trước. Vui lòng kiểm tra lại từ máy chủ.
        </ReadOnlyNotice>
      )}

      {state.error && <ReadOnlyNotice>{state.error}</ReadOnlyNotice>}
      {state.actionSuccess && <ReadOnlyNotice>{state.actionSuccess}</ReadOnlyNotice>}

      {qrModal && !frozen && (
        <View style={styles.modalCard} testID="parts-qr-modal">
          <Text style={styles.modalTitle}>Nhận linh kiện bằng mã QR</Text>
          {qrModal.scanning ? <PartsQrScanner onToken={token => { if (latest.current.current && !latest.current.frozen && latest.current.qrModal?.requestId === qrModal.requestId) setQrModal(prev => prev ? { ...prev, tokenInput: token, scanning: false } : null); }} onCancel={() => setQrModal(prev => prev ? { ...prev, scanning: false } : null)} /> : <TouchableOpacity testID="parts-qr-scan" accessibilityRole="button" style={styles.receiveActionBtn} onPress={() => { if (!frozen) setQrModal(prev => prev ? { ...prev, scanning: true } : null); }}><Text style={styles.receiveActionBtnText}>Quét mã bằng camera</Text></TouchableOpacity>}
          <Text style={styles.modalSubtext}>
            {qrModal.fulfillmentMethod === 'delivery'
              ? 'Linh kiện đang giao. Nhập mã QR từ nhân viên giao hàng để xác nhận nhận.'
              : 'Linh kiện đã sẵn sàng tại kho. Nhập mã QR tại điểm nhận để xác nhận.'}
          </Text>
          <TextInput
            testID="parts-qr-input"
            style={styles.modalInput}
            placeholder="Nhập mã QR nhận hàng..."
            placeholderTextColor={colors.textSecondary}
            value={qrModal.tokenInput}
            onChangeText={(txt) => setQrModal((prev) => prev ? { ...prev, tokenInput: txt } : null)}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Mã nhận linh kiện"
          />

        </View>
      )}

      {cancelModal && !frozen && (
        <View style={styles.modalCard} testID="parts-cancel-modal">
          <Text style={styles.modalTitle}>Xác nhận hủy yêu cầu linh kiện</Text>
          <Text style={styles.modalSubtext}>
            Bạn chỉ có thể hủy yêu cầu đã gửi, trước khi kho bắt đầu xử lý lấy hoặc giao.
          </Text>
          <TextInput
            testID="parts-cancel-reason-input"
            style={styles.modalInput}
            placeholder="Lý do hủy (tùy chọn)..."
            placeholderTextColor={colors.textSecondary}
            value={cancelModal.reason}
            onChangeText={(txt) => setCancelModal((prev) => prev ? { ...prev, reason: txt } : null)}
          />

        </View>
      )}

      {usageModal && !frozen && <ReadOnlyNotice>{usageModal.status === 'used' ? 'Xác nhận đã dùng linh kiện cho sửa chữa.' : 'Xác nhận hoàn trả linh kiện.'} Thao tác chỉ được gửi khi bạn xác nhận ở cuối màn hình.</ReadOnlyNotice>}
      {partsResource?.status === 'error' && <ReadOnlyNotice>Không tải được yêu cầu linh kiện. Hãy làm mới dữ liệu.</ReadOnlyNotice>}
      {partsResource?.status === 'loading' && <ReadOnlyNotice>Đang tải yêu cầu linh kiện…</ReadOnlyNotice>}
      {partsList.length > 0 ? (
        partsList.filter(req => !focusedRequestId || req.id === focusedRequestId).map((req, rIdx) => {
          const canReceive = receiveEligible(req);
          const canCancel = req.status === 'requested';
          const isReceived = req.status === 'received';

          return (
            <View key={req.id} style={styles.requestCard} testID={`parts-request-${req.id}`}>
              <View style={styles.requestHeader}>
                <Text style={styles.requestTitle}>
                  Yêu cầu #{rIdx + 1} ({req.requestType === 'pre_repair' ? 'Linh kiện dự kiến' : 'Linh kiện sửa chữa'})
                </Text>
                <View style={[styles.statusBadge, getStatusBadgeStyle(req.status)]}>
                  <Text style={styles.statusText}>{statusLabel(req.status)}</Text>
                </View>
              </View>

              <DetailRow label="Mã yêu cầu" value={req.id} />
              <DetailRow
                label="Hình thức nhận"
                value={req.fulfillmentMethod === 'delivery' ? 'Giao hàng tận nơi' : req.fulfillmentMethod === 'pickup' ? 'Tự lấy tại kho' : 'Chưa có thông tin'}
              />

              <Text style={styles.itemsHeader}>Danh sách linh kiện ({req.items?.length ?? 0}):</Text>
              {(req.items ?? []).map((it) => {
                const canMarkUsage = isReceived && isUnderRepair;
                const isUsed = it.usageStatus === 'used';
                const isReturned = it.usageStatus === 'returned';

                return (
                  <View key={it.id} style={styles.itemRow} testID={`parts-item-${it.id}`}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{it.partNameSnapshot || 'Linh kiện'}</Text>
                      <Text style={styles.itemQty}>Số lượng: {it.quantity}</Text>
                      <Text style={styles.itemUsage}>
                        Tình trạng: {isUsed ? 'Đã dùng' : isReturned ? 'Hoàn trả' : 'Chưa ghi nhận'}
                      </Text>
                    </View>

                    {canMarkUsage && (
                      <View style={styles.usageActions}>
                        <TouchableOpacity
                          testID={`parts-usage-used-${it.id}`}
                          accessibilityRole="button" accessibilityState={{ disabled: frozen || isUsed, selected: isUsed }}
                          disabled={frozen || isUsed}
                          style={[styles.usageBtn, isUsed && styles.usageBtnActive]}
                          onPress={() => onUpdateUsage(req.id, it.id, 'used')}
                        >
                          <Text style={[styles.usageBtnText, isUsed && styles.usageBtnTextActive]}>
                            Đã dùng
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`parts-usage-returned-${it.id}`}
                          accessibilityRole="button" accessibilityState={{ disabled: frozen || isReturned, selected: isReturned }}
                          disabled={frozen || isReturned}
                          style={[styles.usageBtn, isReturned && styles.usageBtnActive]}
                          onPress={() => onUpdateUsage(req.id, it.id, 'returned')}
                        >
                          <Text style={[styles.usageBtnText, isReturned && styles.usageBtnTextActive]}>
                            Hoàn trả
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={styles.requestFooter}>
                {canReceive && (
                  <TouchableOpacity
                    testID={`parts-receive-btn-${req.id}`}
                    accessibilityRole="button" accessibilityState={{ disabled: frozen }}
                    disabled={frozen}
                    style={styles.receiveActionBtn}
                    onPress={() => onOpenReceive(req)}
                  >
                    <Text style={styles.receiveActionBtnText}>Nhận linh kiện (QR)</Text>
                  </TouchableOpacity>
                )}
                {canCancel && (
                  <TouchableOpacity
                    testID={`parts-cancel-btn-${req.id}`}
                    accessibilityRole="button" accessibilityState={{ disabled: frozen }}
                    disabled={frozen}
                    style={styles.cancelActionBtn}
                    onPress={() => onOpenCancel(req)}
                  >
                    <Text style={styles.cancelActionBtnText}>Hủy yêu cầu</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      ) : (
        <ReadOnlyNotice>Chưa có yêu cầu linh kiện nào cho đơn hàng này.</ReadOnlyNotice>
      )}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  requestTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.tone.neutral.bg,
  },
  status_requested: { backgroundColor: colors.tone.warning.bg },
  status_ready: { backgroundColor: colors.tone.info.bg },
  status_delivering: { backgroundColor: colors.tone.violet.bg },
  status_received: { backgroundColor: colors.primarySoft },
  status_cancelled: { backgroundColor: colors.tone.neutral.bg },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  itemsHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  itemRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.xs,
  },
  itemInfo: {
    marginBottom: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  itemQty: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  itemUsage: {
    fontSize: 13,
    color: colors.primaryStrong,
    fontWeight: '500',
  },
  usageActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  usageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usageBtnActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primary,
  },
  usageBtnText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  usageBtnTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  requestFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  receiveActionBtn: {
    backgroundColor: colors.primaryStrong,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  receiveActionBtnText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelActionBtn: {
    borderWidth: 1,
    borderColor: colors.tone.danger.text,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelActionBtnText: {
    color: colors.tone.danger.text,
    fontSize: 14,
    fontWeight: '600',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  modalSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  modalInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalBtn: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnSecondary: {
    backgroundColor: colors.background,
  },
  modalBtnSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnPrimary: {
    backgroundColor: colors.primaryStrong,
  },
  modalBtnPrimaryText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  modalBtnDanger: {
    backgroundColor: colors.tone.danger.text,
  },
  modalBtnDangerText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
});
