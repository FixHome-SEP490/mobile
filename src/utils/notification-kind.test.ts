import { notificationKind } from './notification-kind';

describe('notificationKind', () => {
  it('marks approvals green and rejections or cancellations red', () => {
    expect(notificationKind('QUOTATION_APPROVED')).toEqual({ tone: 'success', icon: 'check' });
    expect(notificationKind('ADDITIONAL_COST_REJECTED')).toEqual({ tone: 'danger', icon: 'close' });
    expect(notificationKind('ORDER_CANCELLED')).toEqual({ tone: 'danger', icon: 'close' });
    expect(notificationKind('BOOKING_CANCELLED_BY_CUSTOMER')?.tone).toBe('danger');
  });

  it('covers the order milestones web labels', () => {
    expect(notificationKind('TECHNICIAN_EN_ROUTE')?.icon).toBe('truck');
    expect(notificationKind('TECHNICIAN_ARRIVED')?.tone).toBe('success');
    expect(notificationKind('COMPLETION_REQUESTED')?.tone).toBe('warning');
    expect(notificationKind('ORDER_COMPLETED')?.tone).toBe('success');
    expect(notificationKind('QUOTATION_SENT')).toEqual({ tone: 'info', icon: 'cash' });
  });

  it('leaves unknown or empty types to the caller default', () => {
    expect(notificationKind('SOMETHING_NEW')).toBeNull();
    expect(notificationKind(undefined)).toBeNull();
  });
});
