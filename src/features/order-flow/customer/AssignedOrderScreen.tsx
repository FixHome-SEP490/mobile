import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** C03 — ACCEPTED. Read-only; no quote or payment action in this focused scope. */
export default function AssignedOrderScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  const navigation = useNavigation<any>();
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;

  return (
    <TaskScreenShell
      title="Kỹ thuật viên đã nhận đơn"
      stage={1}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh,
        onPress: () => {
          if (canRefresh) void refresh('manual');
        },
      }}
      primary={{
        label: 'Xem thông tin đơn',
        testID: 'task-detail-link',
        disabled: revoked,
        onPress: () => {
          if (!revoked) navigation.navigate('OrderInformation');
        },
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Dịch vụ" value={order?.serviceName} />
        <DetailRow label="Kỹ thuật viên" value={order?.technician?.fullName} />
        <DetailRow
          label="Lịch hẹn"
          value={order?.scheduledAt ? vnDateTimeString(order.scheduledAt) : 'Chưa có thông tin'}
        />
        <DetailRow label="Địa chỉ" value={order?.addressSummary} />
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc dữ liệu chưa sẵn sàng. Bản nháp cục bộ đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>
          Kỹ thuật viên đã nhận đơn và sẽ di chuyển khi đến giờ hẹn. Bạn không cần thao tác thêm ở bước này.
        </ReadOnlyNotice>
      )}
      <TouchableOpacity
        testID="task-progress-link"
        accessibilityRole="button"
        disabled={revoked}
        onPress={() => {
          if (!revoked) navigation.navigate('OrderProgressHistory');
        }}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          minHeight: 52,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          opacity: revoked ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Xem tiến độ ›</Text>
      </TouchableOpacity>
    </TaskScreenShell>
  );
}
