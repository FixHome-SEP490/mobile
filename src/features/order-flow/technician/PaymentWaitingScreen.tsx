import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianCashDeclaration } from './useTechnicianCashDeclaration';
import { cashFact, financialResult, hasCompletionRequest, invoiceFact } from '../customer/payment-facts';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

/**
 * T15 — payment waiting. Who is awaited and the actual invoice/payment
 * status; GET-only refresh. Cash declaration entry only when eligible.
 */
export default function PaymentWaitingScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianCashDeclaration();
  const navigation = useNavigation<any>();
  useLoadUnloadedResources(snapshot, ['invoice', 'cash'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const current = !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key)
    && key.role === 'technician' && assignmentValid && hasCompletionRequest(order);
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.invoice.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const invoice = current && key ? invoiceFact(snapshot, key) : null;
  const cash = current && key ? cashFact(snapshot, key) : undefined;
  const result = current && key ? financialResult(snapshot, key) : 'unverified';
  const paidUpdating = result === 'paid-awaiting-order';
  const unknown = state.phase === 'unknown' || (!!key && !!snapshot?.pendingIntent && !paidUpdating);
  const canDeclare = !!invoice && invoice.status === 'unpaid' && cash === null && !unknown && !busy;

  const verify = () => {
    if (!current || busy) return;
    void controller.verify();
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chờ thanh toán" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Chờ thanh toán chỉ hiển thị trên đơn đã bàn giao thuộc về bạn.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Chờ thanh toán"
      stage={4}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh || busy,
        onPress: () => { if (canRefresh && !busy) void refresh('manual'); },
      }}
      primary={{
        label: busy ? 'Đang kiểm tra…' : 'Kiểm tra kết quả',
        testID: 'payment-waiting-verify',
        disabled: !canRefresh || busy,
        accessibilityHint: 'Đối chiếu trạng thái thanh toán từ máy chủ, không gửi thao tác mới',
        onPress: verify,
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order.code} />
        <DetailRow label="Đang chờ" value="Khách hàng thanh toán" />
        <DetailRow label="Mã hóa đơn" value={invoice?.id} />
        <DetailRow label="Tổng tiền" value={invoice ? quoteMoneyText(invoice.grandTotal) : 'Chưa có dữ liệu'} />
        <DetailRow
          label="Trạng thái thanh toán"
          value={!invoice ? 'Chưa có dữ liệu' : invoice.status === 'paid' ? 'Đã thanh toán' : invoice.status === 'refunded' ? 'Đã hoàn tiền' : 'Chưa thanh toán'}
        />
        {cash ? (
          <DetailRow
            label="Đối soát tiền mặt"
            value={`${quoteMoneyText(cash.declaredAmount)} · ${cash.status === 'disputed' ? 'Đang chênh lệch' : cash.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ khách xác nhận'}`}
          />
        ) : null}
      </View>
      {paidUpdating ? (
        <ReadOnlyNotice>Hóa đơn đã được thanh toán; đơn đang chờ máy chủ hoàn tất. Đây chưa phải đơn hoàn thành.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>Đơn hoàn thành do máy chủ quyết định sau khi ghi nhận thanh toán. Màn hình này chỉ đọc; nút kiểm tra không gửi thao tác mới.</ReadOnlyNotice>
      )}
      {unknown ? (
        <ReadOnlyNotice>Có thao tác khai báo chưa rõ kết quả. Hãy kiểm tra lại từ máy chủ; không gửi khai báo mới khi còn thao tác chưa rõ.</ReadOnlyNotice>
      ) : null}
      {canDeclare ? (
        <TouchableOpacity
          testID="task-link-CashDeclaration"
          accessibilityRole="button"
          accessibilityLabel="Khai báo số tiền mặt đã nhận"
          onPress={() => navigation.navigate('CashDeclaration')}
          style={{
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
            minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Khai báo tiền mặt đã nhận ›</Text>
        </TouchableOpacity>
      ) : null}
    </TaskScreenShell>
  );
}
