import apiClient from './client';
import {
  fundedCheckoutApi, FUNDED_INVALID, NoFundedCashReservationError, parseCheckoutPreview, parseReservation, VOUCHER_EXPIRED,
} from './funded-checkout.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const client = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const CLAIM = id(1), ORDER = id(2), INVOICE = id(3), ATTEMPT = id(4), HOLD = id(5), GROUP = id(6);
const body = (data: unknown) => ({ success: true, data });
const ok = (data: unknown) => ({ data: body(data) });
const preview = (over: Record<string, unknown> = {}) => ({
  scopeId: ORDER, claimId: CLAIM, previewOnly: true, paymentAvailable: true, reason: null,
  originalGrossVnd: 120000, eligibleBaseVnd: 120000, fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 70000, reasonCodes: [], ...over,
});
const reservation = (over: Record<string, unknown> = {}) => ({
  id: HOLD, claimId: CLAIM, scopeId: ORDER, attemptId: ATTEMPT, state: 'RESERVED',
  reservedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(), ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('preview', () => {
  it('reads the server price and refuses an answer for another claim or scope', async () => {
    client.get.mockResolvedValueOnce(ok(preview()));
    expect(await fundedCheckoutApi.preview(CLAIM, ORDER)).toMatchObject({ customerDueVnd: 70000, paymentAvailable: true });
    expect(client.get).toHaveBeenCalledWith(`/vouchers/checkout-preview/${CLAIM}/${ORDER}`);
    expect(() => parseCheckoutPreview(body(preview({ scopeId: INVOICE })), CLAIM, ORDER)).toThrow(FUNDED_INVALID);
  });
  it.each([['a fractional amount', { customerDueVnd: 70000.5 }], ['a negative amount', { customerDueVnd: -1 }], ['not preview-only', { previewOnly: false }], ['no reason codes', { reasonCodes: 'x' }]])('refuses %s', (_n, over) => {
    expect(() => parseCheckoutPreview(body(preview(over)), CLAIM, ORDER)).toThrow(FUNDED_INVALID);
  });
});

describe('reserve and release', () => {
  it('holds a voucher and returns the hold the server made', async () => {
    client.post.mockResolvedValueOnce(ok(reservation()));
    expect(await fundedCheckoutApi.reserve(CLAIM, ORDER, ATTEMPT)).toMatchObject({ id: HOLD, state: 'RESERVED' });
    expect(client.post).toHaveBeenCalledWith('/vouchers/apply', { claimId: CLAIM, scopeId: ORDER, attemptId: ATTEMPT });
  });
  it('refuses a hold that is expired, too long, or for something else', () => {
    expect(() => parseReservation(body(reservation({ state: 'EXPIRED' })), CLAIM, ORDER, ATTEMPT)).toThrow(VOUCHER_EXPIRED);
    expect(() => parseReservation(body(reservation({ expiresAt: new Date(Date.now() - 5).toISOString(), reservedAt: new Date(Date.now() - 60000).toISOString() })), CLAIM, ORDER, ATTEMPT)).toThrow(VOUCHER_EXPIRED);
    expect(() => parseReservation(body(reservation({ expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })), CLAIM, ORDER, ATTEMPT)).toThrow(FUNDED_INVALID);
    expect(() => parseReservation(body(reservation({ attemptId: id(9) })), CLAIM, ORDER, ATTEMPT)).toThrow(FUNDED_INVALID);
    expect(() => parseReservation(body(reservation({ id: 'not-a-uuid' })), CLAIM, ORDER, ATTEMPT)).toThrow(FUNDED_INVALID);
  });
  it('never sends a request with an id that is not a uuid', async () => {
    await expect(fundedCheckoutApi.reserve('claim', ORDER, ATTEMPT)).rejects.toThrow(FUNDED_INVALID);
    await expect(fundedCheckoutApi.release('hold')).rejects.toThrow(FUNDED_INVALID);
    expect(client.post).not.toHaveBeenCalled();
  });
  it('releases by id and checks the answer', async () => {
    client.post.mockResolvedValueOnce(ok({ id: HOLD, state: 'RELEASED' }));
    await fundedCheckoutApi.release(HOLD);
    expect(client.post).toHaveBeenCalledWith(`/vouchers/reservations/${HOLD}/release`);
    client.post.mockResolvedValueOnce(ok({ id: HOLD, state: 'RESERVED' }));
    await expect(fundedCheckoutApi.release(HOLD)).rejects.toThrow(FUNDED_INVALID);
  });
});

describe('paying through the hold', () => {
  const solo = { kind: 'SOLO' as const, serviceOrderId: ORDER, invoiceId: INVOICE };
  it('uses the invoice id for a single order and the visit id for a visit, and sends only the hold', async () => {
    client.post.mockResolvedValue(ok({ paid: true, amount: 70000, balance: 5000, settlementId: id(7) }));
    await fundedCheckoutApi.wallet(solo, HOLD);
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${INVOICE}/wallet`, { voucherReservationId: HOLD });
    await fundedCheckoutApi.wallet({ kind: 'VISIT_GROUP', id: GROUP }, HOLD);
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/visit-groups/${GROUP}/wallet`, { voucherReservationId: HOLD });
  });
  it('closes a zero due and refuses a zero answer that is not zero', async () => {
    client.post.mockResolvedValueOnce(ok({ paid: true, amount: 0, settlementId: id(7) }));
    await fundedCheckoutApi.zero(solo, HOLD);
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${INVOICE}/zero-closeout`, { voucherReservationId: HOLD });
    client.post.mockResolvedValueOnce(ok({ paid: true, amount: 1, settlementId: id(7) }));
    await expect(fundedCheckoutApi.zero(solo, HOLD)).rejects.toThrow(FUNDED_INVALID);
  });
  it('takes only an https VNPay url, with the mobile marker', async () => {
    client.post.mockResolvedValueOnce(ok({ paymentUrl: 'https://pay.example.test/x' }));
    expect(await fundedCheckoutApi.vnpay(solo, HOLD)).toBe('https://pay.example.test/x');
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${INVOICE}/vnpay`, { voucherReservationId: HOLD }, { headers: { 'x-client-platform': 'mobile' } });
    for (const bad of ['http://pay.example.test/x', 'javascript:alert(1)', 'https://u:p@pay.example.test/x', 'nope']) {
      client.post.mockResolvedValueOnce(ok({ paymentUrl: bad }));
      await expect(fundedCheckoutApi.vnpay(solo, HOLD)).rejects.toThrow(FUNDED_INVALID);
    }
  });
});

