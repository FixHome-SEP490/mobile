import { createOrderPaymentController } from './customer-payment-controller';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import { m6Fixture, deferred, walletSummary } from './m6-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));

function setup() {
  const f = m6Fixture();
  const transport = { payWallet: jest.fn(async () => { f.server.invoice!.paymentStatus = 'paid'; return { paid: true }; }),
    createVnpayUrl: jest.fn(async () => 'https://payments.example.test/start'), confirmCash: jest.fn(async (_id: string, _body: unknown) => undefined),
    confirmNoCharge: jest.fn(async (_id: string) => { f.server.invoice!.paymentStatus = 'paid'; return { paymentStatus: 'paid', settlementMethod: 'NO_CHARGE' }; }),
    readWallet: jest.fn(async () => f.server.wallet), openUrl: jest.fn(async (_url: string) => undefined) };
  const deps = { ...f.runtime, transport };
  return { ...f, transport, deps, controller: createOrderPaymentController(deps) };
}
async function pay(f: ReturnType<typeof setup>, method: 'wallet' | 'vnpay' = 'wallet') {
  await f.controller.requestPayment(method); await f.controller.submitConfirmation();
}
it('customerConfirmed false still allows whole invoice wallet pay, PAID is independent of COMPLETED', async () => {
  const f = setup(); await pay(f);
  expect(f.transport.payWallet).toHaveBeenCalledWith('invoice');
  expect(f.controller.getState()).toMatchObject({ phase: 'resolved', result: 'paid-awaiting-order' });
  expect(f.server.order.status).toBe('UNDER_REPAIR');
  await pay(f); expect(f.transport.payWallet).toHaveBeenCalledTimes(1);
});
it.each([null, '1e5', '120000.5', '9007199254740993'])('invalid invoice %p blocks all three methods', async amount => {
  const f = setup(); f.server.invoice!.grandTotal = amount;
  await pay(f); await pay(f, 'vnpay'); await f.controller.requestPayment('cash');
  expect(f.transport.payWallet).not.toHaveBeenCalled(); expect(f.transport.createVnpayUrl).not.toHaveBeenCalled(); expect(f.transport.confirmCash).not.toHaveBeenCalled();
});
it('insufficient or malformed wallet never sends debit', async () => {
  const f = setup(); f.server.wallet = walletSummary('119999'); await pay(f);
  expect(f.transport.payWallet).not.toHaveBeenCalled();
  f.server.wallet = {}; await pay(f); expect(f.transport.payWallet).not.toHaveBeenCalled();
});
it.each([new Error('offline'), { response: { status: 401 } }, { response: { status: 409 } }, { response: { status: 500 } }])('unknown wallet payment survives cold restart and blocks another method %p', async error => {
  const f = setup(); f.transport.payWallet.mockRejectedValue(error); await pay(f);
  const journal = createOrderCommandJournal(f.storage); const c = createOrderPaymentController({ ...f.deps, journal });
  await c.verify(); await c.requestPayment('vnpay'); await c.submitConfirmation();
  expect(c.getState().phase).toBe('unknown'); expect(f.transport.payWallet).toHaveBeenCalledTimes(1); expect(f.transport.createVnpayUrl).not.toHaveBeenCalled();
  expect(journal.list('customer')[0].status).toBe('unknown');
});
it('structured VALIDATION_FAILED wallet transaction rollback is a known failure even if GET fails', async () => {
  const f = setup(); f.transport.payWallet.mockImplementation(async () => { f.server.failOrder = true;
    throw { response: { status: 422, data: { success: false, statusCode: 422, message: 'Dữ liệu không hợp lệ.', error: { code: 'VALIDATION_FAILED', message: 'Số dư ví không đủ.' } } } }; });
  await pay(f); expect(f.journal.list('customer')[0].status).toBe('failed-known'); expect(f.controller.getState().phase).toBe('failed-known');
  f.server.failOrder = false;
  f.transport.payWallet.mockImplementation(async () => { f.server.invoice!.paymentStatus = 'paid'; return { paid: true }; });
  await f.controller.requestPayment('wallet'); await f.controller.submitConfirmation();
  expect(f.transport.payWallet).toHaveBeenCalledTimes(2); expect(f.controller.getState().phase).toBe('resolved');
});
it.each([[400, { success: false, statusCode: 400, message: 'Dữ liệu không hợp lệ.', error: { code: 'VALIDATION_FAILED', message: 'Số dư ví không đủ.' } }],
  [422, { success: false, statusCode: 422, message: 'Dữ liệu không hợp lệ.', error: { code: 'OTHER_CODE', message: 'Lỗi khác.' } }],
  [422, { success: false, statusCode: 422, message: 'Dữ liệu không hợp lệ.', error: {} }],
  [422, { success: false, statusCode: 422, message: 'Dữ liệu không hợp lệ.' }],
  [422, { success: true, statusCode: 422, message: 'Dữ liệu không hợp lệ.', error: { code: 'VALIDATION_FAILED' } }]])('non-rollback wallet failure %p remains unknown', async (status, data) => {
  const f = setup(); f.transport.payWallet.mockRejectedValue({ response: { status, data } }); await pay(f);
  expect(f.journal.list('customer')[0].status).toBe('unknown'); expect(f.controller.getState().phase).toBe('unknown');
});
it('2xx without PAID GET and success response followed by failed GET remain unknown', async () => {
  const f = setup(); f.transport.payWallet.mockImplementation(async () => ({ paid: true })); await pay(f);
  expect(f.controller.getState().phase).toBe('unknown');
  f.server.invoice!.paymentStatus = 'paid'; f.server.failResource = 'invoice'; await f.controller.verify();
  expect(f.journal.list('customer')[0].status).toBe('unknown');
  f.server.failResource = ''; await f.controller.verify(); expect(f.controller.getState().phase).toBe('resolved');
});
it('VNPay URL creation/opening are separate and opening once cannot initiate another attempt', async () => {
  const f = setup(); await pay(f, 'vnpay'); expect(f.transport.openUrl).not.toHaveBeenCalled();
  await f.controller.openPaymentUrl(); await f.controller.openPaymentUrl(); await pay(f, 'vnpay');
  expect(f.transport.openUrl).toHaveBeenCalledTimes(1); expect(f.transport.createVnpayUrl).toHaveBeenCalledTimes(1);
  expect(f.controller.getState().phase).toBe('pending'); expect([...f.disk.values()].join('')).not.toContain('https');
});
it('browser failure and forged return never authorize PAID or another URL POST', async () => {
  const f = setup(); f.transport.openUrl.mockRejectedValue(Error('browser')); await pay(f, 'vnpay'); await f.controller.openPaymentUrl();
  await f.controller.verify(); await pay(f, 'vnpay'); expect(f.transport.createVnpayUrl).toHaveBeenCalledTimes(1); expect(f.controller.getState().phase).toBe('unknown');
});
it('cancel/amount change/fullsession revoke while durable storage awaits sends no payment', async () => {
  for (const change of ['cancel', 'amount', 'revoke', 'renew'] as const) {
    const f = setup(); await f.controller.requestPayment('wallet');
    const gate = deferred<void>(); f.deferStorage(() => gate.promise);
    const submission = f.controller.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
    if (change === 'cancel') f.controller.cancelConfirmation();
    if (change === 'amount') f.coordinator.getSnapshot()!.resources.invoice = { status: 'ready', requestSeq: 2, fetchedAt: 1000, data: { id: 'invoice', serviceOrderId: 'order', paymentStatus: 'unpaid', grandTotal: '130000' } };
    if (change === 'revoke') f.revoke(); if (change === 'renew') f.renew(); gate.resolve(); await submission;
    expect(f.transport.payWallet).not.toHaveBeenCalled(); expect(f.journal.list('customer')[0].status).toBe('failed-known');
  }
});
it('exact cash declaration uses canonical status, doubletap, mismatch409 readback never fake paid', async () => {
  const f = setup(); f.server.cash = {technicianNotes: null,  id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: '120000', declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', confirmedAmount: null };
  f.transport.confirmCash.mockImplementation(async () => { f.server.cash!.status = 'disputed'; throw { response: { status: 409 } }; });
  await f.controller.requestCashConfirmation({ agreed: false, disputeReason: 'Số tiền chưa đúng' });
  await Promise.all([f.controller.submitConfirmation(), f.controller.submitConfirmation()]);
  expect(f.transport.confirmCash).toHaveBeenCalledTimes(1); expect(f.transport.confirmCash).toHaveBeenCalledWith('order', { agreed: false, disputeReason: 'Số tiền chưa đúng' });
  expect(f.controller.getState()).toMatchObject({ phase: 'resolved', result: 'cash-disputed' }); expect(f.server.invoice!.paymentStatus).toBe('unpaid');
});
it('cash agree cannot send a mismatch or stale settlement; confirmed needs PAID invoice too', async () => {
  const f = setup(); f.server.cash = {declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: 119999 };
  await f.controller.requestCashConfirmation({ agreed: true, confirmedAmount: 120000 }); await f.controller.submitConfirmation(); expect(f.transport.confirmCash).not.toHaveBeenCalled();
  f.server.cash.declaredAmount = 120000;
  await f.controller.requestCashConfirmation({ agreed: true, confirmedAmount: 120000 }); f.server.cash.id = 'replacement';
  await f.coordinator.loadResource(f.key, 'cash'); await f.controller.submitConfirmation(); expect(f.transport.confirmCash).not.toHaveBeenCalled();
});
it('idle+pending recovers only owned payment markers; foreign operations are untouched', async () => {
  const f = setup(); await f.journal.restore(); await f.journal.begin(f.key, { intentId: 'other', entityId: 'order', operation: 'extra-decision' });
  await f.controller.verify(); expect(f.journal.list('customer')[0].status).toBe('submitting'); expect(f.reads).toEqual([]);
});
it('confirmed cash with an UNPAID or unavailable invoice does not resolve the financial lock', async () => {
  const f = setup(); f.server.cash = {declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: '120000', confirmedAmount: null };
  f.transport.confirmCash.mockImplementation(async () => { f.server.cash!.status = 'confirmed'; });
  await f.controller.requestCashConfirmation({ agreed: true, confirmedAmount: 120000 }); await f.controller.submitConfirmation();
  expect(f.controller.getState().phase).toBe('unknown');
  f.server.failResource = 'invoice'; await f.controller.verify(); expect(f.journal.list('customer')[0].status).toBe('unknown');
  f.server.failResource = ''; f.server.invoice!.paymentStatus = 'paid'; await f.controller.verify();
  expect(f.controller.getState()).toMatchObject({ phase: 'resolved', result: 'paid-awaiting-order' });
});
it('cash disputed with an unavailable invoice retains the marker until both facts are fresh', async () => {
  const f = setup(); f.server.cash = {declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: 120000 };
  f.transport.confirmCash.mockImplementation(async () => { f.server.cash!.status = 'disputed'; f.server.failResource = 'invoice'; throw { response: { status: 409 } }; });
  await f.controller.requestCashConfirmation({ agreed: false, disputeReason: 'Kiểm tra số tiền' }); await f.controller.submitConfirmation();
  expect(f.journal.list('customer')[0].status).toBe('unknown');
  f.server.failResource = ''; await f.controller.verify(); expect(f.journal.list('customer')[0].status).toBe('resolved');
});
it('recovery uses the captured invoice ID even when another invoice is paid', async () => {
  const f = setup(); f.transport.payWallet.mockRejectedValue(Error('offline')); await pay(f);
  f.server.invoice!.id = 'replacement-invoice'; f.server.invoice!.paymentStatus = 'paid'; await f.controller.verify();
  expect(f.journal.list('customer')[0].status).toBe('unknown');
});
it('successful cash method selection is navigation only and canonical pending alias is rejected', async () => {
  const f = setup(); await f.controller.requestPayment('cash'); await f.controller.submitConfirmation();
  expect(f.transport.confirmCash).not.toHaveBeenCalled(); expect(f.journal.list('customer')).toEqual([]);
  f.server.cash = {declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', status: 'pending', declaredAmount: 120000 };
  await f.controller.requestCashConfirmation({ agreed: true }); await f.controller.submitConfirmation();
  expect(f.transport.confirmCash).not.toHaveBeenCalled();
});
it('strict whole-VND invoice lines and malformed completion timestamp cannot authorize payment', async () => {
  const f = setup(); f.server.invoice!.items = [{ id: 'line', description: 'Công sửa', quantity: 1, lineTotal: '120000.5' }];
  await pay(f); expect(f.transport.payWallet).not.toHaveBeenCalled();
  delete f.server.invoice!.items; f.server.order.completionRequestedAt = 'malformed';
  await pay(f); expect(f.transport.payWallet).not.toHaveBeenCalled();
});
it('valid zero invoice is not missing money and allows exact zero cash agreement only', async () => {
  const f = setup(); f.server.invoice!.grandTotal = 0; f.server.cash = {declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: 0 };
  f.transport.confirmCash.mockImplementation(async () => { f.server.cash!.status = 'confirmed'; f.server.invoice!.paymentStatus = 'paid'; });
  await f.controller.requestCashConfirmation({ agreed: true, confirmedAmount: 0 }); await f.controller.submitConfirmation();
  expect(f.transport.confirmCash).toHaveBeenCalledWith('order', { agreed: true, confirmedAmount: 0 });
  expect(f.transport.payWallet).not.toHaveBeenCalled(); expect(f.transport.createVnpayUrl).not.toHaveBeenCalled();
});
it('refunded invoice is displayed as refunded and cannot be charged again', async () => {
  const f = setup(); f.server.invoice!.paymentStatus = 'refunded'; await pay(f); expect(f.controller.getState().result).toBe('refunded'); expect(f.transport.payWallet).not.toHaveBeenCalled();
});
it('revoked order cannot release a wallet marker even when another owner readback is PAID', async () => {
  const f = setup(); f.transport.payWallet.mockRejectedValue(Error('timeout')); await pay(f); f.server.invoice!.paymentStatus = 'paid';
  f.coordinator.invalidate(); await f.controller.verify(); expect(f.journal.list('customer')[0].status).toBe('unknown');
});
it('cash redeclaration with same ID/amount but changed actor or timestamp invalidates captured confirmation', async () => {
  for (const field of ['declaredByTechnicianId', 'declaredAt'] as const) {
    const f = setup(); f.server.cash = { id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: 120000,
      declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null };
    await f.controller.requestCashConfirmation({ agreed: true, confirmedAmount: 120000 });
    f.server.cash[field] = field === 'declaredAt' ? '2026-10-14T01:00:00Z' : 'another-tech';
    await f.coordinator.loadResource(f.key, 'cash'); await f.controller.submitConfirmation(); expect(f.transport.confirmCash).not.toHaveBeenCalled();
  }
});
it('missing declaration identity/time does not authorize customer cash confirmation', async () => {
  const f = setup(); f.server.cash = { id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: 120000 };
  await f.controller.requestCashConfirmation({ agreed: true, confirmedAmount: 120000 }); await f.controller.submitConfirmation(); expect(f.transport.confirmCash).not.toHaveBeenCalled();
});

describe('zero invoice (no charge)', () => {
  it('confirms a 0 invoice without touching wallet, VNPay or cash, and refuses every other amount', async () => {
    const f = setup(); f.server.invoice!.grandTotal = '0';
    await f.controller.requestPayment('wallet'); await f.controller.requestPayment('vnpay');
    expect(f.controller.getState().confirmation).toBeNull();
    await f.controller.requestPayment('no_charge'); await f.controller.submitConfirmation();
    expect(f.transport.confirmNoCharge).toHaveBeenCalledWith('invoice');
    expect(f.transport.payWallet).not.toHaveBeenCalled(); expect(f.transport.createVnpayUrl).not.toHaveBeenCalled(); expect(f.transport.confirmCash).not.toHaveBeenCalled();
    expect(f.controller.getState()).toMatchObject({ phase: 'resolved', result: 'paid-awaiting-order' });
    const other = setup();
    await other.controller.requestPayment('no_charge');
    expect(other.controller.getState().confirmation).toBeNull();
    expect(other.transport.confirmNoCharge).not.toHaveBeenCalled();
  });
  it.each(['ORDER_INVALID_TRANSITION', 'EVIDENCE_REQUIRED_AFTER', 'VALIDATION_FAILED', 'CONFLICT'])('%s means nothing was confirmed, so it can be retried', async code => {
    const f = setup(); f.server.invoice!.grandTotal = '0';
    f.transport.confirmNoCharge.mockRejectedValue({ response: { status: 409, data: { success: false, error: { code } } } });
    await f.controller.requestPayment('no_charge'); await f.controller.submitConfirmation();
    expect(f.journal.list('customer')[0].status).toBe('failed-known'); expect(f.controller.getState().phase).toBe('failed-known');
  });
});
