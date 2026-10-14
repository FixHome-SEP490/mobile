import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useCustomerOrderPayment } from './useCustomerOrderPayment';
import { financialResult, hasCompletionRequest, invoiceFact } from './payment-facts';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

/**
 * C11 — honest payment outcome. Known failed, pending browser return, or
 * unknown with GET-only verify. UNPAID alone never proves failure; query or
 * return flags are never authority. PAID+UNDER_REPAIR stays updating.
 */
export default function PaymentResultScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerOrderPayment();
  useLoadUnloadedResources(snapshot, ['invoice', 'cash'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'customer' && order.id === key.serviceOrderId && hasCompletionRequest(order);
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const invoice = current && key ? invoiceFact(snapshot, key) : null;
  const result = current && key ? financialResult(snapshot, key) : 'unverified';
  const updating = result === 'paid-awaiting-order';
  const failedKnown = state.phase === 'failed-known';
  const pending = state.phase === 'pending';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent && !updating);

  const verify = () => {
    if (!current || busy) return;
    void controller.verify();
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Kết quả thanh toán" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Kết quả thanh toán chỉ hiển thị sau khi máy chủ xác minh quyền xem đơn hiện tại và kỹ thuật viên gửi yêu cầu bàn giao.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Kết quả thanh toán"
      stage={4}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh || busy,
        onPress: () => { if (canRefresh && !busy) void refresh('manual'); },
      }}
      primary={
        pending && state.urlReady
          ? { label: 'Mở lại cổng thanh toán', testID: 'payment-reopen-browser', disabled: busy,
              onPress: () => { if (!busy) void controller.openPaymentUrl(); } }
          : { label: busy ? 'Đang kiểm tra…' : 'Kiểm tra kết quả', testID: 'payment-verify',
              disabled: !canRefresh || busy, accessibilityHint: 'Đối chiếu kết quả thanh toán từ máy chủ, không gửi thanh toán mới',
              onPress: verify }
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã hóa đơn" value={invoice?.id} />
        <DetailRow label="Tổng tiền" value={invoice ? quoteMoneyText(invoice.grandTotal) : 'Chưa có dữ liệu'} />
        <DetailRow
          label="Trạng thái hóa đơn"
          value={!invoice ? 'Chưa có dữ liệu' : invoice.status === 'paid' ? 'Đã thanh toán' : invoice.status === 'refunded' ? 'Đã hoàn tiền' : 'Chưa thanh toán'}
        />
      </View>
      {updating ? (
        <ReadOnlyNotice>Hóa đơn đã được thanh toán; đơn đang chờ máy chủ hoàn tất. Đây chưa phải đơn hoàn thành.</ReadOnlyNotice>
      ) : null}
      {failedKnown ? (
        <ReadOnlyNotice>Thanh toán chưa được thực hiện theo xác minh của máy chủ. Hãy kiểm tra dữ liệu rồi xác nhận lại từ bước thanh toán.</ReadOnlyNotice>
      ) : null}
      {pending ? (
        <ReadOnlyNotice>
          Liên kết thanh toán đã được mở trong trình duyệt. Hãy quay lại ứng dụng sau khi thanh toán xong rồi bấm kiểm tra kết quả; việc mở lại liên kết không tạo thanh toán mới.
        </ReadOnlyNotice>
      ) : null}
      {unknown && !updating ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả thanh toán. Vui lòng kiểm tra trạng thái trước khi thanh toán lại; hóa đơn chưa thanh toán không đồng nghĩa giao dịch đã thất bại.</ReadOnlyNotice>
      ) : null}
      {failedKnown ? (
        <TouchableOpacity
          testID="payment-retry-link"
          accessibilityRole="button"
          onPress={() => navigation.navigate('OrderTask')}
          style={{
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
            minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Quay lại bước thanh toán ›</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        Chỉ hóa đơn, đơn và sổ đối soát từ máy chủ mới là căn cứ. Thông báo từ trình duyệt hoặc đường dẫn quay lại không quyết định kết quả.
      </Text>
    </TaskScreenShell>
  );
}
