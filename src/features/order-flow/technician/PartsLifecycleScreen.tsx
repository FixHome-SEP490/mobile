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
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { partsBlockers } from '../domain/order-capabilities';
import { PartItemRow } from './PartItemRow';
import { approvedQuoteQty, approvedUsageCap } from './held-parts';
import { usePartReturns } from './usePartReturns';
import { lightTheme as colors, spacing, type ToneName } from '../../../constants/theme';

interface QrReceiveModalState {
  requestId: string;
  fulfillmentMethod?: string;
  tokenInput: string;
  scanning: boolean;
  reveal: boolean;
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

  useLoadUnloadedResources(snapshot, ['parts', 'quotations'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'technician' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const isUnderRepair = order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt;
  const isAccepted = order?.status === 'ACCEPTED';

  const partsResource = snapshot?.resources.parts;
  const partsList: OrderPartReadModel[] = partsResource?.status === 'ready' && Array.isArray(partsResource.data)
    ? partsResource.data.filter(pr => pr.serviceOrderId === key?.serviceOrderId && pr.technicianId === key?.userId)
    : [];

  const quotationsResource = snapshot?.resources.quotations;
  const quotationsList = quotationsResource?.status === 'ready' ? quotationsResource.data : null;
  const returns = usePartReturns(current, partsResource?.status === 'ready' ? partsResource.requestSeq : 0);
  const usedOf = (itemId: string) => {
    const record = returns.records[itemId];
    if (record) return record.usedQty;
    const line = partsList.flatMap(pr => pr.items).find(i => i.id === itemId);
    return line?.usageStatus === 'used' ? line.quantity : 0;
  };
  const blockers = key ? partsBlockers(partsList, key.userId) : { open: 0, unsettled: 0 };
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
    setQrModal({ requestId: pr.id, fulfillmentMethod: pr.fulfillmentMethod, tokenInput: '', scanning: false, reveal: false });
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
  const usageItemName = usageModal ? partsList.find(pr => pr.id === usageModal.requestId)?.items.find(it => it.id === usageModal.itemId)?.partNameSnapshot : undefined;

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

  const statusTone = (status: string): ToneName => {
    const v = String(status).toLowerCase();
    return v === 'requested' ? 'warning' : v === 'ready' ? 'info' : v === 'delivering' ? 'violet' : v === 'received' ? 'success' : 'neutral';
  };

  /** Where the request came from: shown as the section the card sits in. */
  const SOURCES: { type: string; title: string; hint: string }[] = [
    { type: 'pre_repair', title: 'Yêu cầu trước khi sửa', hint: 'Linh kiện bạn đã yêu cầu để chuẩn bị cho báo giá.' },
    { type: 'quotation', title: 'Theo báo giá', hint: 'Phần còn thiếu sau khi khách duyệt báo giá.' },
    { type: 'additional', title: 'Chi phí phát sinh', hint: 'Linh kiện của chi phí phát sinh khách đã duyệt.' },
  ];

  const renderRequest = (req: OrderPartReadModel, index: number, count: number) => {
    const canReceive = receiveEligible(req);
    const canCancel = req.status === 'requested';
    const isReceived = req.status === 'received';
    const tone = colors.tone[statusTone(req.status)];
    const method = req.fulfillmentMethod === 'delivery' ? 'Giao tận nơi' : req.fulfillmentMethod === 'pickup' ? 'Tự lấy tại kho' : 'Chưa có hình thức nhận';
    return (
      <View key={req.id} style={styles.requestCard} testID={`parts-request-${req.id}`}>
        <View style={styles.requestHeader}>
          <View style={styles.requestTitleWrap}>
            <Text style={styles.requestTitle}>{count > 1 ? `Lần ${index + 1} · ${method}` : method}</Text>
            <Text style={styles.requestMeta}>{`Mã #${String(req.id).slice(-6).toUpperCase()}`}</Text>
          </View>
          <View accessible accessibilityLabel={`Trạng thái: ${statusLabel(req.status)}`} style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.statusText, { color: tone.text }]}>{statusLabel(req.status)}</Text>
          </View>
        </View>

        {(req.items ?? []).map(it => (
          <PartItemRow
            key={it.id}
            item={it}
            received={isReceived}
            canMarkUsage={isUnderRepair}
            frozen={frozen}
            record={returns.records[it.id]}
            busy={returns.busy}
            quotedQty={approvedQuoteQty(it, req.requestType, quotationsList, key!.serviceOrderId)}
            maxUsed={approvedUsageCap(it, req.requestType, partsList, quotationsList, key!.serviceOrderId, usedOf)}
            onWhole={status => onUpdateUsage(req.id, it.id, status)}
            onSaveUsed={quantity => returns.saveUsedQty(req.id, returns.records[it.id], quantity)}
            onDeclare={quantity => returns.declareReturn(req.id, returns.records[it.id], quantity)}
          />
        ))}

        {(canReceive || canCancel) && (
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
        )}
      </View>
    );
  };

  const visibleRequests = partsList.filter(req => !focusedRequestId || req.id === focusedRequestId);
  const otherRequests = visibleRequests.filter(req => !SOURCES.some(source => source.type === req.requestType));
  const groups = [
    ...SOURCES.map(source => ({ ...source, requests: visibleRequests.filter(req => req.requestType === source.type) })),
    { type: 'other', title: 'Linh kiện khác', hint: '', requests: otherRequests },
  ].filter(group => group.requests.length);

