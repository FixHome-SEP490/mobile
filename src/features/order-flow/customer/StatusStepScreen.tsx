import React from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { AWAITING_REPLACEMENT_MESSAGE, AWAITING_REPLACEMENT_TITLE, isAwaitingReplacement, isOldFinanceReview, isOrderWorkStopped, STOPPED_WORK_MESSAGE, STOPPED_WORK_TITLE } from '../../../api/order-work-stopped';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import CustomerDeliverySection from './CustomerDeliverySection';
import { NOT_OPENABLE } from '../shared/notice-copy';
import CustomerContinuationCard, { StoppedCaseGuide, StoppedWorkFinanceNote } from './CustomerContinuationCard';
import { actionableExtras } from '../domain/order-task-resolver';

/**
 * C03, C04 and C06 share one read-only body: the order frame above already shows the technician, appointment and
 * address, so this says only what is happening, and the footer button calls the technician.
 */
export default function StatusStepScreen({ title, stage, message }: { title: string; stage: 1 | 2 | 3 | 4; message?: string }) {
  const { key, snapshot } = useOrderSession();
  const navigation = useNavigation<any>();
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order;
  // Stopped on site: the technician was released, so there is nobody to call and the step is no longer "on the way" or "repairing".
  const stopped = isOrderWorkStopped(order);
  const phone = stopped ? undefined : order?.technician?.phoneNumber;
  // The technician withdrew before arriving: nobody is assigned until a replacement accepts.
  const replacing = isAwaitingReplacement(order);
  const bookingId = order?.bookingId;
  const primary = replacing
    ? (bookingId ? { label: 'Xem tiến trình tìm thợ', testID: 'task-find-technician', onPress: () => navigation.navigate('CustomerBookingDetail', { bookingId, released: true }) } : undefined)
    : phone ? { label: 'Gọi kỹ thuật viên', testID: 'task-call', onPress: () => void Linking.openURL(`tel:${phone}`) } : undefined;
  return (
    <TaskScreenShell
      title={stopped ? STOPPED_WORK_TITLE : replacing ? AWAITING_REPLACEMENT_TITLE : title}
      stage={replacing ? 2 : stage}
      onBack={() => navigation.goBack()}
      primary={primary}
    >
      {revoked ? (
        <ReadOnlyNotice>{NOT_OPENABLE}</ReadOnlyNotice>
      ) : (stopped ? STOPPED_WORK_MESSAGE : replacing ? AWAITING_REPLACEMENT_MESSAGE : message) ? (
        <ReadOnlyNotice>{stopped ? STOPPED_WORK_MESSAGE : replacing ? AWAITING_REPLACEMENT_MESSAGE : message}</ReadOnlyNotice>
      ) : null}
      {!revoked && stopped && (
        <StoppedCaseGuide
          quoteSent={String(order.quotation?.status).toUpperCase() === 'SENT'}
          extrasPending={!!snapshot && (actionableExtras(snapshot)?.length ?? 0) > 0}
        />
      )}
      {!revoked && isOldFinanceReview(order) && <StoppedWorkFinanceNote />}
      {!revoked && <CustomerContinuationCard order={order} />}
      {/* W3 part delivery: consent and progress happen while the repair is running. */}
      {!revoked && !stopped && stage === 3 && <CustomerDeliverySection orderId={order.id} refreshKey={order.status} />}
    </TaskScreenShell>
  );
}
