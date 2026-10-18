import { findNewCustomerWithdrawal } from './customer-withdrawal.workflow';
import type { CustomerWithdrawal, CustomerWithdrawalHistory, CustomerWithdrawalInfo } from '../../api/customer-withdrawal.api';

const row: CustomerWithdrawal = {
  id: 'new-id', amount: 100000, status: 'PROCESSING', bankName: 'Vietcombank',
  bankAccountNumber: '••••6789', bankAccountName: 'NGUYEN VAN AN',
  requestedAt: '2026-10-17T00:00:00Z', payoutAttemptedAt: null,
  payoutBankReference: null, failureReason: null, refundTransactionId: null,
  updatedAt: '2026-10-17T00:00:00Z',
};
const history: CustomerWithdrawalHistory = { data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } };
const info: CustomerWithdrawalInfo = {
  kycStatus: 'verified', kycRejectionReason: null, hasBankAccount: true,
  bankAccount: { bankBin: '970436', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '0123456789', accountName: 'NGUYEN VAN AN', updatedAt: '2026-10-17T00:00:00Z' },
  minimumAmount: 10000, maximumAmount: 200000, payoutAvailable: true, openWithdrawal: row, canWithdraw: false,
};

describe('withdrawal acknowledgement reconciliation', () => {
  it('accepts one new server record matching the exact amount and saved bank account', () => {
    expect(findNewCustomerWithdrawal({ history, info, previousIds: [], amount: 100000 })).toEqual(row);
  });

  it('does not infer an acknowledgement from an old ID or a different amount/account', () => {
    expect(findNewCustomerWithdrawal({ history, info, previousIds: ['new-id'], amount: 100000 })).toBeNull();
    expect(findNewCustomerWithdrawal({ history, info: { ...info, openWithdrawal: null }, previousIds: [], amount: 200000 })).toBeNull();
    expect(findNewCustomerWithdrawal({ history, info: { ...info, bankAccount: { ...info.bankAccount!, accountNumber: '0000000000' } }, previousIds: [], amount: 100000 })).toBeNull();
  });

  it('keeps an ambiguous set of distinct new matching records unresolved', () => {
    const second = { ...row, id: 'other-id' };
    const result = findNewCustomerWithdrawal({
      history: { ...history, data: [row, second], meta: { page: 1, limit: 20, total: 2, totalPages: 1 } },
      info: { ...info, openWithdrawal: null }, previousIds: [], amount: 100000,
    });
    expect(result).toBeNull();
  });
});
