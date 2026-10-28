import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import VoucherCheckoutSection from './VoucherCheckoutSection';
import type { AppliedVoucher } from './voucher-checkout';

const mockFunded = { preview: jest.fn(), reserve: jest.fn(), release: jest.fn() };
const mockWallet = jest.fn();
jest.mock('../../../api/funded-checkout.api', () => ({
  fundedCheckoutApi: new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => (mockFunded as Record<string, (...a: unknown[]) => unknown>)[name](...args) }),
}));
jest.mock('../../../api/vouchers.api', () => ({ vouchersApi: { wallet: (...args: unknown[]) => mockWallet(...args) } }));

const CLAIM = 'c1';
const claim = {
  id: CLAIM, campaignId: 'k', status: 'CLAIMED', redeemedAt: null, policy: { discount: 'PERCENT', value: 10, capVnd: null, minimumVnd: 0 },
  campaign: { code: 'A', name: 'Chào bạn mới', kind: 'GENERAL', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', active: true },
};
const preview = (over: Record<string, unknown> = {}) => ({
  scopeId: 'order', claimId: CLAIM, previewOnly: true, paymentAvailable: true, reason: null, originalGrossVnd: 120000,
  eligibleBaseVnd: 120000, fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 70000, reasonCodes: [], ...over,
});
const reservation = { id: 'hold', claimId: CLAIM, scopeId: 'order', attemptId: 'a', state: 'RESERVED', reservedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() };

const find = (tree: ReactTestRenderer, testID: string) => tree.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
async function mount(props: Partial<React.ComponentProps<typeof VoucherCheckoutSection>> = {}) {
  const onApplied = jest.fn();
  const onReleased = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<VoucherCheckoutSection scopeId="order" applied={null} onApplied={onApplied} onReleased={onReleased} {...props} />); });
  return { tree, onApplied, onReleased };
}
const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

beforeEach(() => {
  jest.resetAllMocks();
  mockWallet.mockResolvedValue([claim]);
});

it('lists the saved vouchers, reads the server price and holds the voucher', async () => {
  mockFunded.preview.mockResolvedValue(preview());
  mockFunded.reserve.mockResolvedValue(reservation);
  const { tree, onApplied } = await mount();
  await act(async () => { find(tree, 'voucher-checkout-toggle').props.onPress(); });
  await act(async () => { find(tree, `voucher-option-${CLAIM}`).props.onPress(); });
  expect(mockFunded.preview).toHaveBeenCalledWith(CLAIM, 'order');
  expect(text(tree)).toContain('Bạn trả');
  await act(async () => { find(tree, 'voucher-hold').props.onPress(); });
  expect(mockFunded.reserve).toHaveBeenCalledWith(CLAIM, 'order', expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ reservationId: 'hold', customerDueVnd: 70000, discountVnd: 50000, scopeId: 'order' }));
});

it('does not hold when the server does not allow it', async () => {
  mockFunded.preview.mockResolvedValue(preview({ paymentAvailable: false, reason: 'VOUCHER_FUNDING_NOT_READY' }));
  const { tree, onApplied } = await mount();
  await act(async () => { find(tree, 'voucher-checkout-toggle').props.onPress(); });
  await act(async () => { find(tree, `voucher-option-${CLAIM}`).props.onPress(); });
  expect(text(tree)).toContain('chưa sẵn sàng');
  await act(async () => { find(tree, 'voucher-hold').props.onPress(); });
  expect(mockFunded.reserve).not.toHaveBeenCalled();
  expect(onApplied).not.toHaveBeenCalled();
});

it('offers nothing when there is no saved voucher open now', async () => {
  mockWallet.mockResolvedValue([{ ...claim, status: 'REDEEMED', redeemedAt: '2026-10-20T00:00:00Z' }]);
  const { tree } = await mount();
  await act(async () => { find(tree, 'voucher-checkout-toggle').props.onPress(); });
  expect(tree.root.findAll((n) => n.props.testID === 'voucher-checkout-empty').length).toBeGreaterThan(0);
});

it('shows the held amounts and releases the hold', async () => {
  mockFunded.release.mockResolvedValue(undefined);
  const applied: AppliedVoucher = { reservationId: 'hold', claimId: CLAIM, scopeId: 'order', expiresAt: new Date(Date.now() + 600_000).toISOString(), originalGrossVnd: 120000, discountVnd: 50000, customerDueVnd: 70000 };
  const { tree, onReleased } = await mount({ applied });
  expect(text(tree)).toContain('Voucher đang được giữ');
  await act(async () => { find(tree, 'voucher-release').props.onPress(); });
  expect(mockFunded.release).toHaveBeenCalledWith('hold');
  expect(onReleased).toHaveBeenCalled();
});

it('lets go of an expired hold, unless a cash declaration still waits on it', async () => {
  const expired: AppliedVoucher = { reservationId: 'hold', claimId: CLAIM, scopeId: 'order', expiresAt: new Date(Date.now() - 1000).toISOString(), originalGrossVnd: 120000, discountVnd: 50000, customerDueVnd: 70000 };
  const dropped = await mount({ applied: expired });
  expect(dropped.onReleased).toHaveBeenCalledWith(expect.stringContaining('Thời gian giữ voucher đã hết'));
  const kept = await mount({ applied: expired, keepWhenExpired: true });
  expect(kept.onReleased).not.toHaveBeenCalled();
});