describe('funded cash', () => {
  const soloCash = { kind: 'SOLO' as const, serviceOrderId: ORDER };
  it('reads the hold of the order the technician is on', async () => {
    client.get.mockResolvedValueOnce(ok({ voucherReservationId: HOLD, customerDueVnd: 70000 }));
    expect(await fundedCheckoutApi.cashReservation(soloCash)).toEqual({ voucherReservationId: HOLD, customerDueVnd: 70000 });
    expect(client.get).toHaveBeenLastCalledWith(`/finance/funded/solo/${ORDER}/cash/reservation`);
  });
  it('treats only both-null as "no voucher", and a half answer as invalid', async () => {
    client.get.mockResolvedValueOnce(ok({ voucherReservationId: null, customerDueVnd: null }));
    await expect(fundedCheckoutApi.cashReservation({ kind: 'VISIT_GROUP', id: GROUP })).rejects.toBeInstanceOf(NoFundedCashReservationError);
    client.get.mockResolvedValueOnce(ok({ voucherReservationId: HOLD, customerDueVnd: null }));
    await expect(fundedCheckoutApi.cashReservation(soloCash)).rejects.toThrow(FUNDED_INVALID);
    client.get.mockResolvedValueOnce(ok({ voucherReservationId: null, customerDueVnd: 0 }));
    await expect(fundedCheckoutApi.cashReservation(soloCash)).rejects.toThrow(FUNDED_INVALID);
  });
  it('declares the due with the hold, and expects the pending status back', async () => {
    client.post.mockResolvedValueOnce(ok({ id: id(8), status: 'pending_confirmation' }));
    await fundedCheckoutApi.declareCash(soloCash, HOLD, { declaredAmount: 70000, technicianNotes: 'ok' });
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${ORDER}/cash/declare`, { declaredAmount: 70000, technicianNotes: 'ok', voucherReservationId: HOLD });
    client.post.mockResolvedValueOnce(ok({ id: id(8), status: 'confirmed' }));
    await expect(fundedCheckoutApi.declareCash(soloCash, HOLD, { declaredAmount: 70000 })).rejects.toThrow(FUNDED_INVALID);
  });
  it('confirms or disputes, and expects the status the scope ends in', async () => {
    client.post.mockResolvedValueOnce(ok({ id: id(8), status: 'confirmed' }));
    await fundedCheckoutApi.confirmCash(soloCash, HOLD, { agreed: true });
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${ORDER}/cash/confirm`, { agreed: true, voucherReservationId: HOLD });
    client.post.mockResolvedValueOnce(ok({ id: id(8), status: 'verified' }));
    await fundedCheckoutApi.confirmCash({ kind: 'VISIT_GROUP', id: GROUP }, HOLD, { agreed: true });
    client.post.mockResolvedValueOnce(ok({ id: id(8), status: 'disputed' }));
    await fundedCheckoutApi.confirmCash(soloCash, HOLD, { agreed: false, disputeReason: ' Chưa đúng ' });
    expect(client.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${ORDER}/cash/confirm`, { agreed: false, disputeReason: 'Chưa đúng', voucherReservationId: HOLD });
    await expect(fundedCheckoutApi.confirmCash(soloCash, HOLD, { agreed: false, disputeReason: '  ' })).rejects.toThrow(FUNDED_INVALID);
    client.post.mockResolvedValueOnce(ok({ id: id(8), status: 'confirmed' }));
    await expect(fundedCheckoutApi.confirmCash(soloCash, HOLD, { agreed: false, disputeReason: 'x' })).rejects.toThrow(FUNDED_INVALID);
  });
});
