import { formatVnd } from '../../../utils/format';
import { consentBody, parseFreeRead, parsePaidRead } from '../../../api/w3-delivery.api';
import {
  canReceivePickup, displayPartRequestStatus, readW3Received, warehouseDistanceText, warehouseStatusText,
  type PartRequest, type WarehouseAllocation,
} from '../../../api/part-requests.api';
import { canReviseUnsourcedQuote, isPartsSourceUnavailable, needsSourcingCheck, readPartsSourcing } from '../../../api/parts-sourcing.api';
import { sourcingNoteText } from '../../../components/PartsSourcingNote';
import {
  canOperatePhysical, canRecordReceipt, canReserve, canTechnicianConsent, technicianCeilingRows,
  technicianDeliverySummary, technicianSplitPreview,
} from './technician-delivery';

const FP = 'b'.repeat(64);
const WH = '11111111-2222-4333-8444-555555555555';
const free = (over: Record<string, unknown> = {}) => parseFreeRead({ success: true, statusCode: 200, message: 'ok', data: {
  version: 2, invalidated: false, customerConsented: false, technicianConsented: false, actual: null, physical: null,
  quote: { quoteVersion: 1, fingerprint: FP, policyVersion: 'W3_70_30_V1', totalShippingFee: 0, customerShippingShare: 0, technicianShippingShare: 0, laborBudget: 'UNVERIFIED' },
  financialExecution: 'BLOCKED', financialBlocker: 'FINANCE_LEDGER_SOURCE_REQUIRED', ...over } });
const paid = (state: Record<string, unknown> = {}, ceilings: unknown = null) => parsePaidRead({ success: true, statusCode: 200, message: 'ok', data: {
  invalidated: false, recordedConditionalCeilings: ceilings, blockers: [], financialExecution: 'BLOCKED', laborBudget: null, aggregateBudgetVerified: false,
  state: { version: 3, scope: 'CONDITIONAL_TERMS_ONLY', customerConsented: false, technicianConsented: false, actual: null,
    quote: { quoteVersion: 4, policyVersion: 'W3_70_30_V1', totalShippingFee: 30000, customerShippingShare: 21000, technicianShippingShare: 9000, fingerprint: FP },
    ...state } } })!;
const physical = (status: string) => ({ status, version: 5, reason: null, warehouseId: WH, responsibleUserId: null, quantities: [], courierReference: null, evidence: [] });

describe('TECH 59: consent by quote version', () => {
  it('0đ body carries the quote version, fingerprint and a 0 share', () => {
    const body = consentBody(free(), '11111111-1111-4111-8111-111111111111', 'technician');
    expect(body).toMatchObject({ expectedVersion: 2, quoteVersion: 1, quoteFingerprint: FP, totalShippingFee: 0, shippingShare: 0, accepted: true });
  });
  it('paid body sends the server technician share (30%), never the customer share', () => {
    const body = consentBody(paid(), '11111111-1111-4111-8111-111111111111', 'technician');
    expect(body).toMatchObject({ expectedVersion: 3, quoteVersion: 4, totalShippingFee: 30000, shippingShare: 9000 });
  });
  it('no consent twice, on a changed quote, or above the approved fee', () => {
    expect(canTechnicianConsent(free(), 0)).toBe(true);
    expect(canTechnicianConsent(free({ technicianConsented: true }), 0)).toBe(false);
    expect(canTechnicianConsent(free({ invalidated: true }), 0)).toBe(false);
    expect(canTechnicianConsent(paid(), 30000)).toBe(true);
    expect(canTechnicianConsent(paid(), 20000)).toBe(false);
    expect(() => consentBody(free({ technicianConsented: true }), '11111111-1111-4111-8111-111111111111', 'technician')).toThrow();
    // The customer having consented does not consume the technician's consent.
    expect(canTechnicianConsent(free({ customerConsented: true }), 0)).toBe(true);
  });
});

