import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianCashDeclaration } from './useTechnicianCashDeclaration';
import { hasCompletionRequest, invoiceFact, cashFact } from '../customer/payment-facts';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { parseWholeVndInput } from '../shared/m6-amount-input';

function parseAmount(text: string): number | null {
  return parseWholeVndInput(text, { min: 0, max: 999999999999 });
}

/**
 * T15a — cash declaration. Actual received amount only; the invoice total is
 * shown as reference and never prefilled as received cash. First declaration
 * only; existing rows are read/support. Explicit amount confirm.
 */
export default function CashDeclarationScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianCashDeclaration();
  const navigation = useNavigation<any>();
  useLoadUnloadedResources(snapshot, ['invoice', 'cash'], loadResource);

  const [amountText, setAmountText] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [draftOwner, setDraftOwner] = useState(key);
  if (!(draftOwner === key || (!!key && !!draftOwner && sameOrderSession(draftOwner, key)))) {
    setDraftOwner(key);
    setAmountText('');
    setNotes('');
    setFormError(null);
    setConfirming(false);
  }

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'technician' && assignmentValid && hasCompletionRequest(order)
    && (order.status === 'UNDER_REPAIR' || order.status === 'COMPLETED');
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent);
  const frozen = busy || unknown;
  const invoice = current && key ? invoiceFact(snapshot, key) : null;
  const cash = current && key ? cashFact(snapshot, key) : undefined;
  const eligible = !!invoice && invoice.status === 'unpaid' && cash === null;
  const existingCash = cash !== null && cash !== undefined;
  const parsed = parseAmount(amountText);
  const notesTooLong = notes.trim().length > 2000;
  const sheetValid = current && confirming && state.confirmation !== null && !frozen && eligible;
  const canSend = current && !frozen && eligible && parsed !== null && !notesTooLong;

  const openConfirm = () => {
    if (!current || frozen || !eligible) return;
    if (parsed === null) {
      setFormError('Hãy nhập số tiền thực nhận là số nguyên đồng, ví dụ 120000. Không để trống.');
      return;
    }
    if (notesTooLong) {
      setFormError('Ghi chú tối đa 2.000 ký tự.');
      return;
    }
    setFormError(null);
    setConfirming(true);
    void controller.requestDeclaration({ declaredAmount: parsed, ...(notes.trim() ? { technicianNotes: notes.trim() } : {}) });
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
      <TaskScreenShell title="Khai báo tiền mặt" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Khai báo tiền mặt chỉ thực hiện trên đơn đã bàn giao thuộc về bạn.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Khai báo tiền mặt"
      stage={4}
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
          ? { label: 'Kiểm tra lại', testID: 'cash-declare-verify', disabled: busy,
              onPress: () => { if (!busy) void controller.verify(); } }
          : sheetValid
            ? { label: 'Xác nhận đã nhận tiền', testID: 'cash-declare-submit', disabled: busy,
                accessibilityHint: 'Gửi khai báo số tiền mặt đã nhận đúng số đã chốt', onPress: submitConfirm }
            : { label: 'Xem lại và khai báo', testID: 'cash-declare-open-sheet', disabled: !canSend, onPress: openConfirm }
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã hóa đơn" value={invoice?.id} />
        <DetailRow label="Tổng hóa đơn (tham khảo)" value={invoice ? quoteMoneyText(invoice.grandTotal) : 'Chưa có dữ liệu'} />
        {existingCash ? (
          <DetailRow label="Đối soát hiện có" value={`${cash?.id} · ${String(cash?.status)}`} />
        ) : null}
      </View>
      {!eligible ? (
        <ReadOnlyNotice>
          {existingCash
            ? 'Đơn đã có khai báo tiền mặt; khai báo hiện có được đọc và đối soát, không ghi đè bằng khai báo mới.'
            : 'Hóa đơn hiện không cho phép khai báo tiền mặt.'}
        </ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>Hãy nhập đúng số tiền mặt bạn đã nhận từ khách hàng. Tổng hóa đơn phía trên chỉ để tham khảo, không phải số tiền đã nhận.</ReadOnlyNotice>
      )}
      {unknown ? (
        <ReadOnlyNotice>Có thao tác chưa rõ kết quả. Bạn không thể gửi khai báo mới; hãy kiểm tra lại từ máy chủ trước.</ReadOnlyNotice>
      ) : null}
      {eligible && !unknown ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, gap: 12 }}>
          <View>
            <Text accessibilityRole="none" style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>
              Số tiền thực nhận (đồng)
            </Text>
            <TextInput
              testID="cash-declare-amount"
              accessibilityLabel="Số tiền thực nhận"
              keyboardType="numeric"
              editable={!frozen}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="Ví dụ 120000"
              placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 52, paddingHorizontal: spacing.md, fontSize: 16, color: colors.text, backgroundColor: colors.surface }}
            />
          </View>
          <View>
            <Text accessibilityRole="none" style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>
              Ghi chú (không bắt buộc, tối đa 2.000 ký tự)
            </Text>
            <TextInput
              testID="cash-declare-notes"
              accessibilityLabel="Ghi chú khai báo"
              editable={!frozen}
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder="Ghi chú thêm nếu cần"
              placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 96, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' }}
            />
          </View>
        </View>
      ) : null}
      {sheetValid && state.confirmation ? (
        <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md }} testID="cash-declare-sheet">
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.tone.warning.text }}>Xác nhận đã nhận tiền mặt</Text>
          <DetailRow label="Mã hóa đơn" value={state.confirmation.invoiceId} />
          <DetailRow label="Số tiền thực nhận" value={state.confirmation.dto.declaredAmount} />
          {state.confirmation.dto.technicianNotes ? <DetailRow label="Ghi chú" value={state.confirmation.dto.technicianNotes} /> : null}
        </View>
      ) : null}
      {formError ? <ReadOnlyNotice>{formError}</ReadOnlyNotice> : null}
      {state.message && state.phase !== 'unknown' ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
    </TaskScreenShell>
  );
}
