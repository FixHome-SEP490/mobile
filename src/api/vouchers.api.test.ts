import apiClient from './client';
import { parseGeneralVoucher, parseVoucherClaim, vouchersApi, VOUCHER_INVALID } from './vouchers.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const client = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

const policy = { discount: 'PERCENT', value: 10, capVnd: 50000, minimumVnd: 100000, categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] };
const claim = {
  id: 'c1', campaignId: 'k1', status: 'CLAIMED', redeemedAt: null, policySnapshot: policy,
  campaign: { code: 'HELLO', name: 'Chào bạn mới', kind: 'GENERAL', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', active: true },
};
const general = { id: 'g1', code: 'TET', name: 'Tết', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', policy };

beforeEach(() => jest.clearAllMocks());

describe('voucher parsers', () => {
  it('reads a claim and a general offer', () => {
    expect(parseVoucherClaim(claim)).toMatchObject({ id: 'c1', status: 'CLAIMED', policy: { discount: 'PERCENT', value: 10, capVnd: 50000, minimumVnd: 100000 } });
    expect(parseGeneralVoucher(general).code).toBe('TET');
  });
  it.each([
    ['a percent over 100', { ...claim, policySnapshot: { ...policy, value: 101 } }],
    ['a redeemed claim without a date', { ...claim, status: 'REDEEMED' }],
    ['a claimed claim with a date', { ...claim, redeemedAt: '2026-10-02T00:00:00Z' }],
    ['an unknown status', { ...claim, status: 'RESERVED' }],
    ['no campaign', { ...claim, campaign: null }],
  ])('refuses %s', (_name, value) => {
    expect(() => parseVoucherClaim(value)).toThrow(VOUCHER_INVALID);
  });
});

describe('vouchersApi', () => {
  it('reads the wallet and the general offers through the success envelope', async () => {
    client.get.mockResolvedValueOnce({ data: { success: true, data: [claim] } }).mockResolvedValueOnce({ data: { success: true, data: [general] } });
    expect(await vouchersApi.wallet()).toHaveLength(1);
    expect(await vouchersApi.general()).toHaveLength(1);
    expect(client.get).toHaveBeenNthCalledWith(1, '/vouchers/wallet');
    expect(client.get).toHaveBeenNthCalledWith(2, '/vouchers/general');
  });
  it('saves a trimmed upper-case code and nothing else', async () => {
    client.post.mockResolvedValueOnce({ data: { success: true, data: claim } });
    await vouchersApi.claim('  hello ');
    expect(client.post).toHaveBeenCalledWith('/vouchers/claim', { code: 'HELLO' });
  });
  it('refuses an answer outside the envelope', async () => {
    client.get.mockResolvedValueOnce({ data: [claim] });
    await expect(vouchersApi.wallet()).rejects.toThrow(VOUCHER_INVALID);
  });
});
