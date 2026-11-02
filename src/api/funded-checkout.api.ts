// src/api/funded-checkout.api.ts
//
// Paying an invoice with a voucher (backend T2.1, web #180): hold the voucher, then pay the server-calculated due
// through the funded routes. The app never calculates a discount or an amount; every money value comes from the
// server and is only checked here for shape.
//
// Ids differ by route: reserve and cash use the ServiceOrder id (a VisitGroup id for a visit); solo wallet, VNPay and
// zero-closeout use the Invoice id.

import apiClient from './client';

export type FundedScope =
  | { kind: 'SOLO'; serviceOrderId: string; invoiceId: string }
  | { kind: 'VISIT_GROUP'; id: string };
export type FundedCashScope = { kind: 'SOLO'; serviceOrderId: string } | { kind: 'VISIT_GROUP'; id: string };

export interface VoucherCheckoutPreview {
  scopeId: string;
  claimId: string;
  previewOnly: true;
  paymentAvailable: boolean;
  reason: string | null;
  originalGrossVnd: number;
  eligibleBaseVnd: number;
  fixHomeDiscountSubsidyVnd: number;
  customerDueVnd: number;
  reasonCodes: string[];
}

export interface FundedReservation {
  id: string;
  claimId: string;
  scopeId: string;
  attemptId: string;
  state: 'RESERVED';
  reservedAt: string;
  expiresAt: string;
}

export interface FundedCashReservation {
  voucherReservationId: string;
  customerDueVnd: number;
}

