import {
  customerWithdrawalApi,
  normalizeCustomerWithdrawalHistory,
  normalizeCustomerWithdrawalInfo,
} from './customer-withdrawal.api';
import apiClient from './client';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const mockedClient = apiClient as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock };
const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'Success', data, ...(meta === undefined ? {} : { meta }) },
});
const account = {
  bankBin: '970436', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '0123456789',
  accountName: 'NGUYEN VAN AN', updatedAt: '2026-10-17T00:00:00.000Z',
};
const withdrawal = {
  id: 'withdrawal-1', amount: 100000, status: 'PROCESSING', bankName: 'Vietcombank',
  bankAccountNumber: '••••6789', bankAccountName: 'NGUYEN VAN AN',
  requestedAt: '2026-10-17T00:00:00.000Z', payoutAttemptedAt: '2026-10-17T00:00:00.000Z',
  payoutBankReference: null, failureReason: null, refundTransactionId: null,
  updatedAt: '2026-10-17T00:00:01.000Z',
};
const info = {
  kycStatus: 'verified', kycRejectionReason: null, hasBankAccount: true, bankAccount: account,
  minimumAmount: 10000, maximumAmount: 200000, payoutAvailable: true,
  openWithdrawal: withdrawal, canWithdraw: false,
};
const page = { data: [withdrawal], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } };

describe('customerWithdrawalApi', () => {
  afterEach(() => jest.resetAllMocks());

  it('normalizes withdrawal info without deriving server rules on the client', () => {
    expect(normalizeCustomerWithdrawalInfo(info)).toMatchObject({ minimumAmount: 10000, maximumAmount: 200000, canWithdraw: false, kycStatus: 'verified' });
    expect(() => normalizeCustomerWithdrawalInfo({ ...info, kycStatus: 'approved' })).toThrow();
    expect(() => normalizeCustomerWithdrawalInfo({ ...info, maximumAmount: '200000' })).toThrow();
  });

  it('loads withdrawal eligibility and rejects invalid amounts before POST', async () => {
    mockedClient.get.mockResolvedValue(envelope(info));
    await expect(customerWithdrawalApi.getInfo()).resolves.toMatchObject({ canWithdraw: false, minimumAmount: 10000, maximumAmount: 200000 });
    expect(mockedClient.get).toHaveBeenCalledWith('/customer/wallet/withdrawal-info');
    for (const amount of [0, -1, 10000.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(customerWithdrawalApi.createWithdrawal(amount)).rejects.toThrow();
    }
    expect(mockedClient.post).not.toHaveBeenCalled();
  });

  it.each(['PROCESSING', 'SUCCESS', 'FAILED'] as const)('preserves the real %s withdrawal status', status => {
    const result = normalizeCustomerWithdrawalHistory({
      data: [{ ...withdrawal, status }], meta: page.meta,
    });
    expect(result.data[0].status).toBe(status);
  });

  it('rejects invented statuses and the wallet-summary pagination shape', () => {
    expect(() => normalizeCustomerWithdrawalHistory({ data: [{ ...withdrawal, status: 'PENDING' }], meta: page.meta })).toThrow();
    expect(() => normalizeCustomerWithdrawalHistory({ transactions: [withdrawal], meta: page.meta })).toThrow();
    expect(() => normalizeCustomerWithdrawalHistory({ data: [withdrawal], meta: { ...page.meta, page: 2 } })).toThrow();
  });

  it('reads data and meta from the top-level HTTP history envelope with page/limit', async () => {
    mockedClient.get.mockResolvedValue(envelope([withdrawal], page.meta));
    await expect(customerWithdrawalApi.getHistory({ page: 1, limit: 20 })).resolves.toEqual(page);
    expect(mockedClient.get).toHaveBeenCalledWith('/customer/wallet/withdrawals', { params: { page: 1, limit: 20 } });
  });

  it('rejects the previous nested history shape and missing top-level metadata', async () => {
    mockedClient.get
      .mockResolvedValueOnce(envelope(page))
      .mockResolvedValueOnce(envelope([withdrawal]));
    await expect(customerWithdrawalApi.getHistory()).rejects.toThrow('Lịch sử rút tiền chưa hợp lệ.');
    await expect(customerWithdrawalApi.getHistory()).rejects.toThrow('Lịch sử rút tiền chưa hợp lệ.');
  });

  it('uses the customer bank and withdrawal routes with their exact DTOs', async () => {
    mockedClient.get
      .mockResolvedValueOnce(envelope([{
        bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
      }]))
      .mockResolvedValueOnce(envelope(account));
    mockedClient.put.mockResolvedValue(envelope(account));
    mockedClient.post.mockResolvedValue(envelope(withdrawal));

    await expect(customerWithdrawalApi.getBanks()).resolves.toHaveLength(1);
    await expect(customerWithdrawalApi.getBankAccount()).resolves.toMatchObject(account);
    await expect(customerWithdrawalApi.saveBankAccount({ bankBin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN AN' })).resolves.toMatchObject(account);
    await expect(customerWithdrawalApi.createWithdrawal(100000)).resolves.toMatchObject({ status: 'PROCESSING' });

    expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/customer/wallet/banks');
    expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/customer/wallet/bank-account');
    expect(mockedClient.put).toHaveBeenCalledWith('/customer/wallet/bank-account', { bankBin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN AN' });
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
    expect(mockedClient.post).toHaveBeenCalledWith('/customer/wallet/withdrawals', { amount: 100000 });
  });
});
