import apiClient from './client';

export type WalletMoney = number | string;
export interface CustomerWalletTransaction {
  id: string;
  type: 'top_up' | 'invoice_payment' | 'refund' | 'adjustment_credit' | 'adjustment_debit';
  amount: WalletMoney;
  balanceAfter: WalletMoney;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}
export interface CustomerWalletSummary {
  balance: WalletMoney;
  transactions: CustomerWalletTransaction[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface CustomerTopUpDto { amount: number; idempotencyKey: string }
export interface CustomerTopUpResponse { paymentId: string; paymentUrl: string | null }
export function financialRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
/** Pinned global TransformInterceptor wraps the controller's direct inner DTO. */
function walletHttpDto(value: unknown): unknown {
  const envelope = financialRecord(value);
  if (!envelope || envelope.success !== true || typeof envelope.statusCode !== 'number' || !Number.isInteger(envelope.statusCode)
    || envelope.statusCode < 200 || envelope.statusCode >= 300 || typeof envelope.message !== 'string' || !('data' in envelope)) throw Error('Dữ liệu ví chưa xác định.');
  return envelope.data;
}
/** Whole VND only, no exponent/coercion/rounding, retain the original wire value for display. */
export function wholeVnd(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.0+)?$/.test(value))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
export function paymentHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? value : null; }
  catch { return null; }
}
export function validateCustomerTopUp(dto: CustomerTopUpDto): CustomerTopUpDto {
  if (!Number.isSafeInteger(dto.amount) || dto.amount < 10000 || dto.amount > 50000000
    || typeof dto.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(dto.idempotencyKey)) throw Error('Số tiền hoặc thông tin nạp ví không hợp lệ.');
  return { amount: dto.amount, idempotencyKey: dto.idempotencyKey };
}
export function normalizeCustomerWalletSummary(value: unknown): CustomerWalletSummary {
  const row = financialRecord(value), meta = financialRecord(row?.meta);
  if (!row || wholeVnd(row.balance) === null || !Array.isArray(row.transactions) || !meta
    || ![meta.page, meta.limit, meta.total, meta.totalPages].every(v => typeof v === 'number' && Number.isSafeInteger(v))
    || Number(meta.page) < 1 || Number(meta.limit) < 1 || Number(meta.limit) > 100 || Number(meta.total) < 0
    || meta.totalPages !== Math.ceil(Number(meta.total) / Number(meta.limit)) || row.transactions.length > Number(meta.limit)) throw Error('Dữ liệu ví chưa xác định.');
  const transactions = row.transactions.map(value => {
    const tx = financialRecord(value);
    if (!tx || typeof tx.id !== 'string' || !tx.id || typeof tx.type !== 'string' || !['top_up', 'invoice_payment', 'refund', 'adjustment_credit', 'adjustment_debit'].includes(tx.type)
      || wholeVnd(tx.amount) === null || wholeVnd(tx.amount) === 0 || wholeVnd(tx.balanceAfter) === null
      || !['description', 'referenceType', 'referenceId'].every(k => tx[k] === null || typeof tx[k] === 'string')
      || typeof tx.createdAt !== 'string' || !Number.isFinite(Date.parse(tx.createdAt))) throw Error('Dữ liệu giao dịch chưa xác định.');
    return { id: tx.id, type: tx.type, amount: tx.amount, balanceAfter: tx.balanceAfter,
      description: tx.description, referenceType: tx.referenceType, referenceId: tx.referenceId, createdAt: tx.createdAt } as CustomerWalletTransaction;
  });
  const expected = Math.min(Number(meta.limit), Math.max(0, Number(meta.total) - (Number(meta.page) - 1) * Number(meta.limit)));
  if (transactions.length !== expected || new Set(transactions.map(tx => tx.id)).size !== transactions.length) throw Error('Danh sách giao dịch chưa xác định.');
  return { balance: row.balance as WalletMoney, transactions, meta: meta as CustomerWalletSummary['meta'] };
}
export const customerWalletApi = {
  async getSummary({ page = 1, pageSize = 20 }: { page?: number; pageSize?: number } = {}): Promise<CustomerWalletSummary> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw Error('Trang giao dịch không hợp lệ.');
    const summary = normalizeCustomerWalletSummary(walletHttpDto((await apiClient.get('/customer/wallet', { params: { page, pageSize } })).data));
    // CustomerWalletService's no-wallet response uses page1 even when page>1.
    const emptySentinel = summary.meta.page === 1 && summary.meta.total === 0 && wholeVnd(summary.balance) === 0 && summary.transactions.length === 0;
    if ((!emptySentinel && summary.meta.page !== page) || summary.meta.limit !== pageSize) throw Error('Trang giao dịch chưa xác định.');
    return summary;
  },
  async topUp(input: CustomerTopUpDto): Promise<CustomerTopUpResponse> {
    const dto = validateCustomerTopUp(input);
    const row = financialRecord(walletHttpDto((await apiClient.post('/customer/wallet/top-up', dto, { headers: { 'x-client-platform': 'mobile' } })).data));
    const url = paymentHttpsUrl(row?.paymentUrl);
    if (!row || typeof row.paymentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.paymentId)) throw Error('Chưa nhận được thông tin thanh toán hợp lệ.');
    return { paymentId: row.paymentId, paymentUrl: url };
  },
};