export const FUNDED_INVALID = 'Không thể xác minh giao dịch ưu đãi.';
export const VOUCHER_EXPIRED = 'Thời gian giữ voucher đã hết. Hãy tải lại thông tin thanh toán để thử lại.';
/** The server says there is no voucher on this payment: only this answer lets the technician collect the full amount. */
export class NoFundedCashReservationError extends Error {
  constructor() {
    super('Không có voucher đang giữ cho thanh toán này.');
    this.name = 'NoFundedCashReservationError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HOLD_MS = 15 * 60 * 1000;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isVnd = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const invalid = (): never => { throw new Error(FUNDED_INVALID); };

function data(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return invalid();
  return payload.data;
}

export function parseCheckoutPreview(payload: unknown, claimId: string, scopeId: string): VoucherCheckoutPreview {
  const v = data(payload);
  const reasons = v.reasonCodes;
  if (v.claimId !== claimId || v.scopeId !== scopeId || v.previewOnly !== true || typeof v.paymentAvailable !== 'boolean'
    || !(v.reason === undefined || v.reason === null || typeof v.reason === 'string')
    || !isVnd(v.originalGrossVnd) || !isVnd(v.eligibleBaseVnd) || !isVnd(v.fixHomeDiscountSubsidyVnd) || !isVnd(v.customerDueVnd)
    || !Array.isArray(reasons) || !reasons.every((code) => typeof code === 'string')) return invalid();
  return {
    scopeId, claimId, previewOnly: true, paymentAvailable: v.paymentAvailable, reason: (v.reason as string | null | undefined) ?? null,
    originalGrossVnd: v.originalGrossVnd, eligibleBaseVnd: v.eligibleBaseVnd, fixHomeDiscountSubsidyVnd: v.fixHomeDiscountSubsidyVnd,
    customerDueVnd: v.customerDueVnd, reasonCodes: reasons as string[],
  };
}

export function parseReservation(payload: unknown, claimId: string, scopeId: string, attemptId: string, now = Date.now()): FundedReservation {
  const v = data(payload);
  const reservedAt = typeof v.reservedAt === 'string' ? Date.parse(v.reservedAt) : NaN;
  const expiresAt = typeof v.expiresAt === 'string' ? Date.parse(v.expiresAt) : NaN;
  if (!isId(v.id) || v.claimId !== claimId || v.scopeId !== scopeId || v.attemptId !== attemptId
    || !Number.isFinite(reservedAt) || !Number.isFinite(expiresAt) || expiresAt <= reservedAt || expiresAt - reservedAt > MAX_HOLD_MS) return invalid();
  if (v.state === 'EXPIRED' || expiresAt <= now) throw new Error(VOUCHER_EXPIRED);
  if (v.state !== 'RESERVED') return invalid();
  return { id: v.id, claimId, scopeId, attemptId, state: 'RESERVED', reservedAt: v.reservedAt as string, expiresAt: v.expiresAt as string };
}

function payRoute(scope: FundedScope, rail: 'wallet' | 'vnpay' | 'zero-closeout'): string {
  if (scope.kind === 'SOLO') {
    if (!isId(scope.serviceOrderId) || !isId(scope.invoiceId)) return invalid();
    return `/finance/funded/solo/${encodeURIComponent(scope.invoiceId)}/${rail}`;
  }
  if (!isId(scope.id)) return invalid();
  return `/finance/funded/visit-groups/${encodeURIComponent(scope.id)}/${rail}`;
}

function cashRoute(scope: FundedCashScope, rail: 'cash/reservation' | 'cash/declare' | 'cash/confirm'): string {
  const id = scope.kind === 'SOLO' ? scope.serviceOrderId : scope.id;
  if (!isId(id)) return invalid();
  return `/finance/funded/${scope.kind === 'SOLO' ? 'solo' : 'visit-groups'}/${encodeURIComponent(id)}/${rail}`;
}

const hold = (reservationId: string): { voucherReservationId: string } => (isId(reservationId) ? { voucherReservationId: reservationId } : invalid());

function settlement(payload: unknown): Record<string, unknown> {
  const v = data(payload);
  if (!isId(v.id) || !['pending_confirmation', 'confirmed', 'disputed', 'verified'].includes(String(v.status))) return invalid();
  return v;
}

export const fundedCheckoutApi = {
  /** Read-only: what the invoice would cost with this voucher, from the frozen invoice. It holds nothing. */
  async preview(claimId: string, scopeId: string): Promise<VoucherCheckoutPreview> {
    if (!isId(claimId) || !isId(scopeId)) return invalid();
    const res = await apiClient.get(`/vouchers/checkout-preview/${encodeURIComponent(claimId)}/${encodeURIComponent(scopeId)}`);
    return parseCheckoutPreview(res.data, claimId, scopeId);
  },

  async reserve(claimId: string, scopeId: string, attemptId: string): Promise<FundedReservation> {
    if (![claimId, scopeId, attemptId].every(isId)) return invalid();
    const res = await apiClient.post('/vouchers/apply', { claimId, scopeId, attemptId });
    return parseReservation(res.data, claimId, scopeId, attemptId);
  },

  async release(reservationId: string): Promise<void> {
    const { voucherReservationId } = hold(reservationId);
    const v = data((await apiClient.post(`/vouchers/reservations/${encodeURIComponent(voucherReservationId)}/release`)).data);
    if (v.id !== reservationId || !['RELEASED', 'EXPIRED'].includes(String(v.state))) invalid();
  },

  async wallet(scope: FundedScope, reservationId: string): Promise<{ amount: number; balance: number }> {
    const v = data((await apiClient.post(payRoute(scope, 'wallet'), hold(reservationId))).data);
    if (v.paid !== true || !isVnd(v.amount) || !isVnd(v.balance)) return invalid();
    return { amount: v.amount, balance: v.balance };
  },

  async vnpay(scope: FundedScope, reservationId: string): Promise<string> {
    const v = data((await apiClient.post(payRoute(scope, 'vnpay'), hold(reservationId), { headers: { 'x-client-platform': 'mobile' } })).data);
    if (typeof v.paymentUrl !== 'string') return invalid();
    let target: URL;
    try { target = new URL(v.paymentUrl); } catch { return invalid(); }
    if (target.protocol !== 'https:' || !target.hostname || target.username || target.password) return invalid();
    return target.toString();
  },

  async zero(scope: FundedScope, reservationId: string): Promise<void> {
    const v = data((await apiClient.post(payRoute(scope, 'zero-closeout'), hold(reservationId))).data);
    if (v.paid !== true || v.amount !== 0 || !isId(v.settlementId)) invalid();
  },

  /**
   * The technician's lookup before declaring cash. Both fields null is the server's explicit "no voucher": only then
   * does the full-amount cash flow apply. Any error means nothing was proven and the caller must not fall back.
   */
  async cashReservation(scope: FundedCashScope): Promise<FundedCashReservation> {
    const v = data((await apiClient.get(cashRoute(scope, 'cash/reservation'))).data);
    if (v.voucherReservationId === null && v.customerDueVnd === null) throw new NoFundedCashReservationError();
    if (!isId(v.voucherReservationId) || !isVnd(v.customerDueVnd)) return invalid();
    return { voucherReservationId: v.voucherReservationId, customerDueVnd: v.customerDueVnd };
  },

  async declareCash(
    scope: FundedCashScope,
    reservationId: string,
    input: { declaredAmount: number; technicianNotes?: string; receiptEvidenceUrl?: string },
  ): Promise<void> {
    if (!isVnd(input.declaredAmount)) invalid();
    const v = settlement((await apiClient.post(cashRoute(scope, 'cash/declare'), {
      declaredAmount: input.declaredAmount,
      ...(input.technicianNotes ? { technicianNotes: input.technicianNotes } : {}),
      ...(input.receiptEvidenceUrl ? { receiptEvidenceUrl: input.receiptEvidenceUrl } : {}),
      ...hold(reservationId),
    })).data);
    if (v.status !== 'pending_confirmation') invalid();
  },

  async confirmCash(
    scope: FundedCashScope,
    reservationId: string,
    input: { agreed: true } | { agreed: false; disputeReason: string },
  ): Promise<void> {
    if (!input.agreed && (!input.disputeReason.trim() || input.disputeReason.length > 2000)) invalid();
    const body = input.agreed
      ? { agreed: true, ...hold(reservationId) }
      : { agreed: false, disputeReason: input.disputeReason.trim(), ...hold(reservationId) };
    const v = settlement((await apiClient.post(cashRoute(scope, 'cash/confirm'), body)).data);
    const expected = input.agreed ? (scope.kind === 'VISIT_GROUP' ? 'verified' : 'confirmed') : 'disputed';
    if (v.status !== expected) invalid();
  },
};
