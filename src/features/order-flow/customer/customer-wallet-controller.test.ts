import { createCustomerWalletController } from './customer-wallet-controller';
import { createWalletTopUpJournal } from './wallet-top-up-journal';
import { deferred, walletSummary } from './m6-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup() {
  let owner: { userId: string; role: 'customer'; sessionGeneration: number } | null = { userId: 'customer', role: 'customer', sessionGeneration: 1 };
  const disk = new Map<string, string>(); let gate: (() => Promise<void>) | undefined;
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { await gate?.(); disk.set(key, value); } };
  const journal = createWalletTopUpJournal(storage); let summary: unknown = walletSummary(0); let active = true;
  const transport = { readSummary: jest.fn(async (_page: number) => summary),
    topUp: jest.fn(async (_dto: unknown) => ({ paymentId: 'payment', paymentUrl: 'https://payments.example.test/start' })), openUrl: jest.fn(async (_url: string) => {}) };
  const deps = { journal, transport, getOwner: () => owner, isActive: () => active, newKey: () => 'stable_key', now: () => 1000 };
  return { c: createCustomerWalletController(deps), deps, journal, disk, storage, transport,
    summary: (value: unknown) => { summary = value; }, pause: () => { active = false; },
    renew: () => { owner = { userId: 'customer', role: 'customer', sessionGeneration: 2 }; }, revoke: () => { owner = null; },
    storageGate: (value: () => Promise<void>) => { gate = value; } };
}
const tx = (referenceId = 'payment') => ({ id: 'tx', type: 'top_up', amount: '10000', balanceAfter: '10000', description: null, referenceType: 'PAYMENT', referenceId, createdAt: '2026-10-14T00:00:00Z' });
async function initiate(f: ReturnType<typeof setup>, amount = 10000) { await f.c.requestTopUp(amount); await f.c.submitConfirmation(); }
it.each([9999, 50000001, 10000.1, NaN])('top-up invalid bound %p never dispatches', async amount => {
  const f = setup(); await initiate(f, amount); expect(f.transport.topUp).not.toHaveBeenCalled();
});
it('freezes key+amount; opening once is separate, pending blocks changed amount without auto pay', async () => {
  const f = setup(); await initiate(f); expect(f.transport.topUp).toHaveBeenCalledWith({ amount: 10000, idempotencyKey: 'stable_key' });
  expect(f.transport.openUrl).not.toHaveBeenCalled(); await f.c.openPaymentUrl(); await f.c.openPaymentUrl(); await initiate(f, 20000);
  expect(f.transport.topUp).toHaveBeenCalledTimes(1); expect(f.transport.openUrl).toHaveBeenCalledTimes(1);
  const stored = [...f.disk.values()].join(''); expect(stored).toContain('payment'); expect(stored).not.toContain('https'); expect(stored).not.toContain('amount');
});
it('cold GET recovery needs exact payment ledger, never another concurrent credit or balance increase', async () => {
  const f = setup(); await initiate(f); f.summary(walletSummary(50000, [tx('unrelated')]));
  const c = createCustomerWalletController({ ...f.deps, journal: createWalletTopUpJournal(f.storage) });
  await c.verify(); expect(c.getState().phase).toBe('unknown'); await c.requestTopUp(20000); await c.submitConfirmation(); expect(f.transport.topUp).toHaveBeenCalledTimes(1);
  f.summary(walletSummary(10000, [tx()])); await c.verify(); expect(c.getState().phase).toBe('resolved');
});
it('lost response cannot resolve by amount/time/ledger without paymentId and cannot replay', async () => {
  const f = setup(); f.transport.topUp.mockRejectedValue(Error('timeout')); await initiate(f);
  f.summary(walletSummary(10000, [tx()])); await f.c.verify(); await initiate(f);
  expect(f.c.getState().phase).toBe('unknown'); expect(f.transport.topUp).toHaveBeenCalledTimes(1);
});
it('known payment ID without a usable URL is retained for exact ledger recovery', async () => {
  const f = setup(); f.transport.topUp.mockResolvedValue({ paymentId: 'payment', paymentUrl: 'http://unsafe.example.test' }); await initiate(f);
  expect(f.c.getState()).toMatchObject({ phase: 'unknown', urlReady: false }); await f.c.openPaymentUrl(); expect(f.transport.openUrl).not.toHaveBeenCalled();
  f.summary(walletSummary(10000, [tx()])); await f.c.verify(); expect(f.c.getState().phase).toBe('resolved');
});
it('browser failure and untrusted success link only trigger GET, not credit', async () => {
  const f = setup(); f.transport.openUrl.mockRejectedValue(Error('browser')); await initiate(f); await f.c.openPaymentUrl();
  await f.c.handleReturn('fixhome://app/wallet?payment=success&amount=50000000&paymentId=forged');
  expect(f.c.getState().phase).toBe('unknown'); expect(f.transport.topUp).toHaveBeenCalledTimes(1); expect(f.c.getState().summary.status).toBe('ready');
});
it.each(['cancel', 'renew', 'revoke', 'blur'])('top-up storage await %s sends no POST', async action => {
  const f = setup(); await f.c.requestTopUp(10000); const gate = deferred<void>(); f.storageGate(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
  if (action === 'cancel') f.c.cancelConfirmation(); if (action === 'renew') f.renew(); if (action === 'revoke') f.revoke(); if (action === 'blur') f.pause();
  gate.resolve(); await pending; expect(f.transport.topUp).not.toHaveBeenCalled();
  if (action === 'cancel') expect(f.c.getState().phase).toBe('failed-known');
});
it('two controllers share durable reservation and malformed storage fails closed', async () => {
  const f = setup(), other = createCustomerWalletController(f.deps); await f.c.requestTopUp(10000); await other.requestTopUp(10000);
  await Promise.all([f.c.submitConfirmation(), other.submitConfirmation()]); expect(f.transport.topUp).toHaveBeenCalledTimes(1);
  const bad = createWalletTopUpJournal({ getItem: async () => '{broken', setItem: async () => {} });
  const c = createCustomerWalletController({ ...f.deps, journal: bad }); await c.requestTopUp(10000); await c.submitConfirmation(); expect(f.transport.topUp).toHaveBeenCalledTimes(1);
});
it('stale wallet GET cannot replace renewed session and a failed GET is unavailable, never zero', async () => {
  const f = setup(), gate = deferred<unknown>(); f.transport.readSummary.mockImplementation(() => gate.promise);
  const pending = f.c.refresh(); f.renew(); gate.resolve(walletSummary(99999)); await pending; expect(f.c.getState().summary.status).not.toBe('ready');
  const error = setup(); error.transport.readSummary.mockRejectedValue(Error('offline')); await error.c.refresh(); expect(error.c.getState().summary.status).toBe('error');
});
