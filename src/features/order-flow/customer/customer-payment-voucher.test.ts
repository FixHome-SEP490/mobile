import { createOrderPaymentController } from './customer-payment-controller';
import { m6Fixture, walletSummary } from './m6-fixtures.test-utils';
import type { AppliedVoucher } from './voucher-checkout';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));

const SCOPE = { kind: 'SOLO', serviceOrderId: 'order', invoiceId: 'invoice' };
const voucher = (patch: Partial<AppliedVoucher> = {}): AppliedVoucher => ({
  reservationId: 'hold-1', claimId: 'claim-1', scopeId: 'order', expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  originalGrossVnd: 120000, discountVnd: 50000, customerDueVnd: 70000, ...patch,
});

function setup() {
  const f = m6Fixture();
  const paid = () => { f.server.invoice!.paymentStatus = 'paid'; };
  const funded = {
    wallet: jest.fn(async (_scope: unknown, _hold: string) => { paid(); return { amount: 70000, balance: 0 }; }),
    vnpay: jest.fn(async (_scope: unknown, _hold: string) => 'https://payments.example.test/funded'),
    zero: jest.fn(async (_scope: unknown, _hold: string) => { paid(); }),
    confirmCash: jest.fn(async (_scope: unknown, _hold: string, _input: unknown) => { f.server.cash!.status = 'confirmed'; paid(); }),
  };
  const transport = {
    payWallet: jest.fn(async () => { paid(); return { paid: true }; }),
    createVnpayUrl: jest.fn(async () => 'https://payments.example.test/start'),
    confirmCash: jest.fn(async (_id: string, _body: unknown) => undefined),
    confirmNoCharge: jest.fn(async (_id: string) => undefined),
    readWallet: jest.fn(async () => f.server.wallet),
    openUrl: jest.fn(async (_url: string) => undefined),
    funded,
  };
  return { ...f, transport, funded, controller: createOrderPaymentController({ ...f.runtime, transport }) };
}
const declared = (f: ReturnType<typeof setup>, amount: number) => {
  f.server.cash = { technicianNotes: null, id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: amount, declaredByTechnicianId: 'tech', declaredAt: '2026-10-27T00:00:00Z', confirmedAmount: null };
};

it('pays the wallet through the funded route at the held due, not the invoice total', async () => {
  const f = setup(); f.server.wallet = walletSummary('70000');
  f.controller.setVoucher(voucher());
  await f.controller.requestPayment('wallet'); await f.controller.submitConfirmation();
  expect(f.funded.wallet).toHaveBeenCalledWith(SCOPE, 'hold-1');
  expect(f.transport.payWallet).not.toHaveBeenCalled();
  expect(f.controller.getState()).toMatchObject({ phase: 'resolved', voucher: null });
});

it('checks the wallet against the due: enough for the due is enough, not enough for the due is refused', async () => {
  const enough = setup(); enough.server.wallet = walletSummary('70000'); enough.controller.setVoucher(voucher());
  await enough.controller.requestPayment('wallet'); expect(enough.controller.getState().phase).toBe('confirming');
  const short = setup(); short.server.wallet = walletSummary('69999'); short.controller.setVoucher(voucher());
  await short.controller.requestPayment('wallet'); await short.controller.submitConfirmation();
  expect(short.funded.wallet).not.toHaveBeenCalled(); expect(short.controller.getState().phase).toBe('denied');
});

it('opens VNPay through the funded route', async () => {
  const f = setup(); f.controller.setVoucher(voucher());
  await f.controller.requestPayment('vnpay'); await f.controller.submitConfirmation();
  expect(f.funded.vnpay).toHaveBeenCalledWith(SCOPE, 'hold-1');
  expect(f.transport.createVnpayUrl).not.toHaveBeenCalled();
});

it('closes a fully funded invoice in one funded call, and refuses the wallet while the due is zero', async () => {
  const f = setup(); f.server.wallet = walletSummary('500000'); f.controller.setVoucher(voucher({ discountVnd: 120000, customerDueVnd: 0 }));
  await f.controller.requestPayment('wallet'); await f.controller.submitConfirmation();
  expect(f.funded.wallet).not.toHaveBeenCalled();
  await f.controller.requestPayment('voucher_zero'); await f.controller.submitConfirmation();
  expect(f.funded.zero).toHaveBeenCalledWith(SCOPE, 'hold-1');
  expect(f.controller.getState().phase).toBe('resolved');
});

it('does not close with zero unless the held due is zero', async () => {
  const f = setup(); f.controller.setVoucher(voucher());
  await f.controller.requestPayment('voucher_zero'); await f.controller.submitConfirmation();
  expect(f.funded.zero).not.toHaveBeenCalled();
});

it('drops an expired hold and pays nothing through it', async () => {
  const f = setup(); f.controller.setVoucher(voucher({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
  await f.controller.requestPayment('wallet');
  expect(f.controller.getState()).toMatchObject({ phase: 'denied', voucher: null });
  expect(f.funded.wallet).not.toHaveBeenCalled();
});

it('ignores a hold made for another order', async () => {
  const f = setup(); f.controller.setVoucher(voucher({ scopeId: 'other-order' }));
  expect(f.controller.getState().voucher).toBeNull();
});

it('confirms funded cash through the hold only when the technician declared the due', async () => {
  const f = setup(); f.controller.setVoucher(voucher()); declared(f, 120000);
  await f.controller.requestCashConfirmation({ agreed: true }); await f.controller.submitConfirmation();
  expect(f.funded.confirmCash).not.toHaveBeenCalled();
  declared(f, 70000); await f.coordinator.loadResource(f.key, 'cash');
  await f.controller.requestCashConfirmation({ agreed: true }); await f.controller.submitConfirmation();
  expect(f.funded.confirmCash).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'order' }, 'hold-1', { agreed: true });
  expect(f.transport.confirmCash).not.toHaveBeenCalled();
});

it('still confirms a pending funded cash declaration after the 15 minutes', async () => {
  const f = setup(); f.controller.setVoucher(voucher({ expiresAt: new Date(Date.now() - 1000).toISOString() })); declared(f, 70000);
  await f.coordinator.loadResource(f.key, 'cash');
  await f.controller.requestCashConfirmation({ agreed: false, disputeReason: 'Tôi trả ít hơn' }); await f.controller.submitConfirmation();
  expect(f.funded.confirmCash).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'order' }, 'hold-1', { agreed: false, disputeReason: 'Tôi trả ít hơn' });
});

it('without a hold nothing changes: the plain routes are used', async () => {
  const f = setup(); await f.controller.requestPayment('wallet'); await f.controller.submitConfirmation();
  expect(f.transport.payWallet).toHaveBeenCalledWith('invoice'); expect(f.funded.wallet).not.toHaveBeenCalled();
});
