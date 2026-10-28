import type { FundedReservation, VoucherCheckoutPreview } from '../../../api/funded-checkout.api';
import type { VoucherClaim } from '../../../api/vouchers.api';
import { countdown, newUuidV4, previewBlock, secondsLeft, toApplied, usableClaims, voucherUsable, VOUCHER_NOT_ALLOWED, VOUCHER_NOT_READY } from './voucher-checkout';

const NOW = Date.parse('2026-11-01T00:00:00Z');
const preview = (over: Partial<VoucherCheckoutPreview> = {}): VoucherCheckoutPreview => ({
  scopeId: 's', claimId: 'c', previewOnly: true, paymentAvailable: true, reason: null,
  originalGrossVnd: 120000, eligibleBaseVnd: 120000, fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 70000, reasonCodes: [], ...over,
});
const hold = (over: Partial<FundedReservation> = {}): FundedReservation => ({
  id: 'h', claimId: 'c', scopeId: 's', attemptId: 'a', state: 'RESERVED', reservedAt: '2026-11-01T00:00:00Z', expiresAt: '2026-11-01T00:15:00Z', ...over,
});
const claim = (over: { status?: VoucherClaim['status']; active?: boolean; endsAt?: string } = {}): VoucherClaim => ({
  id: 'c', campaignId: 'k', status: over.status ?? 'CLAIMED', redeemedAt: over.status === 'REDEEMED' ? '2026-10-20T00:00:00Z' : null,
  policy: { discount: 'PERCENT', value: 10, capVnd: null, minimumVnd: 0 },
  campaign: { code: 'A', name: 'A', kind: 'GENERAL', startsAt: '2026-10-01T00:00:00Z', endsAt: over.endsAt ?? '2026-12-31T00:00:00Z', active: over.active ?? true },
});

describe('newUuidV4', () => {
  it('makes a version 4 uuid the server accepts', () => {
    for (let i = 0; i < 50; i++) expect(newUuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newUuidV4(() => 0)).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('toApplied', () => {
  it('keeps the server amounts and derives the discount from them', () => {
    expect(toApplied(hold(), preview())).toEqual({
      reservationId: 'h', claimId: 'c', scopeId: 's', expiresAt: '2026-11-01T00:15:00Z', originalGrossVnd: 120000, discountVnd: 50000, customerDueVnd: 70000,
    });
  });
  it('refuses a hold and a preview that are not about the same payment, or a preview that does not allow payment', () => {
    expect(toApplied(hold({ claimId: 'other' }), preview())).toBeNull();
    expect(toApplied(hold({ scopeId: 'other' }), preview())).toBeNull();
    expect(toApplied(hold(), preview({ paymentAvailable: false }))).toBeNull();
    expect(toApplied(hold(), preview({ customerDueVnd: 120001 }))).toBeNull();
  });
});

describe('the hold clock', () => {
  const applied = toApplied(hold(), preview())!;
  it('counts down and is usable only for its own scope and only while time is left', () => {
    expect(secondsLeft(applied, Date.parse('2026-11-01T00:14:30Z'))).toBe(30);
    expect(secondsLeft(applied, Date.parse('2026-11-01T00:15:00Z'))).toBe(0);
    expect(voucherUsable(applied, 's', Date.parse('2026-11-01T00:10:00Z'))).toBe(true);
    expect(voucherUsable(applied, 'other', Date.parse('2026-11-01T00:10:00Z'))).toBe(false);
    expect(voucherUsable(applied, 's', Date.parse('2026-11-01T00:15:00Z'))).toBe(false);
    expect(voucherUsable(null, 's')).toBe(false);
  });
  it('writes minutes and seconds', () => {
    expect(countdown(0)).toBe('00:00');
    expect(countdown(65)).toBe('01:05');
    expect(countdown(-3)).toBe('00:00');
  });
});

describe('what may be offered', () => {
  it('lists only saved vouchers that are open now', () => {
    const open = claim();
    const list = [open, claim({ status: 'REDEEMED' }), claim({ active: false }), claim({ endsAt: '2026-10-15T00:00:00Z' })];
    expect(usableClaims(list, NOW)).toEqual([open]);
  });
  it('explains why the server does not allow a hold', () => {
    expect(previewBlock(preview())).toBeNull();
    expect(previewBlock(preview({ paymentAvailable: false, reason: 'VOUCHER_FUNDING_NOT_READY' }))).toBe(VOUCHER_NOT_READY);
    expect(previewBlock(preview({ paymentAvailable: false, reason: null }))).toBe(VOUCHER_NOT_ALLOWED);
  });
});
