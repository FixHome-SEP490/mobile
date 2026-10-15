import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useCustomerOrderPayment } from './useCustomerOrderPayment';
import { cashFact, hasCompletionRequest, invoiceFact } from './payment-facts';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { parseWholeVndInput } from '../shared/m6-amount-input';

interface FrozenCashSheet {
  agreed: boolean;
  confirmedAmount?: number;
  disputeReason?: string;
  settlementId: string;
  invoiceId: string;
  amount: number;
  ownerKey: string;
}

function parseAmount(text: string): number | null {
  return parseWholeVndInput(text, { min: 0, max: 999999999999 });
}

/**
 * C10 — cash confirmation. Exact declaration vs current invoice; agreed amount
 * or a separate discrepancy sheet with a required reason. No double confirm.
 */
export default function CashConfirmationScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerOrderPayment();
  useLoadUnloadedResources(snapshot, ['invoice', 'cash'], loadResource);

  const [agreed, setAgreed] = useState(true);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<FrozenCashSheet | null>(null);
  const [draftOwner, setDraftOwner] = useState(key);
  if (!(draftOwner === key || (!!key && !!draftOwner && sameOrderSession(draftOwner, key)))) {
    setDraftOwner(key);
    setAmountText('');
    setReason('');
    setFormError(null);
    setSheet(null);
    setAgreed(true);
  }

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'customer' && order.id === key.serviceOrderId && hasCompletionRequest(order);
  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const invoice = current && key ? invoiceFact(snapshot, key) : null;
  const cash = current && key ? cashFact(snapshot, key) : undefined;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent);
  const frozen = busy || unknown;
  const awaiting = !!cash && cash.status === 'pending_confirmation' && !!invoice && invoice.status === 'unpaid';
  const disputed = !!cash && cash.status === 'disputed';
  const sheetValid = current && !!sheet && !!cash && !!invoice && sheet.settlementId === cash.id
    && sheet.invoiceId === invoice.id && sheet.amount === invoice.amount && sheet.ownerKey === ownerKey
    && state.confirmation !== null;

  const openSheet = () => {
    if (!current || frozen || !awaiting || !cash || !invoice || !ownerKey) return;
    if (!agreed) {
      if (!reason.trim()) {
        setFormError('Hãy nhập lý do chênh lệch để kỹ thuật viên đối soát.');
        return;
      }
      setFormError(null);
      setSheet({ agreed: false, disputeReason: reason.trim(), settlementId: cash.id, invoiceId: invoice.id, amount: invoice.amount, ownerKey });
      void controller.requestCashConfirmation({ agreed: false, disputeReason: reason.trim() });
      return;
    }
    const confirmedAmount = amountText.trim() ? parseAmount(amountText) : undefined;
    if (confirmedAmount === null) {
      setFormError('Hãy nhập số tiền đã trả là số nguyên đồng, ví dụ 120000.');
      return;
    }
    setFormError(null);
    setSheet({ agreed: true, ...(confirmedAmount === undefined ? {} : { confirmedAmount }), settlementId: cash.id, invoiceId: invoice.id, amount: invoice.amount, ownerKey });
    void controller.requestCashConfirmation({ agreed: true, ...(confirmedAmount === undefined ? {} : { confirmedAmount }) });
  };

  const cancelSheet = () => {
    controller.cancelConfirmation();
    setSheet(null);
  };

  const submitSheet = () => {
    if (!sheetValid || busy) return;
    setSheet(null);
    void controller.submitConfirmation().then(() => navigation.navigate('OrderTask'));
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Xác nhận tiền mặt" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Xác nhận tiền mặt chỉ hiển thị sau khi máy chủ xác minh quyền xem đơn hiện tại và kỹ thuật viên gửi yêu cầu bàn giao.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Xác nhận tiền mặt"
      stage={4}
      onBack={() => {
        if (sheetValid) cancelSheet();
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
          ? { label: 'Kiểm tra kết quả', testID: 'cash-check-result', disabled: busy, onPress: () => navigation.navigate('OrderTask') }
          : sheetValid
            ? { label: agreed ? 'Xác nhận đã trả tiền mặt' : 'Gửi báo chênh lệch', testID: 'cash-confirm-submit', disabled: busy, onPress: submitSheet }
            : awaiting
              ? { label: 'Xem lại và xác nhận', testID: 'cash-open-sheet', disabled: frozen, onPress: openSheet }
              : undefined
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đối soát" value={cash?.id} />
        <DetailRow label="Số tiền kỹ thuật viên khai báo" value={cash ? quoteMoneyText(cash.declaredAmount) : 'Chưa có dữ liệu'} />
        <DetailRow label="Người khai báo" value={cash?.declaredByTechnicianId ?? 'Chưa có dữ liệu'} />
        <DetailRow label="Thời điểm khai báo" value={cash?.declaredAt ? vnDateTimeString(cash.declaredAt) : 'Chưa có dữ liệu'} />
        <DetailRow label="Hóa đơn hiện tại" value={invoice ? `${invoice.id} · ${quoteMoneyText(invoice.grandTotal)}` : 'Chưa có dữ liệu'} />
        {cash?.technicianNotes ? <DetailRow label="Ghi chú của kỹ thuật viên" value={cash.technicianNotes} /> : null}
      </View>
      {!awaiting && !disputed ? (
        <ReadOnlyNotice>Hiện không có khai báo tiền mặt nào chờ bạn xác nhận.</ReadOnlyNotice>
      ) : null}
      {disputed ? (
        <ReadOnlyNotice>Khai báo này đang chênh lệch và đã được ghi nhận để đối soát. Kết quả từ máy chủ là căn cứ duy nhất; không gửi xác nhận mới cho cùng khai báo.</ReadOnlyNotice>
      ) : null}
      {unknown ? (
        <ReadOnlyNotice>Có thao tác chưa rõ kết quả. Bạn không thể gửi xác nhận mới; hãy kiểm tra kết quả từ máy chủ trước.</ReadOnlyNotice>
      ) : null}
      {awaiting && !unknown ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              testID="cash-choice-agree"
              accessibilityRole="radio"
              accessibilityState={{ selected: agreed, disabled: frozen }}
              disabled={frozen}
              onPress={() => setAgreed(true)}
              style={{ flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: agreed ? colors.primaryStrong : colors.border, backgroundColor: agreed ? colors.primarySoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontWeight: '700', color: colors.text }}>Đã trả đủ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="cash-choice-dispute"
              accessibilityRole="radio"
              accessibilityState={{ selected: !agreed, disabled: frozen }}
              disabled={frozen}
              onPress={() => setAgreed(false)}
              style={{ flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: !agreed ? colors.primaryStrong : colors.border, backgroundColor: !agreed ? colors.primarySoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontWeight: '700', color: colors.text }}>Báo chênh lệch</Text>
            </TouchableOpacity>
          </View>
          {agreed ? (
            <View>
              <Text accessibilityRole="none" style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>
                Số tiền bạn đã trả (để trống nếu khớp đúng khai báo)
              </Text>
              <TextInput
                testID="cash-confirmed-amount"
                accessibilityLabel="Số tiền đã trả"
                keyboardType="numeric"
                editable={!frozen}
                value={amountText}
                onChangeText={setAmountText}
                placeholder="Ví dụ 120000"
                placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 52, paddingHorizontal: spacing.md, fontSize: 16, color: colors.text, backgroundColor: colors.surface }}
              />
            </View>
          ) : (
            <View>
              <Text accessibilityRole="none" style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>
                Lý do chênh lệch (bắt buộc)
              </Text>
              <TextInput
                testID="cash-dispute-reason"
                accessibilityLabel="Lý do chênh lệch"
                editable={!frozen}
                multiline
                value={reason}
                onChangeText={setReason}
                placeholder="Mô tả số tiền thực tế bạn đã trả"
                placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 96, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' }}
              />
            </View>
          )}
        </View>
      ) : null}
      {sheetValid && sheet ? (
        <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md }} testID="cash-confirm-sheet">
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.tone.warning.text }}>
            {sheet.agreed ? 'Xác nhận đã trả tiền mặt' : 'Xác nhận báo chênh lệch'}
          </Text>
          <DetailRow label="Mã đối soát" value={sheet.settlementId} />
          <DetailRow label="Số tiền hóa đơn" value={sheet.amount} />
          {sheet.agreed && sheet.confirmedAmount !== undefined ? <DetailRow label="Số tiền bạn đã trả" value={sheet.confirmedAmount} /> : null}
          {!sheet.agreed ? <DetailRow label="Lý do chênh lệch" value={sheet.disputeReason} /> : null}
          <TouchableOpacity
            testID="cash-confirm-cancel"
            accessibilityRole="button"
            accessibilityLabel="Hủy xác nhận"
            disabled={busy}
            onPress={cancelSheet}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Hủy xác nhận</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {formError ? <ReadOnlyNotice>{formError}</ReadOnlyNotice> : null}
      {state.message && state.phase !== 'unknown' ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
    </TaskScreenShell>
  );
}
