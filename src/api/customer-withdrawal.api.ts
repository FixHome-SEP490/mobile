import { wholeVnd } from './customer-wallet.api';
import apiClient from './client';

export type CustomerWithdrawalStatus = 'PROCESSING' | 'SUCCESS' | 'FAILED';
export type CustomerWithdrawalKycStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface CustomerBankOption {
  bin: string;
  code: string;
  shortName: string;
  name: string;
}

export interface CustomerBankAccount {
  bankBin: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  updatedAt: string;
}

export interface CustomerWithdrawal {
  id: string;
  amount: number | string;
  status: CustomerWithdrawalStatus;
  bankName: string;
  bankAccountNumber: string | null;
  bankAccountName: string;
  requestedAt: string;
  payoutAttemptedAt: string | null;
  payoutBankReference: string | null;
  failureReason: string | null;
  refundTransactionId: string | null;
  updatedAt: string;
}

export interface CustomerWithdrawalInfo {
  kycStatus: CustomerWithdrawalKycStatus;
  kycRejectionReason: string | null;
  hasBankAccount: boolean;
  bankAccount: CustomerBankAccount | null;
  minimumAmount: number;
  maximumAmount: number;
  payoutAvailable: boolean;
  openWithdrawal: CustomerWithdrawal | null;
  canWithdraw: boolean;
}

