import apiClient from './client';
import { customerWalletApi, normalizeCustomerWalletSummary } from './customer-wallet.api';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const client = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
const empty = { balance: 0, transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
const http = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'Success', data } });
beforeEach(() => jest.resetAllMocks());
it('unwraps the actual global HTTP envelope, retaining inner wallet pagination and string money', async () => {
  client.get.mockResolvedValue(http({ ...empty, balance: '120000', meta: { ...empty.meta, page: 2 } }));
  expect(await customerWalletApi.getSummary({ page: 2, pageSize: 20 })).toEqual({ ...empty, balance: '120000', meta: { ...empty.meta, page: 2 } });
  expect(client.get).toHaveBeenCalledWith('/customer/wallet', { params: { page: 2, pageSize: 20 } });
});
it('wallet pagination must match the requested page and size', async () => {
  client.get.mockResolvedValue(http({ ...empty, balance: 120000 }));
  await expect(customerWalletApi.getSummary({ page: 2 })).rejects.toThrow();
  await expect(customerWalletApi.getSummary({ pageSize: 10 })).rejects.toThrow();
});
it('no-wallet Backend sentinel legitimately returns page1/zero for an arbitrary requested page', async () => {
  client.get.mockResolvedValue(http(empty)); expect(await customerWalletApi.getSummary({ page: 2 })).toEqual(empty);
});
it.each([null, {}, { success: false, statusCode: 200, message: 'Success', data: empty },
  { success: true, statusCode: 500, message: 'Success', data: empty }, { success: true, statusCode: 200, message: 'Success', data: {} }, empty])('rejects malformed/failed HTTP summary %p without zero fallback', async data => {
  client.get.mockResolvedValue({ data }); await expect(customerWalletApi.getSummary()).rejects.toThrow();
});
it.each([null, {}, { data: empty }, { ...empty, balance: null }, { ...empty, balance: '1e5' }, { ...empty, balance: '9007199254740993' }, { ...empty, transactions: null }, { ...empty, meta: { ...empty.meta, total: 5 } }])('rejects unavailable/malformed summary instead of zero %p', value => {
  expect(() => normalizeCustomerWalletSummary(value)).toThrow();
});
it('requires exact valid ledger fields and retains correlation', () => {
  const row = { id: 'tx', type: 'top_up', amount: '10000', balanceAfter: '10000', description: null, referenceType: 'PAYMENT', referenceId: 'payment', createdAt: '2026-10-14T00:00:00Z' };
  expect(normalizeCustomerWalletSummary({ balance: '10000', transactions: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }).transactions).toEqual([row]);
  expect(() => normalizeCustomerWalletSummary({ balance: 10000, transactions: [{ ...row, amount: undefined }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } })).toThrow();
  expect(() => normalizeCustomerWalletSummary({ balance: 10000, transactions: [{ ...row, type: 'chargeback' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } })).toThrow();
  for (const amount of [0, '0', -10000, '-10000']) {
    expect(() => normalizeCustomerWalletSummary({ balance: 10000, transactions: [{ ...row, amount }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } })).toThrow();
  }
});
it.each(['top_up', 'invoice_payment', 'refund', 'adjustment_credit', 'adjustment_debit', 'withdrawal', 'withdrawal_refund'] as const)('accepts zero balanceAfter for %s while rejecting negative or malformed balances', type => {
  const row = { id: `tx-${type}`, type, amount: '10000', balanceAfter: '10000', description: null, referenceType: 'WITHDRAWAL', referenceId: 'withdrawal-1', createdAt: '2026-10-14T00:00:00Z' };
  const summary = (transaction: typeof row) => ({ balance: 0, transactions: [transaction], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
  expect(normalizeCustomerWalletSummary(summary({ ...row, balanceAfter: 0 as unknown as string })).transactions[0].balanceAfter).toBe(0);
  expect(normalizeCustomerWalletSummary(summary({ ...row, balanceAfter: '0' })).transactions[0].balanceAfter).toBe('0');
  for (const balanceAfter of [-1, '-1', null, 1.5, '10000.5', 'not-money', NaN, Infinity]) {
    expect(() => normalizeCustomerWalletSummary(summary({ ...row, balanceAfter: balanceAfter as string }))).toThrow();
  }
  expect(normalizeCustomerWalletSummary({ balance: 0, transactions: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }).transactions).toEqual([row]);
  expect(() => normalizeCustomerWalletSummary({ balance: 0, transactions: [{ ...row, amount: '10000.5' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } })).toThrow();
});
it('sends only the top-up DTO and mobile header, wallet pay has no amount/key body', async () => {
  client.post.mockResolvedValue(http({ paymentId: 'payment', paymentUrl: 'https://payments.example.test/start' }));
  expect(await customerWalletApi.topUp({ amount: 10000, idempotencyKey: 'stable_key' })).toEqual({ paymentId: 'payment', paymentUrl: 'https://payments.example.test/start' });
  expect(client.post).toHaveBeenCalledWith('/customer/wallet/top-up', { amount: 10000, idempotencyKey: 'stable_key' }, { headers: { 'x-client-platform': 'mobile' } });
  await ordersApi.payInvoiceWithWallet('invoice');
  expect(client.post).toHaveBeenLastCalledWith('/invoices/invoice/pay-with-wallet');
});
it.each([0, 9999, 50000001, 10000.5, NaN])('rejects invalid top-up %p before transport', async amount => {
  await expect(customerWalletApi.topUp({ amount, idempotencyKey: 'stable_key' })).rejects.toThrow();
  expect(client.post).not.toHaveBeenCalled();
});
it('rejects invalid key/page and preserves known payment ID without an unsafe URL, never credits from POST', async () => {
  await expect(customerWalletApi.topUp({ amount: 10000, idempotencyKey: 'bad:key' })).rejects.toThrow();
  await expect(customerWalletApi.getSummary({ page: 0, pageSize: 101 })).rejects.toThrow();
  client.post.mockResolvedValue(http({ paymentId: 'payment', balanceAfter: 10000 }));
  await expect(customerWalletApi.topUp({ amount: 10000, idempotencyKey: 'stable_key' })).resolves.toEqual({ paymentId: 'payment', paymentUrl: null });
  client.post.mockResolvedValue(http({ paymentId: 'bad/id', paymentUrl: 'https://payments.example.test/start' }));
  await expect(customerWalletApi.topUp({ amount: 10000, idempotencyKey: 'stable_key' })).rejects.toThrow();
});
