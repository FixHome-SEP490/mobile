import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/**
 * T03 — EN_ROUTE before arrival verification.
 * Only this screen opts into foreground location tracking.
 * "Tôi đã tới nơi" only navigates to the separate manual check-in route; zero check-in mutation here.
 */
export default function TravelScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  useTechnicianArrivalProof({ trackLocation: true });
  const navigation = useNavigation<any>();

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const canProceed = !revoked && order?.status === 'EN_ROUTE';

  return (
    <TaskScreenShell
      title="Đang di chuyển"
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
        label: 'Tôi đã tới nơi',
        testID: 'goto-checkin',
        disabled: !canProceed,
        onPress: () => {
          if (canProceed) navigation.navigate('ArrivalCheckIn');
        },
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Dịch vụ" value={order?.serviceName} />
        <DetailRow
          label="Lịch hẹn"
          value={order?.scheduledAt ? vnDateTimeString(order.scheduledAt) : 'Chưa có thông tin'}
        />
        <DetailRow label="Địa chỉ" value={order?.addressSummary} />
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>
          Hãy di chuyển tới điểm hẹn. Chỉ nhấn “Tôi đã tới nơi” khi bạn đã đứng tại điểm hẹn; bước xác minh vị trí nằm ở màn hình tiếp theo.
        </ReadOnlyNotice>
      )}
      <TechnicianOrderHub />
    </TaskScreenShell>
  );
}
