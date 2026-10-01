import type { CustomerNotificationItem } from '../../api/notifications.api';
import type { MySupportCase } from '../../api/support-cases.api';
import { prepareCustomerNotificationAction } from './customer-notification-action';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '33333333-3333-4333-8333-333333333333';

function row(overrides: Partial<CustomerNotificationItem> = {}): CustomerNotificationItem {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Thông báo',
    message: 'Nội dung',
    createdAt: '2026-10-01T01:00:00.000Z',
    isRead: false,
    type: 'INFO',
    referenceId: null,
    referenceType: null,
    ...overrides,
  };
}

function supportCase(overrides: Partial<MySupportCase> = {}): MySupportCase {
  return {
    id: CASE_ID,
    caseType: 'other',
    status: 'open',
    bookingId: null,
    serviceOrderId: null,
    reason: 'Need support',
    description: null,
    resolutionReason: null,
    evidenceRefs: null,
    isUrgent: false,
    respondBy: null,
    resolvedAt: null,
    createdAt: '2026-10-01T01:00:00.000Z',
    updatedAt: '2026-10-01T01:00:00.000Z',
    ...overrides,
  };
}

function deps() {
  return {
    markReadLocal: jest.fn(),
    markReadRemote: jest.fn().mockResolvedValue(undefined),
    onMarkReadError: jest.fn(),
    getSupportCase: jest.fn<Promise<MySupportCase>, [string]>(),
  };
}

describe('prepareCustomerNotificationAction', () => {
  it('marks unread locally/remotely and returns a Booking navigation target', async () => {
    const d = deps();
    const item = row({ referenceType: 'BOOKING', referenceId: BOOKING_ID });

    await expect(prepareCustomerNotificationAction(item, d)).resolves.toEqual({
      name: 'CustomerBookingDetail',
      params: { bookingId: BOOKING_ID },
    });
    expect(d.markReadLocal).toHaveBeenCalledWith(item.id);
    expect(d.markReadRemote).toHaveBeenCalledWith(item.id);
  });

  it('does not mark an already-read row again but still returns its actionable target', async () => {
    const d = deps();
    const item = row({
      isRead: true,
      referenceType: 'SERVICE_ORDER',
      referenceId: ORDER_ID,
    });

    await expect(prepareCustomerNotificationAction(item, d)).resolves.toEqual({
      name: 'CustomerOrderDetail',
      params: { serviceOrderId: ORDER_ID },
    });
    expect(d.markReadLocal).not.toHaveBeenCalled();
    expect(d.markReadRemote).not.toHaveBeenCalled();
  });

  it('uses actor-safe SupportCase lookup and returns its owned ServiceOrder target', async () => {
    const d = deps();
    d.getSupportCase.mockResolvedValue(
      supportCase({ serviceOrderId: ORDER_ID, bookingId: BOOKING_ID }),
    );

    await expect(prepareCustomerNotificationAction(row({
      referenceType: 'SUPPORT_CASE',
      referenceId: CASE_ID,
    }), d)).resolves.toEqual({
      name: 'CustomerOrderDetail',
      params: { serviceOrderId: ORDER_ID },
    });
    expect(d.getSupportCase).toHaveBeenCalledWith(CASE_ID);
  });

  it('marks unsupported references read but returns no guessed Customer route', async () => {
    const d = deps();
    const item = row({ referenceType: 'review', referenceId: CASE_ID });

    await expect(prepareCustomerNotificationAction(item, d)).resolves.toBeNull();
    expect(d.markReadLocal).toHaveBeenCalledWith(item.id);
    expect(d.getSupportCase).not.toHaveBeenCalled();
  });

  it('reports remote read failure without blocking a safe direct target', async () => {
    const d = deps();
    const error = new Error('offline');
    d.markReadRemote.mockRejectedValue(error);

    await expect(prepareCustomerNotificationAction(row({
      referenceType: 'BOOKING',
      referenceId: BOOKING_ID,
    }), d)).resolves.toEqual({
      name: 'CustomerBookingDetail',
      params: { bookingId: BOOKING_ID },
    });
    await Promise.resolve();
    expect(d.onMarkReadError).toHaveBeenCalledWith(error);
  });
});