describe('TECH 58/62: split preview, ceilings, summary', () => {
  it('0đ is 100/0 with nothing for the technician', () => {
    expect(technicianSplitPreview(free())).toEqual({ title: 'Phí giao 0 ₫ (FixHome chịu 100%)', rows: [['Khách trả', formatVnd(0)], ['Bạn chịu', formatVnd(0)]] });
  });
  it('paid shows 70/30 from the server and the actual technician share once recorded', () => {
    const preview = technicianSplitPreview(paid({ actual: { quoteVersion: 4, totalShippingFee: 20000, customerShippingShare: 14000, technicianShippingShare: 6000, verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' } }))!;
    expect(preview.rows.map(r => r[0])).toEqual(['Tổng phí giao tối đa', 'Khách trả (70%)', 'Bạn chịu (30%)', 'Bạn chịu thực tế (30%)']);
    expect(preview.rows[2][1]).toContain('9.000');
    expect(preview.rows[3][1]).toContain('6.000');
  });
  it('ceilings are worded for the technician', () => {
    const rows = technicianCeilingRows(paid({}, { count: 1, shipping: '30000', customer: '21000', technician: '9000' }));
    expect(rows.map(r => r[0])).toEqual(['Số lần giao đã ghi', 'Trần phí giao', 'Trần phần khách trả', 'Trần phần bạn chịu']);
  });
  it('summary follows the server state', () => {
    expect(technicianDeliverySummary(free({ technicianConsented: true }))).toContain('chờ khách hàng');
    expect(technicianDeliverySummary(free({ technicianConsented: true, customerConsented: true }))).toContain('phí giao thực tế');
    expect(technicianDeliverySummary(free({ physical: physical('TECHNICIAN_RECEIVED') }))).toContain('đã nhận');
  });
});

describe('TECH 60/61: reserve and receipt', () => {
  const both = { customerConsented: true, technicianConsented: true, actual: { totalShippingFee: 0, quoteVersion: 1 } };
  it('physical steps need both consents and the actual fee', () => {
    expect(canOperatePhysical(free({ customerConsented: true, technicianConsented: true }))).toBe(false);
    expect(canOperatePhysical(free(both))).toBe(true);
    expect(canReserve(free(both))).toBe(true);
    expect(canReserve(free({ ...both, physical: physical('RELEASED') }))).toBe(true);
    expect(canReserve(free({ ...both, physical: physical('RESERVED') }))).toBe(false);
  });
  it('receipt only after dispatch, bound to the journal warehouse and version', () => {
    const s = free({ ...both, physical: physical('DISPATCH_RECORDED') });
    expect(canRecordReceipt(s)).toBe(true);
    expect(s.physicalWarehouseId).toBe(WH);
    expect(s.physicalVersion).toBe(5);
    expect(canRecordReceipt(free({ ...both, physical: physical('ISSUED_TO_COURIER') }))).toBe(false);
    expect(canRecordReceipt(free({ ...both, physical: physical('TECHNICIAN_RECEIVED') }))).toBe(false);
  });
});

describe('TECH 57/64/65: W2 pickup warehouse', () => {
  const pr = { fulfillmentMethod: 'pickup' as const, status: 'ready' as const };
  const wh = (over: Partial<WarehouseAllocation>): WarehouseAllocation => ({ partRequestId: 'x', mode: 'warehouse', status: 'reserved', ...over });
  it('warehouse path: receive code only after the physical handover', () => {
    expect(canReceivePickup(pr, wh({ status: 'ready' }))).toBe(false);
    expect(canReceivePickup(pr, wh({ status: 'handed_over' }))).toBe(true);
    expect(canReceivePickup(pr, wh({ status: 'received' }))).toBe(false);
    expect(canReceivePickup(pr, { partRequestId: 'x', mode: 'legacy', status: null })).toBe(true);
    expect(canReceivePickup(pr, null)).toBe(false);
    expect(canReceivePickup({ ...pr, fulfillmentMethod: 'delivery' }, wh({ status: 'handed_over' }))).toBe(false);
  });
  it('nearest warehouse shows straight-line km from the booking, never a road ETA', () => {
    expect(warehouseDistanceText(wh({ warehouseId: WH, estimatedStraightLineKm: 3.24, distanceReference: 'booking_snapshot' }))).toContain('~3.2 km');
    expect(warehouseDistanceText(wh({ warehouseId: WH, estimatedStraightLineKm: null, distanceReference: null }))).toBe('Chưa xác minh khoảng cách tới kho.');
    expect(warehouseDistanceText(wh({ warehouseId: null, status: 'stock_unavailable' }))).toBeNull();
  });
  it('no warehouse with stock tells the technician to prepare the parts', () => {
    expect(warehouseStatusText(wh({ status: 'stock_unavailable' }))).toContain('tự chuẩn bị');
    expect(warehouseStatusText(wh({ status: 'handed_over' }))).toContain('48 giờ');
  });
});

describe('W3 stage on the order part requests', () => {
  const base = { status: 'requested', w3DeliveryStage: 'TECHNICIAN_RECEIVED' } as PartRequest;
  it('a received W3 delivery reads as received; other stages only change the label', () => {
    expect(readW3Received(base).status).toBe('received');
    expect(readW3Received({ ...base, w3DeliveryStage: 'DISPATCH_RECORDED' }).status).toBe('requested');
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: 'DISPATCH_RECORDED' })).toBe('delivering');
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: null })).toBe('requested');
  });
});

describe('CUSTOMER 72 / TECH 66: parts with no source', () => {
  const refusal = { response: { status: 409, data: { error: { code: 'PARTS_SOURCE_UNAVAILABLE', message: 'x' } } } };
  it('recognizes only the 409 PARTS_SOURCE_UNAVAILABLE refusal', () => {
    expect(isPartsSourceUnavailable(refusal)).toBe(true);
    expect(isPartsSourceUnavailable({ response: { status: 409, data: { error: { code: 'CONFLICT' } } } })).toBe(false);
    expect(isPartsSourceUnavailable({ response: { status: 500 } })).toBe(false);
  });
  it('asks only for a SENT quote with a FixHome part', () => {
    expect(needsSourcingCheck({ id: 'q', status: 'SENT', items: [{ type: 'PARTS', partSource: 'fixhome' }] })).toBe(true);
    expect(needsSourcingCheck({ id: 'q', status: 'APPROVED', items: [{ type: 'PARTS', partSource: 'fixhome' }] })).toBe(false);
    expect(needsSourcingCheck({ id: 'q', status: 'SENT', items: [{ type: 'PARTS', partSource: 'technician' }] })).toBe(false);
  });
  it('note lists the missing parts for each audience; revise only when unsourced', () => {
    const s = readPartsSourcing({ data: { quotationId: 'q', quotationStatus: 'SENT', status: 'unavailable', missing: [{ partCatalogId: 'p', name: 'Tụ quạt', quantity: 2 }] } });
    expect(sourcingNoteText(s, 'customer')).toContain('Tụ quạt × 2');
    expect(sourcingNoteText(s, 'customer')).toContain('từ chối');
    expect(sourcingNoteText(s, 'technician')).toContain('Gửi lại báo giá khác');
    expect(sourcingNoteText(readPartsSourcing({ status: 'available', missing: [] }), 'customer')).toBeNull();
    expect(canReviseUnsourcedQuote(true, s)).toBe(true);
    expect(canReviseUnsourcedQuote(false, s)).toBe(false);
    expect(canReviseUnsourcedQuote(true, readPartsSourcing({ status: 'available' }))).toBe(false);
  });
});
