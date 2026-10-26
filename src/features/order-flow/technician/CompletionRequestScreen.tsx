import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { partReturnsApi } from '../../../api/part-requests.api';
import { PARTS_MISMATCH, partsCompletionBlockers, partsMismatchDetails } from './parts-completion';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianCompletion } from './useTechnicianCompletion';
import { getOrderCapabilities, partsBlockers } from '../domain/order-capabilities';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

/**
 * T14 — completion request. Scope, explicit note (<=2000), known blockers
 * prevent sending; missing effective minimum may still ask the server with
 * own AFTER. Never claims enough images and never auto-completes.
 */
export default function CompletionRequestScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianCompletion();
  const navigation = useNavigation<any>();
  useLoadUnloadedResources(snapshot, ['evidence', 'quotations', 'extras', 'parts', 'invoice'], loadResource);

  // Used quantities from the custody ledger; unknown (null) when the ledger is off, then only the Backend checks quantities.
  const [usedByItem, setUsedByItem] = useState<Map<string, number> | null>(null);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [draftOwner, setDraftOwner] = useState(key);
  if (!(draftOwner === key || (!!key && !!draftOwner && sameOrderSession(draftOwner, key)))) {
    setDraftOwner(key);
    setNote('');
    setConfirming(false);
  }

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'technician' && assignmentValid && order.status === 'UNDER_REPAIR' && !order.completionRequestedAt;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent);
  const frozen = busy || unknown;
  const capabilities = snapshot ? getOrderCapabilities({ ...snapshot, pendingIntent: false }) : null;
  const evidence = snapshot?.resources.evidence.status === 'ready'
    ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId && e.type === 'AFTER')
    : null;
  const sentQuotes = snapshot?.resources.quotations.status === 'ready'
    ? snapshot.resources.quotations.data.filter(q => String(q.status).toUpperCase() === 'SENT')
    : null;
  const pendingExtras = snapshot?.resources.extras.status === 'ready'
    ? snapshot.resources.extras.data.filter(e => String(e.status).toUpperCase() === 'PENDING_APPROVAL' && e.serviceOrderId === key?.serviceOrderId)
    : null;
  const knownBlockers: string[] = [];
  if (sentQuotes && sentQuotes.length) knownBlockers.push(`${sentQuotes.length} báo giá đang chờ khách duyệt.`);
  if (pendingExtras && pendingExtras.length) knownBlockers.push(`${pendingExtras.length} chi phí phát sinh đang chờ khách duyệt.`);
  const orderId = key?.serviceOrderId;
  useEffect(() => {
    if (!orderId) return undefined;
    let live = true;
    partReturnsApi.getByOrderId(orderId).then(
      (rows) => { if (live) setUsedByItem(new Map(rows.filter((r) => r.usageRecorded !== false).map((r) => [r.partRequestItemId, r.usedQty]))); },
      () => { if (live) setUsedByItem(null); },
    );
    return () => { live = false; };
  }, [orderId, snapshot?.resources.parts]);
  const partBlock = snapshot?.resources.parts.status === 'ready' && key ? partsBlockers(snapshot.resources.parts.data, key.userId) : null;
  const partsBlocked = !!partBlock && partBlock.open + partBlock.unsettled > 0;
  if (partsBlocked) {
    if (partBlock.unsettled > 0) knownBlockers.push(`${partBlock.unsettled} linh kiện đã nhận chưa ghi dùng hoặc trả.`);
    if (partBlock.open > 0) knownBlockers.push(`${partBlock.open} yêu cầu linh kiện chưa nhận (nhận bằng QR hoặc hủy yêu cầu).`);
  } else if (usedByItem && snapshot?.resources.parts.status === 'ready' && snapshot.resources.quotations.status === 'ready' && snapshot.resources.extras.status === 'ready') {
    // Same check the Backend makes at invoice time, so a mismatch is explained here instead of after sending.
    const quote = snapshot.resources.quotations.data.find(q => q.serviceOrderId === orderId && q.technicianId === key?.userId && String(q.status).toUpperCase() === 'APPROVED') ?? null;
    const approvedCosts = snapshot.resources.extras.data.filter(e => e.serviceOrderId === orderId && String(e.status).toUpperCase() === 'APPROVED');
    const ownParts = snapshot.resources.parts.data.filter(p => p.serviceOrderId === orderId && p.technicianId === key?.userId);
    // The general mismatch sentence is replaced by the parts that are off, when they are known.
    const details = partsMismatchDetails(quote, approvedCosts, ownParts, usedByItem);
    knownBlockers.push(
      ...partsCompletionBlockers(quote, approvedCosts, ownParts, usedByItem).filter((b) => !(details.length && b === PARTS_MISMATCH)),
      ...(details.length ? [`Linh kiện chưa khớp báo giá:\n   – ${details.join('\n   – ')}`] : []),
    );
  }
  if (!partsBlocked && capabilities && !capabilities.canRequestCompletion && !capabilities.canAttemptRequestCompletion) {
    knownBlockers.push('Ảnh sau sửa chữa chưa đạt điều kiện gửi bàn giao.');
  }
  const noteTooLong = note.trim().length > 2000;
  const sheetValid = current && confirming && state.confirmation !== null
    && state.confirmation.operation === 'request-completion' && !frozen;
  const canSend = current && !frozen && knownBlockers.length === 0 && !noteTooLong;

  const openConfirm = () => {
    if (!canSend || !key) return;
    setConfirming(true);
    void controller.requestCompletion(note.trim());
  };

  const cancelConfirm = () => {
    controller.cancelConfirmation();
    setConfirming(false);
  };

  const submitConfirm = () => {
    if (!sheetValid || busy) return;
    setConfirming(false);
    void controller.submitConfirmation().then(() => navigation.navigate('OrderTask'));
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Bàn giao và yêu cầu thanh toán" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Bàn giao chỉ thực hiện trên đơn đang sửa chữa thuộc về bạn và chưa có yêu cầu bàn giao.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Bàn giao và yêu cầu thanh toán"
      stage={3}
      onBack={() => {
        if (sheetValid) cancelConfirm();
        else navigation.goBack();
      }}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh || busy,
        onPress: () => { if (canRefresh && !busy) void refresh('manual'); },
      }}
      primary={
        unknown
          ? { label: 'Kiểm tra lại', testID: 'completion-verify', disabled: busy,
              onPress: () => { if (!busy) void controller.verify(); } }
          : sheetValid
            ? { label: 'Xác nhận gửi bàn giao', testID: 'completion-confirm-submit', disabled: busy,
                accessibilityHint: 'Gửi yêu cầu bàn giao và yêu cầu thanh toán cho đơn này', onPress: submitConfirm }
            : { label: 'Xem lại và gửi bàn giao', testID: 'completion-open-sheet', disabled: !canSend, onPress: openConfirm }
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order.code} />
        <DetailRow label="Dịch vụ" value={order.serviceName} />
        <DetailRow
          label="Ảnh sau sửa chữa của bạn"
          value={evidence === null ? 'Đang tải…' : `${evidence.length} ảnh`}
        />
      </View>
      {knownBlockers.length ? (
        <ReadOnlyNotice>
          {`Chưa thể bàn giao:\n${knownBlockers.map((b) => `• ${b}`).join('\n')}`}
        </ReadOnlyNotice>
      ) : capabilities && !capabilities.canRequestCompletion && capabilities.canAttemptRequestCompletion ? (
        <ReadOnlyNotice>
          Máy chủ sẽ kiểm tra điều kiện ảnh và linh kiện khi bạn gửi. Ứng dụng không tự kết luận đã đủ ảnh.
        </ReadOnlyNotice>
      ) : null}
      {partsBlocked && !unknown ? (
        <TouchableOpacity testID="completion-open-parts" accessibilityRole="button" onPress={() => navigation.navigate('PartsLifecycle')}
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryStrong, borderRadius: 12 }}>
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Mở quản lý linh kiện để xử lý</Text>
        </TouchableOpacity>
      ) : null}
      {unknown ? (
        <ReadOnlyNotice>Có thao tác chưa rõ kết quả. Bạn không thể gửi bàn giao mới; hãy kiểm tra lại từ máy chủ trước.</ReadOnlyNotice>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, gap: 8 }}>
        <Text accessibilityRole="none" style={{ color: colors.textSecondary, fontSize: 13 }}>
          Ghi chú bàn giao (không bắt buộc, tối đa 2.000 ký tự)
        </Text>
        <TextInput
          testID="completion-note"
          accessibilityLabel="Ghi chú bàn giao"
          editable={!frozen}
          multiline
          value={note}
          onChangeText={setNote}
          placeholder="Mô tả công việc đã hoàn tất"
          placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: noteTooLong ? colors.error : colors.border, borderRadius: 8, minHeight: 96, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' }}
        />
        {noteTooLong ? <Text style={{ color: colors.error, fontSize: 14 }}>Ghi chú bàn giao tối đa 2.000 ký tự.</Text> : null}
      </View>
      {sheetValid ? (
        <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md }} testID="completion-confirm-sheet">
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.tone.warning.text }}>Xác nhận gửi bàn giao</Text>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
            Gửi bàn giao và yêu cầu thanh toán cho đơn {order.code}. Khách hàng sẽ thấy hóa đơn để thanh toán; đơn chưa hoàn thành ở bước này.
          </Text>
        </View>
      ) : null}
      {state.message && state.phase !== 'unknown' ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
    </TaskScreenShell>
  );
}
