import React from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { isOldFinanceReview, isOrderWorkStopped, STOPPED_WORK_MESSAGE, STOPPED_WORK_TITLE } from '../../../api/order-work-stopped';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import CustomerDeliverySection from './CustomerDeliverySection';
import CustomerContinuationCard, { StoppedWorkFinanceNote } from './CustomerContinuationCard';

/**
 * C03, C04 and C06 share one read-only body: the order frame above already shows the technician, appointment and
 * address, so this says only what is happening, and the footer button calls the technician.
 */
export default function StatusStepScreen({ title, stage, message }: { title: string; stage: 1 | 2 | 3 | 4; message: string }) {
  const { key, snapshot } = useOrderSession();
  const navigation = useNavigation<any>();
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order;
  // Stopped on site: the technician was released, so there is nobody to call and the step is no longer "on the way" or "repairing".
  const stopped = isOrderWorkStopped(order);
  const phone = stopped ? undefined : order?.technician?.phoneNumber;
  return (
    <TaskScreenShell
      title={stopped ? STOPPED_WORK_TITLE : title}
      stage={stage}
      onBack={() => navigation.goBack()}
      primary={phone ? { label: 'Gọi kỹ thuật viên', testID: 'task-call', onPress: () => void Linking.openURL(`tel:${phone}`) } : undefined}
    >
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc dữ liệu chưa sẵn sàng. Bản nháp cục bộ đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>{stopped ? STOPPED_WORK_MESSAGE : message}</ReadOnlyNotice>
      )}
      {!revoked && isOldFinanceReview(order) && <StoppedWorkFinanceNote />}
      {!revoked && <CustomerContinuationCard order={order} />}
      {/* W3 part delivery: consent and progress happen while the repair is running. */}
      {!revoked && !stopped && stage === 3 && <CustomerDeliverySection orderId={order.id} refreshKey={order.status} />}
    </TaskScreenShell>
  );
}