export interface CustomerWithdrawalHistory {
  data: CustomerWithdrawal[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SaveCustomerBankAccountDto {
  bankBin: string;
  accountNumber: string;
  accountName: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrap(value: unknown): unknown {
  const envelope = record(value);
  if (!envelope || envelope.success !== true || typeof envelope.statusCode !== 'number'
    || !Number.isInteger(envelope.statusCode) || envelope.statusCode < 200 || envelope.statusCode >= 300
    || typeof envelope.message !== 'string' || !('data' in envelope)) {
    throw new Error('Dữ liệu rút tiền chưa xác định.');
  }
  return envelope.data;
}

function withdrawalHistoryPayload(value: unknown): { data: unknown[]; meta: Record<string, unknown> } {
  const envelope = record(value);
  if (!envelope || envelope.success !== true || typeof envelope.statusCode !== 'number'
    || !Number.isInteger(envelope.statusCode) || envelope.statusCode < 200 || envelope.statusCode >= 300
    || typeof envelope.message !== 'string' || !Array.isArray(envelope.data) || !record(envelope.meta)) {
    throw new Error('Lịch sử rút tiền chưa hợp lệ.');
  }
  return { data: envelope.data, meta: envelope.meta as Record<string, unknown> };
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Dữ liệu rút tiền ${field} chưa hợp lệ.`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`Dữ liệu rút tiền ${field} chưa hợp lệ.`);
  return value;
}

function safeVndNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validDate(value: unknown, field: string, nullable = false): string | null {
  if (value == null && nullable) return null;
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Dữ liệu rút tiền ${field} chưa hợp lệ.`);
  }
  return value;
}

export function normalizeCustomerBankAccount(value: unknown): CustomerBankAccount | null {
  if (value == null) return null;
  const row = record(value);
  if (!row || typeof row.bankBin !== 'string' || !/^\d{6}$/.test(row.bankBin)
    || typeof row.bankCode !== 'string' || !row.bankCode
    || typeof row.bankName !== 'string' || !row.bankName
    || typeof row.accountNumber !== 'string' || !/^\d{6,19}$/.test(row.accountNumber)
    || typeof row.accountName !== 'string' || !row.accountName.trim() || row.accountName.length > 128) {
    throw new Error('Thông tin tài khoản ngân hàng chưa hợp lệ.');
  }
  return {
    bankBin: row.bankBin,
    bankCode: row.bankCode,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    accountName: row.accountName,
    updatedAt: validDate(row.updatedAt, 'ngày cập nhật') as string,
  };
}

function normalizeWithdrawal(value: unknown): CustomerWithdrawal {
  const row = record(value);
  const amount = wholeVnd(row?.amount);
  const status = row?.status;
  if (!row || typeof row.id !== 'string' || !row.id || amount === null || amount <= 0
    || !['PROCESSING', 'SUCCESS', 'FAILED'].includes(String(status))) {
    throw new Error('Dữ liệu lệnh rút tiền chưa hợp lệ.');
  }
  const maskedNumber = nullableString(row.bankAccountNumber, 'tài khoản nhận');
  if (maskedNumber !== null && !/^.{0,64}\d{4}$/.test(maskedNumber)) {
    throw new Error('Dữ liệu tài khoản nhận chưa hợp lệ.');
  }
  return {
    id: row.id,
    amount: row.amount as number | string,
    status: status as CustomerWithdrawalStatus,
    bankName: nonEmpty(row.bankName, 'ngân hàng'),
    bankAccountNumber: maskedNumber,
    bankAccountName: nonEmpty(row.bankAccountName, 'chủ tài khoản'),
    requestedAt: validDate(row.requestedAt, 'thời điểm tạo') as string,
    payoutAttemptedAt: validDate(row.payoutAttemptedAt, 'thời điểm chuyển', true),
    payoutBankReference: nullableString(row.payoutBankReference, 'mã ngân hàng'),
    failureReason: nullableString(row.failureReason, 'lý do thất bại'),
    refundTransactionId: nullableString(row.refundTransactionId, 'giao dịch hoàn tiền'),
    updatedAt: validDate(row.updatedAt, 'thời điểm cập nhật') as string,
  };
}

export function normalizeCustomerWithdrawalInfo(value: unknown): CustomerWithdrawalInfo {
  const row = record(value);
  const account = normalizeCustomerBankAccount(row?.bankAccount);
  const minimumAmount = safeVndNumber(row?.minimumAmount);
  const maximumAmount = safeVndNumber(row?.maximumAmount);
  if (!row || !['none', 'pending', 'verified', 'rejected'].includes(String(row.kycStatus))
    || typeof row.hasBankAccount !== 'boolean' || row.hasBankAccount !== !!account
    || minimumAmount === null || minimumAmount <= 0 || maximumAmount === null
    || typeof row.payoutAvailable !== 'boolean' || typeof row.canWithdraw !== 'boolean') {
    throw new Error('Điều kiện rút tiền từ Backend chưa hợp lệ.');
  }
  const openWithdrawal = row.openWithdrawal == null ? null : normalizeWithdrawal(row.openWithdrawal);
  const canWithdraw = row.canWithdraw;
  if (canWithdraw && (row.kycStatus !== 'verified' || !account || !row.payoutAvailable
    || !!openWithdrawal || maximumAmount < minimumAmount)) {
    throw new Error('Điều kiện rút tiền từ Backend mâu thuẫn.');
  }
  return {
    kycStatus: row.kycStatus as CustomerWithdrawalKycStatus,
    kycRejectionReason: nullableString(row.kycRejectionReason, 'lý do KYC'),
    hasBankAccount: row.hasBankAccount,
    bankAccount: account,
    minimumAmount,
    maximumAmount,
    payoutAvailable: row.payoutAvailable,
    openWithdrawal,
    canWithdraw,
  };
}

export function normalizeCustomerWithdrawalHistory(value: unknown): CustomerWithdrawalHistory {
  const row = record(value);
  const meta = record(row?.meta);
  if (!row || !Array.isArray(row.data) || !meta
    || ![meta.page, meta.limit, meta.total, meta.totalPages].every(item => typeof item === 'number' && Number.isSafeInteger(item))
    || Number(meta.page) < 1 || Number(meta.limit) < 1 || Number(meta.limit) > 100
    || Number(meta.total) < 0 || Number(meta.totalPages) !== Math.ceil(Number(meta.total) / Number(meta.limit))
    || row.data.length > Number(meta.limit)) {
    throw new Error('Lịch sử rút tiền chưa hợp lệ.');
  }
  const data = row.data.map(normalizeWithdrawal);
  const expectedLength = Math.min(Number(meta.limit), Math.max(0, Number(meta.total) - (Number(meta.page) - 1) * Number(meta.limit)));
  if (data.length !== expectedLength || new Set(data.map(item => item.id)).size !== data.length) {
    throw new Error('Phân trang lịch sử rút tiền chưa hợp lệ.');
  }
  return { data, meta: meta as CustomerWithdrawalHistory['meta'] };
}

function normalizeBankOptions(value: unknown): CustomerBankOption[] {
  if (!Array.isArray(value)) throw new Error('Danh sách ngân hàng chưa hợp lệ.');
  const banks = value.map(item => {
    const bank = record(item);
    if (!bank || typeof bank.bin !== 'string' || !/^\d{6}$/.test(bank.bin)) throw new Error('Ngân hàng chưa được hỗ trợ.');
    return {
      bin: bank.bin,
      code: nonEmpty(bank.code, 'mã ngân hàng'),
      shortName: nonEmpty(bank.shortName, 'tên ngân hàng'),
      name: nonEmpty(bank.name, 'tên đầy đủ ngân hàng'),
    };
  });
  if (new Set(banks.map(bank => bank.bin)).size !== banks.length) throw new Error('Danh sách ngân hàng bị trùng.');
  return banks;
}

function validateBankAccount(dto: SaveCustomerBankAccountDto): SaveCustomerBankAccountDto {
  if (!/^\d{6}$/.test(dto.bankBin) || !/^\d{6,19}$/.test(dto.accountNumber)
    || typeof dto.accountName !== 'string' || !dto.accountName.trim() || dto.accountName.trim().length > 128) {
    throw new Error('Kiểm tra lại ngân hàng, số tài khoản và tên chủ tài khoản.');
  }
  return { bankBin: dto.bankBin, accountNumber: dto.accountNumber, accountName: dto.accountName.trim() };
}

export const customerWithdrawalApi = {
  async getInfo(): Promise<CustomerWithdrawalInfo> {
    return normalizeCustomerWithdrawalInfo(unwrap((await apiClient.get('/customer/wallet/withdrawal-info')).data));
  },

  async getBanks(): Promise<CustomerBankOption[]> {
    return normalizeBankOptions(unwrap((await apiClient.get('/customer/wallet/banks')).data));
  },

  async getBankAccount(): Promise<CustomerBankAccount | null> {
    return normalizeCustomerBankAccount(unwrap((await apiClient.get('/customer/wallet/bank-account')).data));
  },

  async saveBankAccount(input: SaveCustomerBankAccountDto): Promise<CustomerBankAccount> {
    const dto = validateBankAccount(input);
    const account = normalizeCustomerBankAccount(unwrap((await apiClient.put('/customer/wallet/bank-account', dto)).data));
    if (!account) throw new Error('Chưa nhận được thông tin tài khoản ngân hàng.');
    return account;
  },

  async createWithdrawal(amount: number): Promise<CustomerWithdrawal> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Số tiền rút không hợp lệ.');
    return normalizeWithdrawal(unwrap((await apiClient.post('/customer/wallet/withdrawals', { amount })).data));
  },

  async getHistory({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}): Promise<CustomerWithdrawalHistory> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Trang lịch sử rút tiền không hợp lệ.');
    }
    const response = await apiClient.get('/customer/wallet/withdrawals', { params: { page, limit } });
    const history = normalizeCustomerWithdrawalHistory(withdrawalHistoryPayload(response.data));
    if (history.meta.page !== page || history.meta.limit !== limit) throw new Error('Backend trả sai trang lịch sử rút tiền.');
    return history;
  },
};
