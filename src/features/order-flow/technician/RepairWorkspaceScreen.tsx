import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** T09 — UNDER_REPAIR with no actionable extra. Focused current task; later branches stay honestly disabled. */
const AUTHENTICATED_AFTER = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/authenticated\/s--[^/]+\//;

export default function RepairWorkspaceScreen() {
  const { key, snapshot, loadResource } = useOrderSession();
  useLoadUnloadedResources(snapshot, ['evidence'], loadResource);
  const navigation = useNavigation<any>();

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const isFixedPrice = order?.pricingMode?.toUpperCase() === 'FIXED_PRICE';

  const open = (screen: 'EvidenceGallery' | 'AfterEvidence' | 'CompletionRequest') => {
    if (!revoked) navigation.navigate(screen as never);
  };

  // With the after photos already sent, the handover is one tap from here instead of through the photo screen.
  const evidence = snapshot?.resources.evidence;
  const ownAfter = evidence?.status === 'ready'
    ? evidence.data.filter((e) => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId && e.type === 'AFTER' && AUTHENTICATED_AFTER.test(e.mediaUrl))
    : [];
  const afterMinimum = snapshot?.proofPolicy?.afterMinimum;
  const knownInsufficient = typeof afterMinimum === 'number' && Number.isInteger(afterMinimum) && afterMinimum > 0 && ownAfter.length < afterMinimum;
  const canHandOver = !revoked && !snapshot?.pendingIntent && !order?.completionRequestedAt && ownAfter.length > 0 && !knownInsufficient;

  return (
    <TaskScreenShell
      title="Đang sửa chữa"
      stage={3}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Xem ảnh',
        testID: 'task-evidence-link',
        accessibilityHint: 'Xem ảnh trước sửa chữa, ảnh sau sửa chữa và ảnh khuôn mặt',
        disabled: revoked,
        onPress: () => open('EvidenceGallery'),
      }}
      primary={canHandOver
        ? {
          label: 'Bàn giao',
          testID: 'task-handover-primary',
          accessibilityHint: 'Mở bước bàn giao; ảnh sau sửa chữa đã được máy chủ xác nhận',
          onPress: () => open('CompletionRequest'),
        }
        : {
          label: 'Chụp ảnh sau sửa chữa',
          testID: 'task-gallery-link',
          disabled: revoked,
          onPress: () => open('AfterEvidence'),
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
