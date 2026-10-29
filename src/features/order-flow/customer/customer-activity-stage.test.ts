import type { BookingItem } from '../../../api/bookings.api';
import type { ServiceOrderItem } from '../../../api/orders.api';
import { customerActivityStage } from './customer-activity-stage';

const booking = (patch: Partial<BookingItem>) => ({ booking: { id: 'b', status: 'SUBMITTED', ...patch } as BookingItem });
const order = (patch: Partial<ServiceOrderItem>) => ({ order: { id: 'o', status: 'ACCEPTED', paymentStatus: 'UNPAID', ...patch } as ServiceOrderItem });

describe('customerActivityStage', () => {
  it.each([
    ['SUBMITTED', 'action', 2, 'matching'],
    ['CLOSED', 'action', 2, 'matching'],
    ['MATCHING', 'active', 2, undefined],
    ['CANCELLED', 'cancelled', 1, undefined],
  ])('booking %s', (status, group, step, target) => {
    const s = customerActivityStage(booking({ status: status as BookingItem['status'] }));
    expect([s.group, s.step, s.primary?.target]).toEqual([group, step, target]);
  });

  it('a booking that already has an order points at the order', () => {
    expect(customerActivityStage(booking({ status: 'MATCHED', serviceOrderId: 'o' })).primary).toEqual({ label: 'Xem đơn sửa chữa', target: 'order' });
  });

  it('asks the customer to approve a SENT quotation while the technician is on the way', () => {
    const s = customerActivityStage(order({ status: 'EN_ROUTE', quotation: { id: 'q', status: 'sent', laborTotal: 0, partsTotal: 0, items: [] } }));
    expect([s.group, s.view.label, s.primary?.label]).toEqual(['action', 'Chờ bạn duyệt báo giá', 'Xem và duyệt báo giá']);
  });

  it('a handed-over unpaid order waits for payment; a paid one only waits', () => {
    const unpaid = customerActivityStage(order({ status: 'UNDER_REPAIR', completionRequestedAt: 'x' }));
    expect([unpaid.group, unpaid.step, unpaid.view.label, unpaid.primary?.label]).toEqual(['action', 5, 'Chờ thanh toán', 'Thanh toán']);
    expect(customerActivityStage(order({ status: 'UNDER_REPAIR', completionRequestedAt: 'x', paymentStatus: 'PAID' })).group).toBe('active');
  });

  it.each([
    ['ACCEPTED', 'active', 3],
    ['UNDER_REPAIR', 'active', 4],
    ['COMPLETED', 'done', 5],
    ['CANCELLED', 'cancelled', 3],
  ])('order %s', (status, group, step) => {
    const s = customerActivityStage(order({ status: status as ServiceOrderItem['status'] }));
    expect([s.group, s.step]).toEqual([group, step]);
  });
});
