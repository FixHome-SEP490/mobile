import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { wholeVnd } from '../../../api/customer-wallet.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useCustomerOrderPayment } from './useCustomerOrderPayment';
import { hasCompletionRequest, invoiceFact } from './payment-facts';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

interface FrozenWalletSheet {
  invoiceId: string;
  amount: number;
  balance: number;
  ownerKey: string;
}

/**
 * C09a — wallet payment. Explicit request, frozen sheet with exact
 * invoice/balance, explicit submit. Top-up is a separate flow, never auto.
 */
export default function WalletPaymentScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerOrderPayment();
  useLoadUnloadedResources(snapshot, ['invoice', 'cash'], loadResource);

  const [sheet, setSheet] = useState<FrozenWalletSheet | null>(null);
  const [draftOwner, setDraftOwner] = useState(key);
  if (!(draftOwner === key || (!!key && !!draftOwner && sameOrderSession(draftOwner, key)))) {
    setDraftOwner(key);
    setSheet(null);
  }

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'customer' && order.id === key.serviceOrderId && hasCompletionRequest(order);
  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const invoice = current && key ? invoiceFact(snapshot, key) : null;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent);
  const frozen = busy || unknown;
  const unpaid = !!invoice && invoice.status === 'unpaid';
  const balance = state.wallet.status === 'ready' ? wholeVnd(state.wallet.data.balance) : null;
  const walletError = state.wallet.status === 'error';
  const sufficient = balance !== null && !!invoice && balance >= invoice.amount;
  const sheetValid = current && !!sheet && !!invoice && sheet.invoiceId === invoice.id
    && sheet.amount === invoice.amount && sheet.ownerKey === ownerKey && state.confirmation !== null
    && state.confirmation.invoiceId === invoice.id && state.confirmation.amount === invoice.amount;

  const request = () => {
    if (!current || frozen || !unpaid) return;
    setSheet(null);
    void controller.requestPayment('wallet');
  };

  const openSheet = () => {
    if (!current || frozen || !unpaid || !invoice || !ownerKey || balance === null || !sufficient || !state.confirmation) return;
    setSheet({ invoiceId: invoice.id, amount: invoice.amount, balance, ownerKey });
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
      <TaskScreenShell title="Thanh toán bằng ví" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Thanh toán bằng ví chỉ hiển thị sau khi máy chủ xác minh quyền xem đơn hiện tại và kỹ thuật viên gửi yêu cầu bàn giao.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Thanh toán bằng ví"
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
          ? { label: 'Kiểm tra kết quả', testID: 'wallet-check-result', disabled: busy,
              onPress: () => navigation.navigate('OrderTask') }
          : sheetValid && sheet
            ? { label: `Xác nhận thanh toán ${formatVnd(sheet.amount)}`, testID: 'wallet-confirm-submit',
                disabled: busy, accessibilityHint: 'Gửi yêu cầu trừ ví đúng số tiền đã chốt',
                onPress: submitSheet }
            : state.confirmation && !sheet && sufficient
              ? { label: 'Xem lại và xác nhận', testID: 'wallet-open-sheet', disabled: frozen, onPress: openSheet }
              : { label: busy ? 'Đang xử lý…' : 'Kiểm tra số dư ví', testID: 'wallet-request',
                  disabled: frozen || !unpaid, onPress: request }
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã hóa đơn" value={invoice?.id} />
        <DetailRow label="Tổng tiền phải trả" value={invoice ? quoteMoneyText(invoice.grandTotal) : 'Chưa có dữ liệu'} />
        <DetailRow
          label="Số dư ví"
          value={balance !== null ? formatVnd(balance) : walletError ? 'Chưa tải được số dư' : 'Đang tải…'}
        />
      </View>
      {unknown ? (
        <ReadOnlyNotice>Có thao tác thanh toán chưa rõ kết quả. Bạn không thể gửi thêm yêu cầu; hãy kiểm tra kết quả từ máy chủ trước.</ReadOnlyNotice>
      ) : null}
      {!unpaid ? (
        <ReadOnlyNotice>Hóa đơn hiện không ở trạng thái chờ thanh toán.</ReadOnlyNotice>
      ) : walletError ? (
        <ReadOnlyNotice>Chưa tải được số dư ví. Số dư lỗi không được xem như số dư 0; hãy làm mới dữ liệu.</ReadOnlyNotice>
      ) : balance !== null && invoice && !sufficient ? (
        <ReadOnlyNotice>Số dư ví chưa đủ để trả hóa đơn này. Hãy nạp thêm ví ở mục Ví của bạn rồi quay lại; ứng dụng không tự trừ tiền sau khi nạp.</ReadOnlyNotice>
      ) : null}
      {sheetValid && sheet ? (
        <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md }} testID="wallet-confirm-sheet">
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.tone.warning.text }}>Xác nhận thanh toán bằng ví</Text>
          <DetailRow label="Mã hóa đơn" value={sheet.invoiceId} />
          <DetailRow label="Số tiền trừ ví" value={formatVnd(sheet.amount)} />
          <DetailRow label="Số dư ví lúc xác nhận" value={formatVnd(sheet.balance)} />
          <TouchableOpacity
            testID="wallet-confirm-cancel"
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
      {state.message && state.phase !== 'unknown' ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
    </TaskScreenShell>
  );
}
