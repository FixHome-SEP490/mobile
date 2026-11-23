import apiClient from './client';
import { customerContinuationApi, readContinuation } from './customer-continuation.api';
import { isOldFinanceReview, isOrderWorkStopped, readFailedWorkFinance } from './order-work-stopped';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn() } }));
const api = apiClient as unknown as { get: jest.Mock };

const ORDER = '11111111-1111-4111-8111-111111111111';
const BOOKING = '22222222-2222-4222-8222-222222222222';
const INCIDENT = '33333333-3333-4333-8333-333333333333';
const obligations = { reviewRequired: true, quotePreserved: true, moneyPreserved: true, partsPreserved: true, physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' };
const eligible = (over: Record<string, unknown> = {}, next: Record<string, unknown> = {}) => ({
  version: 1, incidentId: INCIDENT, serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED', serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
  workStopped: true, assignmentReleased: true, operationalDisposition: 'STOPPED', oldObligations: obligations,
  customerContinuation: {
    eligible: true, independentNewBookingAllowed: true, prefilledRebookAvailable: true, requiresNewSchedule: true, requiresPricingRevalidation: true,
    requiresCustomerConfirmation: true, draftPath: `/api/v1/bookings/${BOOKING}/interruption-draft`, confirmationPath: `/api/v1/bookings/${BOOKING}/interruption-rebook`,
    targetKind: 'booking', sourceCount: 1, source: { serviceOrderId: ORDER, bookingId: BOOKING, incidentId: INCIDENT, visitGroupId: null }, ...next,
  },
  ...over,
});
const none = {
  version: 1, incidentId: null, serviceOutcome: null, serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
  oldObligations: { ...obligations, reviewRequired: false },
  customerContinuation: { eligible: false, independentNewBookingAllowed: false, prefilledRebookAvailable: false, requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true, source: null },
};

describe('readContinuation', () => {
  it('reads an eligible continuation tied to this order and booking', () => {
    const out = readContinuation({ data: eligible() }, ORDER, BOOKING, null);
    expect(out.workStopped).toBe(true);
    expect(out.customerContinuation).toMatchObject({ eligible: true, prefilledRebookAvailable: true, sourceCount: 1, source: { bookingId: BOOKING, incidentId: INCIDENT } });
  });

  it('reads "nothing to continue" when there was no interruption', () => {
    expect(readContinuation(none, ORDER, BOOKING, null).customerContinuation).toMatchObject({ eligible: false, source: null });
  });

  it('refuses a receipt that belongs to another order, booking or visit', () => {
    expect(() => readContinuation(eligible(), '44444444-4444-4444-8444-444444444444', BOOKING, null)).toThrow('Chưa xác nhận');
    expect(() => readContinuation(eligible(), ORDER, '44444444-4444-4444-8444-444444444444', null)).toThrow('Chưa xác nhận');
    expect(() => readContinuation(eligible(), ORDER, BOOKING, 'group-1')).toThrow('Chưa xác nhận');
  });

  it('refuses a stop without a released assignment, or a stop that is not eligible', () => {
    expect(() => readContinuation(eligible({ assignmentReleased: false }), ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
    expect(() => readContinuation(eligible({}, { eligible: false, source: null }), ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
  });

  it('refuses draft paths of another booking and prefill data that was not announced', () => {
    expect(() => readContinuation(eligible({}, { draftPath: '/api/v1/bookings/other/interruption-draft' }), ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
    expect(() => readContinuation(eligible({}, { prefilledRebookAvailable: false }), ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
  });

  it('refuses a receipt that says the old obligations are free or the status moved on', () => {
    expect(() => readContinuation(eligible({ oldObligations: { ...obligations, moneyPreserved: false } }), ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
    expect(() => readContinuation(eligible({ serviceOrderStatus: 'completed' }), ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
    expect(() => readContinuation('x', ORDER, BOOKING, null)).toThrow('Chưa xác nhận');
  });
});

describe('customerContinuationApi.get', () => {
  it('reads the order\'s own route', async () => {
    api.get.mockResolvedValue({ data: { data: none } });
    await expect(customerContinuationApi.get(ORDER, BOOKING, null)).resolves.toMatchObject({ customerContinuation: { eligible: false } });
    expect(api.get).toHaveBeenCalledWith(`/service-orders/${ORDER}/customer-continuation`);
  });
});

describe('work stopped helpers', () => {
  const finance = { version: 1, state: 'VERIFIED_WORK_STOPPED_UNBILLED', customerPayableVnd: null, newCollectionAllowed: false, historicalQuoteOnly: true, reviewRequired: true, refundState: 'NOT_DETERMINED', message: 'Đang đối soát' };

  it('knows a stopped order from the flag or the disposition, and an order under money review', () => {
    expect(isOrderWorkStopped({ workStopped: true })).toBe(true);
    expect(isOrderWorkStopped({ operationalDisposition: 'STOPPED' })).toBe(true);
    expect(isOrderWorkStopped({ operationalDisposition: 'INTERRUPTION_RECORDED' })).toBe(false);
    expect(isOrderWorkStopped(null)).toBe(false);
    expect(isOldFinanceReview({ failedWorkFinance: finance })).toBe(true);
    expect(isOldFinanceReview({})).toBe(false);
  });

  it('reads the finance block only in its documented shape', () => {
    expect(readFailedWorkFinance(finance)).toMatchObject({ customerPayableVnd: null, refundState: 'NOT_DETERMINED' });
    expect(() => readFailedWorkFinance({ ...finance, customerPayableVnd: 100000 })).toThrow('đối soát');
    expect(() => readFailedWorkFinance({ ...finance, newCollectionAllowed: true })).toThrow('đối soát');
    expect(() => readFailedWorkFinance(null)).toThrow('đối soát');
  });
});
