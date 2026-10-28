// The rules of paying with a voucher on the phone (web #180, backend T2.1). Every amount is the server's; this file only
// checks that an answer belongs to the payment on screen and keeps the hold's clock.

import type { FundedReservation, VoucherCheckoutPreview } from '../../../api/funded-checkout.api';
import type { VoucherClaim } from '../../../api/vouchers.api';
import { claimState } from '../../../screens/customer/voucher-view';

/** A voucher held for the payment on screen, with the amounts the server calculated for it. */
export interface AppliedVoucher {
  reservationId: string;
  claimId: string;
  scopeId: string;
  expiresAt: string;
  originalGrossVnd: number;
  discountVnd: number;
  customerDueVnd: number;
}

export const VOUCHER_HOLD_EXPIRED = 'Thời gian giữ voucher đã hết. Hóa đơn vẫn thanh toán theo tổng gốc từ máy chủ.';
export const VOUCHER_NOT_READY = 'Dịch vụ giữ chỗ voucher chưa sẵn sàng trên máy chủ. Hóa đơn vẫn thanh toán theo tổng gốc.';
export const VOUCHER_NOT_ALLOWED = 'Máy chủ chưa cho phép giữ chỗ voucher. Hóa đơn vẫn thanh toán theo tổng gốc.';

/** A random v4 id for one hold attempt; the server takes it as an idempotency key, not as a secret. */
export function newUuidV4(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const digit = Math.floor(random() * 16);
    return (c === 'x' ? digit : (digit & 0x3) | 0x8).toString(16);
  });
}

/** Vouchers worth offering at checkout: saved, open now. The server decides whether one fits this invoice. */
export function usableClaims(wallet: VoucherClaim[], now = Date.now()): VoucherClaim[] {
  return wallet.filter((claim) => claim.status === 'CLAIMED' && claimState(claim, now).label === 'Đã lưu trong ví');
}

/** Why the preview does not allow a hold, or null when it does. */
export function previewBlock(preview: VoucherCheckoutPreview): string | null {
  if (preview.paymentAvailable) return null;
  return preview.reason === 'VOUCHER_FUNDING_NOT_READY' ? VOUCHER_NOT_READY : VOUCHER_NOT_ALLOWED;
}

/** The hold together with the preview it was made from; refuses a pair that does not describe one payment. */
export function toApplied(reservation: FundedReservation, preview: VoucherCheckoutPreview): AppliedVoucher | null {
  if (reservation.claimId !== preview.claimId || reservation.scopeId !== preview.scopeId || !preview.paymentAvailable
    || preview.customerDueVnd > preview.originalGrossVnd) return null;
  return {
    reservationId: reservation.id,
    claimId: reservation.claimId,
    scopeId: reservation.scopeId,
    expiresAt: reservation.expiresAt,
    originalGrossVnd: preview.originalGrossVnd,
    discountVnd: preview.originalGrossVnd - preview.customerDueVnd,
    customerDueVnd: preview.customerDueVnd,
  };
}

export function secondsLeft(voucher: Pick<AppliedVoucher, 'expiresAt'>, now = Date.now()): number {
  const expires = Date.parse(voucher.expiresAt);
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 1000)) : 0;
}

/** True while the hold may still be used for a payment on this scope. */
export function voucherUsable(voucher: AppliedVoucher | null, scopeId: string, now = Date.now()): voucher is AppliedVoucher {
  return !!voucher && voucher.scopeId === scopeId && secondsLeft(voucher, now) > 0;
}

export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
