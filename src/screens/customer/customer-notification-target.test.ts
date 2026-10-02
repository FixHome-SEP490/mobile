import type { MySupportCase } from '../../api/support-cases.api';
import { resolveCustomerNotificationTarget } from './customer-notification-target';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '33333333-3333-4333-8333-333333333333';

function supportCase(
  overrides: Partial<MySupportCase> = {},
): MySupportCase {
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
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveCustomerNotificationTarget', () => {
  it('routes only real Booking and ServiceOrder UUID references directly', async () => {
    const getSupportCase = jest.fn();

    await expect(resolveCustomerNotificationTarget({
      referenceType: 'BOOKING',
      referenceId: BOOKING_ID,
    }, { getSupportCase })).resolves.toEqual({
      name: 'CustomerBookingDetail',
      params: { bookingId: BOOKING_ID },
    });

    await expect(resolveCustomerNotificationTarget({
      referenceType: 'service_order',
      referenceId: ORDER_ID,
    }, { getSupportCase })).resolves.toEqual({
      name: 'CustomerOrderDetail',
      params: { serviceOrderId: ORDER_ID },
    });

    expect(getSupportCase).not.toHaveBeenCalled();
  });

  it('resolves a SupportCase through the actor-safe lookup and prefers its ServiceOrder', async () => {
    const getSupportCase = jest.fn().mockResolvedValue(
      supportCase({ serviceOrderId: ORDER_ID, bookingId: BOOKING_ID }),
    );

    await expect(resolveCustomerNotificationTarget({
      referenceType: 'SUPPORT_CASE',
      referenceId: CASE_ID,
    }, { getSupportCase })).resolves.toEqual({
      name: 'CustomerOrderDetail',
      params: { serviceOrderId: ORDER_ID },
    });
    expect(getSupportCase).toHaveBeenCalledWith(CASE_ID);
  });

  it('falls back to the owned Booking when a SupportCase has no ServiceOrder', async () => {
    const getSupportCase = jest.fn().mockResolvedValue(
      supportCase({ bookingId: BOOKING_ID }),
    );

    await expect(resolveCustomerNotificationTarget({
      referenceType: 'support_case',
      referenceId: CASE_ID,
    }, { getSupportCase })).resolves.toEqual({
      name: 'CustomerBookingDetail',
      params: { bookingId: BOOKING_ID },
    });
  });

  it.each([
    { referenceType: null, referenceId: BOOKING_ID },
    { referenceType: 'BOOKING', referenceId: 'not-a-uuid' },
    { referenceType: 'review', referenceId: CASE_ID },
    { referenceType: 'part_request', referenceId: CASE_ID },
    { referenceType: 'WITHDRAWAL_REQUEST', referenceId: CASE_ID },
  ])('does not invent a Customer route for unsupported/malformed reference %#', async (item) => {
    const getSupportCase = jest.fn();

    await expect(resolveCustomerNotificationTarget(
      item,
      { getSupportCase },
    )).resolves.toBeNull();
    expect(getSupportCase).not.toHaveBeenCalled();
  });

  it('never guesses a route when an owned SupportCase has no valid order or booking id', async () => {
    const getSupportCase = jest.fn().mockResolvedValue(
      supportCase({ serviceOrderId: 'bad', bookingId: null }),
    );

    await expect(resolveCustomerNotificationTarget({
      referenceType: 'SUPPORT_CASE',
      referenceId: CASE_ID,
    }, { getSupportCase })).resolves.toBeNull();
  });

  it('propagates actor-safe SupportCase lookup failure so the screen can stay put', async () => {
    const getSupportCase = jest.fn().mockRejectedValue(new Error('forbidden'));

    await expect(resolveCustomerNotificationTarget({
      referenceType: 'SUPPORT_CASE',
      referenceId: CASE_ID,
    }, { getSupportCase })).rejects.toThrow('forbidden');
  });
});
