import type { BookingItem } from '../../../api/bookings.api';
import type { ServiceOrderItem } from '../../../api/orders.api';
import { bookingStatusView, serviceOrderDisplayView, type StatusView } from '../../../screens/technician/technician-status';

export type ActivityGroup = 'action' | 'active' | 'done' | 'cancelled';
/** 1 Đặt lịch · 2 Chọn kỹ thuật viên · 3 Kỹ thuật viên đến · 4 Sửa chữa · 5 Thanh toán */
export type ActivityStep = 1 | 2 | 3 | 4 | 5;
export const ACTIVITY_STEPS = ['Đặt lịch', 'Chọn kỹ thuật viên', 'Kỹ thuật viên đến', 'Sửa chữa', 'Thanh toán'] as const;

export type ActivityTarget = 'matching' | 'booking' | 'order';
export interface ActivityStage {
  group: ActivityGroup;
  step: ActivityStep;
  view: StatusView;
  /** The one thing the customer can do now; absent when they only wait. */
  primary?: { label: string; target: ActivityTarget };
}

const stage = (group: ActivityGroup, step: ActivityStep, view: StatusView, primary?: ActivityStage['primary']): ActivityStage =>
  ({ group, step, view, ...(primary ? { primary } : {}) });

/**
 * One label / group / button for a booking or an order, shared by the Activity list and the order screens.
 * Works on list-level fields only: a pending extra cost is only known from the order detail, so it is not a list-level action.
 */
export function customerActivityStage(item: { booking: BookingItem } | { order: ServiceOrderItem }): ActivityStage {
  if ('order' in item) return orderStage(item.order);
  const { booking } = item;
  const status = String(booking.status).toUpperCase();
  const view = bookingStatusView(status);
  if (status === 'CANCELLED') return stage('cancelled', 1, view);
  if (booking.serviceOrderId) return stage('active', 3, view, { label: 'Xem đơn sửa chữa', target: 'order' });
  if (status === 'SUBMITTED') return stage('action', 2, { ...view, label: 'Chọn kỹ thuật viên' }, { label: 'Chọn kỹ thuật viên', target: 'matching' });
  if (status === 'CLOSED') return stage('action', 2, view, { label: 'Chọn lại kỹ thuật viên', target: 'matching' });
  return stage('active', 2, view);
}

function orderStage(order: ServiceOrderItem): ActivityStage {
  const status = String(order.status).toUpperCase();
  const view = serviceOrderDisplayView(order);
  if (status === 'CANCELLED') return stage('cancelled', 3, view);
  if (status === 'COMPLETED') return stage('done', 5, view);
  if (order.completionRequestedAt) {
    return String(order.paymentStatus).toUpperCase() === 'UNPAID'
      ? stage('action', 5, view, { label: 'Thanh toán', target: 'order' })
      : stage('active', 5, view);
  }
  if (status === 'UNDER_REPAIR') return stage('active', 4, view);
  if (status === 'EN_ROUTE' && String(order.quotation?.status).toUpperCase() === 'SENT') {
    return stage('action', 3, { ...view, label: 'Chờ bạn duyệt báo giá', tone: 'warning' }, { label: 'Xem và duyệt báo giá', target: 'order' });
  }
  return stage('active', 3, view, { label: 'Xem đơn', target: 'order' });
}
