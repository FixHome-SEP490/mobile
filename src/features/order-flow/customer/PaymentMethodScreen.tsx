import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useCustomerOrderPayment } from './useCustomerOrderPayment';
import { hasCompletionRequest, invoiceFact, cashFact } from './payment-facts';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { M6InvoiceSummary } from '../shared/M6InvoiceSummary';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import type { PaymentMethod } from './payment-facts';

const METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: 'wallet', label: 'Ví FixHome', hint: 'Thanh toán bằng số dư ví của bạn' },
  { id: 'vnpay', label: 'VNPay', hint: 'Mở cổng thanh toán VNPay trong trình duyệt' },
  { id: 'cash', label: 'Tiền mặt', hint: 'Xác nhận đã trả tiền mặt cho kỹ thuật viên' },
];

interface FrozenVnpaySheet {
  invoiceId: string;
  amount: number;
  ownerKey: string;
}

/**
 * C09 — payment method choice. Selection is navigation (wallet) or a frozen
 * explicit confirmation (VNPay/cash). Unknown locks all methods; no bypass.
 */
export default function PaymentMethodScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerOrderPayment();
  useLoadUnloadedResources(snapshot, ['invoice', 'cash'], loadResource);

  const [sheet, setSheet] = useState<FrozenVnpaySheet | null>(null);
  const [sheetMethod, setSheetMethod] = useState<Exclude<PaymentMethod, 'wallet'> | null>(null);
  const [draftOwner, setDraftOwner] = useState(key);
  if (!(draftOwner === key || (!!key && !!draftOwner && sameOrderSession(draftOwner, key)))) {
    setDraftOwner(key);
    setSheet(null);
    setSheetMethod(null);
  }

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'customer' && order.id === key.serviceOrderId && hasCompletionRequest(order);
  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const invoice = current && key ? invoiceFact(snapshot, key) : null;
  const cash = current && key ? cashFact(snapshot, key) : undefined;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.invoice.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent);
  const frozen = busy || unknown;
  const unpaid = !!invoice && invoice.status === 'unpaid';
  const cashAwaiting = !!cash && cash.status === 'pending_confirmation';
  const sheetValid = current && !!sheet && !!sheetMethod && !!invoice && sheet.invoiceId === invoice.id
    && sheet.amount === invoice.amount && sheet.ownerKey === ownerKey && state.confirmation !== null
    && state.confirmation.invoiceId === invoice.id;

  const choose = (method: PaymentMethod) => {
    if (!current || frozen || !unpaid || !key) return;
    // Wallet opens its focused screen; that screen requests and confirms explicitly.
    if (method === 'wallet') {
      navigation.navigate('WalletPayment');
      return;
    }
    if (method === 'cash' && !cashAwaiting) return;
    if (!invoice || !ownerKey) return;
    void controller.requestPayment(method).then(() => {
      setSheet({ invoiceId: invoice.id, amount: invoice.amount, ownerKey });
      setSheetMethod(method);
    });
  };

  const cancelSheet = () => {
    controller.cancelConfirmation();
    setSheet(null);
    setSheetMethod(null);
  };

  const submitSheet = () => {
    if (!sheetValid || !sheetMethod || busy) return;
    const method = sheetMethod;
    setSheet(null);
    setSheetMethod(null);
    void controller.submitConfirmation().then(() => {
      // VNPay initiation only creates the link; cash confirm only sends the
      // captured declaration. The dispatcher shows the honest outcome.
      if (method === 'vnpay' || method === 'cash') navigation.navigate('OrderTask');
    });
  };

  const openBrowser = () => {
    if (busy || !state.urlReady) return;
    void controller.openPaymentUrl();
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Thanh toán" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Thanh toán không được tải cho đơn lịch sử.'
            : 'Thanh toán chỉ hiển thị sau khi máy chủ xác minh quyền xem đơn hiện tại và kỹ thuật viên gửi yêu cầu bàn giao.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Thanh toán"
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
          ? { label: 'Kiểm tra kết quả', testID: 'payment-check-result', disabled: busy,
              accessibilityHint: 'Đối chiếu kết quả thanh toán chưa rõ từ máy chủ',
              onPress: () => navigation.navigate('OrderTask') }
          : sheetValid && sheetMethod
            ? { label: sheetMethod === 'vnpay' ? 'Xác nhận mở VNPay' : 'Xác nhận tiền mặt',
                testID: 'payment-confirm-submit', disabled: busy, onPress: submitSheet }
            : state.urlReady
              ? { label: 'Mở cổng thanh toán', testID: 'payment-open-browser', disabled: busy, onPress: openBrowser }
              : { label: 'Chọn phương thức bên dưới', testID: 'payment-choose-hint', disabled: true, onPress: () => {} }
      }
    >
      {!unpaid ? (
        <ReadOnlyNotice>Hóa đơn hiện không ở trạng thái chờ thanh toán. Mọi phương thức đều khóa cho đến khi máy chủ trả hóa đơn chưa thanh toán.</ReadOnlyNotice>
      ) : null}
      {unknown ? (
        <ReadOnlyNotice>Có thao tác thanh toán chưa rõ kết quả. Bạn không thể đổi phương thức để bỏ qua; hãy kiểm tra kết quả từ máy chủ trước.</ReadOnlyNotice>
      ) : null}
      {invoice ? <M6InvoiceSummary invoice={{ id: invoice.id, grandTotal: invoice.grandTotal, paymentStatus: invoice.paymentStatus, items: invoice.items }} /> : (
        <ReadOnlyNotice>Đang chờ hóa đơn từ máy chủ. Tổng tiền do máy chủ trả về; ứng dụng không tự tính lại.</ReadOnlyNotice>
      )}
      <TouchableOpacity
        testID="payment-handover-link"
        accessibilityRole="button"
        accessibilityLabel="Xem lại bàn giao"
        accessibilityHint="Xem ảnh, ghi chú và phạm vi bàn giao trước khi thanh toán"
        disabled={!current}
        onPress={() => { if (current) navigation.navigate('HandoverReview'); }}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          minHeight: 52,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          opacity: !current ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Xem lại bàn giao ›</Text>
      </TouchableOpacity>
      {sheetValid && sheet && sheetMethod ? (
        <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md }} testID="payment-confirm-sheet">
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.tone.warning.text }}>
            {sheetMethod === 'vnpay' ? 'Xác nhận mở cổng VNPay' : 'Xác nhận thanh toán tiền mặt'}
          </Text>
          <DetailRow label="Mã hóa đơn" value={sheet.invoiceId} />
          <DetailRow label="Số tiền đã chốt" value={sheet.amount} />
          {sheetMethod === 'cash' ? (
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
              Chỉ xác nhận khi bạn đã trực tiếp trả đúng số tiền trên cho kỹ thuật viên.
            </Text>
          ) : (
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
              Mỗi lần xác nhận chỉ tạo một liên kết thanh toán. Không mở thêm liên kết khi quay lại từ trình duyệt.
            </Text>
          )}
          <TouchableOpacity
            testID="payment-confirm-cancel"
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
      <View style={{ gap: 8 }}>
        {METHODS.map(method => {
          const cashBlocked = method.id === 'cash' && !cashAwaiting;
          const disabled = frozen || !unpaid || !invoice || cashBlocked || busy;
          return (
            <TouchableOpacity
              key={method.id}
              testID={`payment-method-${method.id}`}
              accessibilityRole="button"
              accessibilityLabel={method.label}
              accessibilityHint={method.hint}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => choose(method.id)}
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                minHeight: 56,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{method.label} ›</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {method.id === 'cash' && !cashAwaiting ? 'Chờ kỹ thuật viên khai báo số tiền đã nhận.' : method.hint}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {state.message && state.phase !== 'unknown' ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
    </TaskScreenShell>
  );
}
