import { formatVnd } from '../../../utils/format';
import { consentBody, newCommandId, parseFreeRead, parsePaidRead } from '../../../api/w3-delivery.api';
import {
  canCustomerConsent, ceilingRows, consentSummary, deliveryKind, deliveryProgress, isW3DeliveryRequest, splitPreview,
} from './customer-delivery';

const FP = 'a'.repeat(64);
const freeRead = (over: Record<string, unknown> = {}) => ({ success: true, statusCode: 200, message: 'ok', data: {
  version: 2, invalidated: false, customerConsented: false, technicianConsented: false, actual: null, physical: null,
  quote: { quoteVersion: 1, fingerprint: FP, policyVersion: 'W3_70_30_V1', totalShippingFee: 0, customerShippingShare: 0, technicianShippingShare: 0, laborBudget: 'UNVERIFIED' },
  financialExecution: 'BLOCKED', financialBlocker: 'FINANCE_LEDGER_SOURCE_REQUIRED', ...over } });
const paidRead = (state: Record<string, unknown> | null = {}, ceilings: unknown = null) => ({ success: true, statusCode: 200, message: 'ok', data: {
  invalidated: false, recordedConditionalCeilings: ceilings, blockers: [], financialExecution: 'BLOCKED', laborBudget: null, aggregateBudgetVerified: false,
  state: state && { version: 3, scope: 'CONDITIONAL_TERMS_ONLY', customerConsented: false, technicianConsented: false, actual: null,
    quote: { quoteVersion: 1, policyVersion: 'W3_70_30_V1', totalShippingFee: 30000, customerShippingShare: 21000, technicianShippingShare: 9000, fingerprint: FP },
    ...state } } });

describe('W3 delivery request filter', () => {
  const base = { fulfillmentMethod: 'delivery' as const, requestType: 'additional' as const, shippingFee: 0, status: 'requested' as const };
  it('only additional delivery requests with a server fee', () => {
    expect(isW3DeliveryRequest(base)).toBe(true);
    expect(isW3DeliveryRequest({ ...base, fulfillmentMethod: 'pickup' })).toBe(false);
    expect(isW3DeliveryRequest({ ...base, requestType: 'pre_repair' })).toBe(false);
    expect(isW3DeliveryRequest({ ...base, status: 'cancelled' })).toBe(false);
    expect(deliveryKind({ shippingFee: 0 })).toBe('free');
    expect(deliveryKind({ shippingFee: 30000 })).toBe('paid');
  });
});

describe('0đ delivery consent', () => {
  it('previews 100/0 and sends a zero share bound to the quote', () => {
    const state = parseFreeRead(freeRead());
    expect(splitPreview(state)?.title).toContain('100%');
    expect(canCustomerConsent(state, 0)).toBe(true);
    const id = newCommandId();
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(consentBody(state, id)).toEqual({ commandId: id, expectedVersion: 2, quoteVersion: 1, quoteFingerprint: FP,
      totalShippingFee: 0, shippingShare: 0, accepted: true });
  });
  it('blocks consent when already consented, invalidated or no quote', () => {
    expect(canCustomerConsent(parseFreeRead(freeRead({ customerConsented: true })), 0)).toBe(false);
    expect(canCustomerConsent(parseFreeRead(freeRead({ invalidated: true })), 0)).toBe(false);
    const none = parseFreeRead(freeRead({ quote: null }));
    expect(canCustomerConsent(none, 0)).toBe(false);
    expect(consentSummary(none)).toContain('Đang chờ');
    expect(() => consentBody(parseFreeRead(freeRead({ customerConsented: true })), newCommandId())).toThrow();
  });
  it('rejects a quote whose shares do not add up', () => {
    expect(() => parseFreeRead(freeRead({ quote: { quoteVersion: 1, fingerprint: FP, totalShippingFee: 0, customerShippingShare: 1, technicianShippingShare: 0 } }))).toThrow();
  });
  it('progress follows the physical status', () => {
    const state = parseFreeRead(freeRead({ physical: { status: 'DISPATCH_RECORDED' } }));
    expect(deliveryProgress(state).map(step => step.done)).toEqual([true, true, true, false]);
    expect(deliveryProgress(parseFreeRead(freeRead({ physical: { status: 'RELEASED' } }))).some(s => s.done)).toBe(false);
  });
});

describe('paid delivery terms (70/30)', () => {
  it('previews the server split and consents with the customer share', () => {
    const state = parsePaidRead(paidRead())!;
    expect(splitPreview(state)?.rows.map(r => r[1])).toEqual([formatVnd(30000), formatVnd(21000), formatVnd(9000)]);
    expect(canCustomerConsent(state, 30000)).toBe(true);
    expect(canCustomerConsent(state, 20000)).toBe(false);
    expect(consentBody(state, newCommandId())).toMatchObject({ expectedVersion: 3, totalShippingFee: 30000, shippingShare: 21000 });
  });
  it('shows the four recorded ceilings', () => {
    const state = parsePaidRead(paidRead({}, { count: 1, shipping: '30000', customer: '21000', technician: '9000' }))!;
    expect(ceilingRows(state)).toEqual([
      ['Số lần giao đã ghi', '1'], ['Trần phí giao', formatVnd(30000)], ['Trần phần bạn trả', formatVnd(21000)], ['Trần phần kỹ thuật viên', formatVnd(9000)],
    ]);
  });
  it('no terms yet reads as null; waiting technician summary', () => {
    expect(parsePaidRead(paidRead(null))).toBeNull();
    expect(consentSummary(parsePaidRead(paidRead({ customerConsented: true }))!)).toContain('chờ kỹ thuật viên');
  });
});
