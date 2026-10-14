import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../../store/auth.store';
import { useCustomerWallet } from './useCustomerWallet';
import { takePendingWalletReturn } from '../../../navigation/customer-wallet-return';
import { parseWholeVndInput } from '../shared/m6-amount-input';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

function parseTopUpAmount(text: string): number | null {
  return parseWholeVndInput(text, { min: 10000, max: 50000000 });
}

interface FrozenTopUpSheet {
  amount: number;
  idempotencyKey: string;
}

/**
 * Customer-only wallet overview + top-up. Separate from any order task and
 * from the Technician wallet. Top-up credit needs the exact returned
 * paymentId + authoritative PAYMENT ledger row; balance changes never count.
 */
export default function CustomerWalletScreen() {
  const navigation = useNavigation<any>();
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const role = useAuthStore(s => s.user?.role ?? null);
  const { controller, state } = useCustomerWallet();
  const [page, setPage] = useState(1);
  const [amountText, setAmountText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<FrozenTopUpSheet | null>(null);
  const focused = useIsFocused();

  // Root gate holds a canonical GET-refresh signal (cold getInitialURL or
  // warm url event) even when this screen was not mounted. Spend it here
  // through the frozen GET-only hook; no query flag is ever retained.
  useEffect(() => {
    if (!focused) return;
    if (takePendingWalletReturn()) void controller.verify();
  }, [controller, focused]);

  if (!authenticated || role !== 'customer') {
    return (
      <TaskScreenShell title="Ví FixHome" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Bạn không có quyền xem nội dung này.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const summary = state.summary.status === 'ready' ? state.summary.data : null;
  const summaryError = state.summary.status === 'error';
  const markerUnknown = state.phase === 'unknown';
  const sheetValid = !!sheet && state.confirmation !== null
    && state.confirmation.dto.amount === sheet.amount
    && state.confirmation.dto.idempotencyKey === sheet.idempotencyKey;
  const totalPages = summary && summary.meta.totalPages >= 1 ? summary.meta.totalPages : 1;

  const request = () => {
    const amount = parseTopUpAmount(amountText);
    if (amount === null) {
      setFormError('Hãy nhập số tiền nạp từ 10.000 ₫ đến 50.000.000 ₫, là số nguyên đồng.');
      return;
    }
    setFormError(null);
    setSheet(null);
    void controller.requestTopUp(amount);
  };

  const openSheet = () => {
    if (!state.confirmation || busy) return;
    setSheet({ amount: state.confirmation.dto.amount, idempotencyKey: state.confirmation.dto.idempotencyKey });
  };

  const cancelSheet = () => {
    controller.cancelConfirmation();
    setSheet(null);
  };

  const submitSheet = () => {
    if (!sheetValid || busy) return;
    setSheet(null);
    void controller.submitConfirmation();
  };

  const changePage = (next: number) => {
    if (busy || next < 1 || next > totalPages || next === page) return;
    setPage(next);
    void controller.verify(next);
  };

  return (
    <TaskScreenShell
      title="Ví FixHome"
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới',
        testID: 'wallet-refresh',
        disabled: busy,
        onPress: () => { if (!busy) void controller.verify(page); },
      }}
      primary={
        sheetValid && sheet
          ? { label: `Xác nhận nạp ${formatVnd(sheet.amount)}`, testID: 'wallet-topup-submit', disabled: busy,
              accessibilityHint: 'Tạo một liên kết nạp tiền đúng số tiền đã chốt', onPress: submitSheet }
          : state.confirmation && !sheet
            ? { label: 'Xem lại và xác nhận', testID: 'wallet-topup-open-sheet', disabled: busy, onPress: openSheet }
            : state.urlReady
              ? { label: 'Mở cổng nạp tiền', testID: 'wallet-topup-open-browser', disabled: busy,
                  onPress: () => { if (!busy) void controller.openPaymentUrl(); } }
              : { label: busy ? 'Đang xử lý…' : 'Kiểm tra số tiền nạp', testID: 'wallet-topup-request', disabled: busy, onPress: request }
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow
          label="Số dư khả dụng"
          value={summary ? formatVnd(Number(summary.balance)) : summaryError ? 'Chưa tải được số dư' : 'Đang tải…'}
        />
        {summaryError ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, paddingBottom: spacing.sm }}>
            Số dư lỗi không được xem như số dư 0; hãy làm mới.
          </Text>
        ) : null}
      </View>
      {markerUnknown ? (
        <ReadOnlyNotice>Lần nạp trước chưa rõ kết quả. Hãy kiểm tra sổ giao dịch bên dưới; không tạo yêu cầu nạp mới khi còn thao tác chưa rõ.</ReadOnlyNotice>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Nạp tiền vào ví</Text>
        <Text accessibilityRole="none" style={{ color: colors.textSecondary, fontSize: 13 }}>
          Số tiền từ 10.000 ₫ đến 50.000.000 ₫. Nạp tiền không tự thanh toán hóa đơn nào.
        </Text>
        <TextInput
          testID="wallet-topup-amount"
          accessibilityLabel="Số tiền nạp"
          keyboardType="numeric"
          editable={!busy && !markerUnknown}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="Ví dụ 100000"
          placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 52, paddingHorizontal: spacing.md, fontSize: 16, color: colors.text, backgroundColor: colors.surface }}
        />
        {sheetValid && sheet ? (
          <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md }} testID="wallet-topup-sheet">
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.tone.warning.text }}>Xác nhận nạp tiền</Text>
            <DetailRow label="Số tiền đã chốt" value={formatVnd(sheet.amount)} />
            <TouchableOpacity
              testID="wallet-topup-cancel"
              accessibilityRole="button"
              accessibilityLabel="Hủy xác nhận nạp tiền"
              disabled={busy}
              onPress={cancelSheet}
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Hủy xác nhận</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {formError ? <Text style={{ color: colors.error, fontSize: 14 }}>{formError}</Text> : null}
        {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, paddingVertical: spacing.md }}>Lịch sử giao dịch</Text>
        {!summary ? (
          <Text style={{ color: colors.textSecondary, paddingBottom: spacing.md }}>Đang tải sổ giao dịch từ máy chủ…</Text>
        ) : summary.transactions.length === 0 ? (
          <Text style={{ color: colors.textSecondary, paddingBottom: spacing.md }}>Chưa có giao dịch nào.</Text>
        ) : (
          summary.transactions.map(tx => (
            <View key={tx.id} testID={`wallet-tx-${tx.id}`} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <DetailRow label={tx.type === 'top_up' ? 'Nạp tiền' : tx.type === 'invoice_payment' ? 'Thanh toán hóa đơn' : tx.type === 'refund' ? 'Hoàn tiền' : 'Điều chỉnh'} value={quoteMoneyText(tx.amount)} />
              <DetailRow label="Tham chiếu" value={tx.referenceId ?? 'Không có'} />
              <DetailRow label="Thời điểm" value={vnDateTimeString(tx.createdAt)} />
            </View>
          ))
        )}
      </View>
      {summary && totalPages > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            testID="wallet-page-prev"
            accessibilityRole="button"
            accessibilityLabel="Trang giao dịch trước"
            disabled={busy || page <= 1}
            onPress={() => changePage(page - 1)}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, opacity: busy || page <= 1 ? 0.5 : 1 }}
          >
            <Text style={{ fontWeight: '600', color: colors.text }}>Trang trước</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="wallet-page-next"
            accessibilityRole="button"
            accessibilityLabel="Trang giao dịch sau"
            disabled={busy || page >= totalPages}
            onPress={() => changePage(page + 1)}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, opacity: busy || page >= totalPages ? 0.5 : 1 }}
          >
            <Text style={{ fontWeight: '600', color: colors.text }}>Trang sau</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TaskScreenShell>
  );
}
