import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** T09 — UNDER_REPAIR with no actionable extra. Focused current task; later branches stay honestly disabled. */
export default function RepairWorkspaceScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  const navigation = useNavigation<any>();

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const isFixedPrice = order?.pricingMode?.toUpperCase() === 'FIXED_PRICE';

  const open = (screen: 'EvidenceGallery') => {
    if (!revoked) navigation.navigate(screen as never);
  };

  return (
    <TaskScreenShell
      title="Đang sửa chữa"
      stage={3}
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
        label: 'Xem ảnh và bằng chứng',
        testID: 'task-gallery-link',
        disabled: revoked,
        onPress: () => open('EvidenceGallery'),
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
        <DetailRow
          label="Phạm vi đã chốt"
          value={
            isFixedPrice && typeof order?.fixedUnitPrice === 'number'
              ? `${formatVnd(order.fixedUnitPrice)}${order?.quantity ? ` · Số lượng ${order.quantity}` : ''}`
              : isFixedPrice
                ? 'Giá cố định theo đơn'
                : 'Theo báo giá đã được duyệt'
          }
        />
        {order?.scopeDescription ? <DetailRow label="Mô tả phạm vi" value={order.scopeDescription} /> : null}
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>Bạn đang sửa chữa theo phạm vi đã chốt. Ảnh sau sửa chữa, chi phí phát sinh và yêu cầu hoàn tất sẽ mở ở các bước tiếp theo.</ReadOnlyNotice>
      )}
      <TechnicianOrderHub />
    </TaskScreenShell>
  );
}