  return (
    <TaskScreenShell
      title="Quản lý linh kiện"
      stage={3}
      onBack={() => navigation.goBack()}
      secondary={{
        label: focusedRequestId && !frozen ? 'Quay lại' : 'Làm mới dữ liệu',
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
        <ReadOnlyNotice tone="warning">
          Có thao tác linh kiện chưa rõ kết quả từ phiên trước. Vui lòng kiểm tra lại từ máy chủ.
        </ReadOnlyNotice>
      )}

      {!focusedRequestId && (() => {
        const handover = isUnderRepair && partsList.length > 0;
        const lines = [
          handover && blockers.unsettled > 0 ? `${blockers.unsettled} linh kiện chưa ghi dùng hoặc trả.` : '',
          handover && blockers.open > 0 ? `${blockers.open} yêu cầu chưa nhận (nhận bằng QR hoặc hủy yêu cầu).` : '',
          Object.values(returns.records).some(r => r.blocksNewWork) ? 'Chưa trả đủ linh kiện nên chưa nhận được việc mới.' : '',
        ].filter(Boolean);
        if (lines.length) return <ReadOnlyNotice tone="warning">{[handover && blockers.open + blockers.unsettled > 0 ? 'Chưa thể gửi bàn giao:' : 'Cần xử lý:', ...lines.map(l => `• ${l}`)].join('\n')}</ReadOnlyNotice>;
        return handover ? <ReadOnlyNotice tone="success">Linh kiện đã xử lý đủ, không còn gì chặn gửi bàn giao.</ReadOnlyNotice> : null;
      })()}
      {returns.message && <ReadOnlyNotice tone={returns.message.tone}>{returns.message.text}</ReadOnlyNotice>}
      {state.error && <ReadOnlyNotice tone="error">{state.error}</ReadOnlyNotice>}
      {state.actionSuccess && <ReadOnlyNotice tone="success">{state.actionSuccess}</ReadOnlyNotice>}

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
            secureTextEntry={!qrModal.reveal}
            accessibilityLabel="Mã nhận linh kiện"
          />
          <TouchableOpacity
            testID="parts-qr-reveal"
            accessibilityRole="button"
            accessibilityLabel={qrModal.reveal ? 'Ẩn mã nhận hàng' : 'Hiện mã nhận hàng để kiểm tra'}
            onPress={() => setQrModal(prev => prev ? { ...prev, reveal: !prev.reveal } : null)}
            style={styles.revealBtn}
          >
            <Text style={styles.revealText}>{qrModal.reveal ? 'Ẩn mã' : 'Hiện mã để kiểm tra'}</Text>
          </TouchableOpacity>

        </View>
      )}

      {cancelModal && !frozen && (
        <View style={styles.modalCard} testID="parts-cancel-modal">
          <Text style={styles.modalTitle}>Xác nhận hủy yêu cầu linh kiện</Text>
          <Text style={styles.modalSubtext}>
            Bạn chỉ có thể hủy yêu cầu đã gửi, trước khi kho bắt đầu xử lý lấy hoặc giao.
          </Text>
          <TextInput accessibilityLabel="Lý do hủy"
            testID="parts-cancel-reason-input"
            style={styles.modalInput}
            placeholder="Lý do hủy (tùy chọn)..."
            placeholderTextColor={colors.textSecondary}
            value={cancelModal.reason}
            onChangeText={(txt) => setCancelModal((prev) => prev ? { ...prev, reason: txt } : null)}
          />

        </View>
      )}

      {usageModal && !frozen && (
        <ReadOnlyNotice tone="warning">
          {usageModal.status === 'used' ? 'Xác nhận đã dùng' : 'Xác nhận hoàn trả'}: {usageItemName ?? 'linh kiện đã chọn'}. Thao tác chỉ được gửi khi bạn bấm xác nhận ở cuối màn hình.
        </ReadOnlyNotice>
      )}
      {partsResource?.status === 'error' && <ReadOnlyNotice tone="error">Không tải được yêu cầu linh kiện. Hãy làm mới dữ liệu.</ReadOnlyNotice>}
      {partsResource?.status === 'loading' && <ReadOnlyNotice>Đang tải yêu cầu linh kiện…</ReadOnlyNotice>}
      {partsList.length > 0 ? (
        groups.map(group => (
            <View key={group.type} style={styles.group} testID={`parts-group-${group.type}`}>
              <View style={styles.groupHead}>
                <Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text>
                {group.hint ? <Text style={styles.groupHint}>{group.hint}</Text> : null}
              </View>
              {group.requests.map((req, index) => renderRequest(req, index, group.requests.length))}
            </View>
        ))
      ) : (
        <>
          <ReadOnlyNotice>Chưa có yêu cầu linh kiện nào cho đơn hàng này.</ReadOnlyNotice>
          {(isAccepted || isUnderRepair) && partsResource?.status === 'ready' && (
            <TouchableOpacity
              testID="parts-empty-cta"
              accessibilityRole="button"
              style={styles.emptyCta}
              onPress={() => navigation.navigate(isAccepted ? 'AcceptedParts' : 'ExtraProposal')}
            >
              <Text style={styles.emptyCtaText}>{isAccepted ? 'Chuẩn bị linh kiện cho đơn này' : 'Đề xuất chi phí phát sinh (linh kiện bổ sung)'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupHead: { gap: 2 },
  groupTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  groupHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  requestMeta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: spacing.sm,
  },
  requestTitleWrap: { flex: 1, minWidth: 0, gap: 2 },
  requestTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
  },
  statusBadge: {
    flexShrink: 0,
    maxWidth: '45%',
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 24,
    justifyContent: 'center',
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
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
  revealBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  revealText: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  emptyCta: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryStrong,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  emptyCtaText: {
    color: colors.primaryStrong,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
