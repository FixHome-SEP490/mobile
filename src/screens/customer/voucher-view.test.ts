import type { GeneralVoucher, VoucherClaim } from '../../api/vouchers.api';
import { claimState, conditionLabel, discountLabel, isVoucherCode, normalizeVoucherCode, splitWallet, unsavedGeneral } from './voucher-view';

const NOW = Date.parse('2026-11-01T00:00:00Z');
const claim = (patch: Omit<Partial<VoucherClaim>, 'campaign'> & { campaign?: Partial<VoucherClaim['campaign']> } = {}): VoucherClaim => ({
  id: 'c', campaignId: 'k', status: 'CLAIMED', redeemedAt: null,
  policy: { discount: 'PERCENT', value: 10, capVnd: 50000, minimumVnd: 100000 },
  ...patch,
  campaign: { code: 'A', name: 'A', kind: 'GENERAL', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', active: true, ...patch.campaign },
});

describe('voucher labels', () => {
  it('words a percent and a fixed discount and their conditions', () => {
    expect(discountLabel({ discount: 'PERCENT', value: 10, capVnd: null, minimumVnd: 0 })).toBe('Giảm 10%');
    expect(discountLabel({ discount: 'FIXED', value: 50000, capVnd: null, minimumVnd: 0 })).toContain('50.000');
    expect(conditionLabel({ discount: 'PERCENT', value: 10, capVnd: 50000, minimumVnd: 100000 })).toMatch(/^Đơn từ .*100\.000.* · Giảm tối đa .*50\.000.* · Tiền công và linh kiện$/);
    expect(conditionLabel({ discount: 'FIXED', value: 1, capVnd: null, minimumVnd: 0 })).toBe('Tiền công và linh kiện');
  });
});

describe('wallet state', () => {
  it('never calls a paused, ended or used voucher ready', () => {
    expect(claimState(claim(), NOW).label).toBe('Đã lưu trong ví');
    expect(claimState(claim({ campaign: { active: false } }), NOW)).toEqual({ label: 'Tạm dừng', ended: false });
    expect(claimState(claim({ campaign: { endsAt: '2026-10-15T00:00:00Z' } }), NOW)).toEqual({ label: 'Đã hết hạn', ended: true });
    expect(claimState(claim({ campaign: { startsAt: '2026-12-01T00:00:00Z' } }), NOW).label).toBe('Sắp diễn ra');
    expect(claimState(claim({ status: 'REDEEMED', redeemedAt: '2026-10-20T00:00:00Z' }), NOW)).toEqual({ label: 'Đã sử dụng', ended: true });
  });
  it('splits the open vouchers from the used and ended ones', () => {
    const open = claim({ id: 'open' });
    const used = claim({ id: 'used', status: 'REDEEMED', redeemedAt: '2026-10-20T00:00:00Z' });
    const ended = claim({ id: 'ended', campaign: { endsAt: '2026-10-15T00:00:00Z' } });
    const { mine, history } = splitWallet([open, used, ended], NOW);
    expect(mine.map((c) => c.id)).toEqual(['open']);
    expect(history.map((c) => c.id)).toEqual(['used', 'ended']);
  });
  it('offers only the general vouchers not yet saved', () => {
    const offers = [{ code: 'A' }, { code: 'B' }] as GeneralVoucher[];
    expect(unsavedGeneral(offers, [claim({ campaign: { code: 'A' } })]).map((o) => o.code)).toEqual(['B']);
  });
});

describe('voucher code', () => {
  it('trims, upper-cases and checks the shape the server takes', () => {
    expect(normalizeVoucherCode('  tet-2026 ')).toBe('TET-2026');
    expect(isVoucherCode('tet-2026')).toBe(true);
    expect(isVoucherCode('ab')).toBe(false);
    expect(isVoucherCode('có dấu')).toBe(false);
  });
});
