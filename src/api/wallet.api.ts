// src/api/wallet.api.ts
import apiClient from './client';
import type {
  BankAccount,
  BankOption,
  PaginationMeta,
  TopUpResult,
  WalletSummary,
  WalletTransaction,
  WithdrawalDecision,
  WithdrawalRequest,
} from '../types';

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const walletApi = {
  async getMyWallet(): Promise<WalletSummary> {
    return unwrap<WalletSummary>((await apiClient.get('/technician/wallet')).data);
  },

  async getMyTransactions(query?: {
    page?: number;
    limit?: number;
    type?: WalletTransaction['type'];
  }): Promise<PaginatedResult<WalletTransaction>> {
    const res = await apiClient.get<{ data: WalletTransaction[]; meta: PaginationMeta }>(
      '/technician/wallet/transactions',
      { params: query },
    );
    return res.data;
  },

  async topUp(amount: number, idempotencyKey?: string): Promise<TopUpResult> {
    const key =
      idempotencyKey || `TOPUP_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const payload = unwrap<Partial<TopUpResult>>(
      (
        await apiClient.post(
          '/technician/wallet/top-up',
          { amount: Number(amount), idempotencyKey: key },
          { headers: { 'x-client-platform': 'mobile' } },
        )
      ).data,
    );
    // Only a VNPay link means a payment was started; the balance never moves
    // here, so nothing in this answer may read as "credited".
    return {
      success: Boolean(payload.paymentUrl),
      paymentId: payload.paymentId ?? '',
      paymentUrl: payload.paymentUrl ?? null,
      balanceAfter:
        payload.balanceAfter !== undefined && payload.balanceAfter !== null
          ? Number(payload.balanceAfter)
          : null,
      message: payload.message ?? '',
    };
  },

  async listBanks(): Promise<BankOption[]> {
    return unwrap<BankOption[]>((await apiClient.get('/technician/wallet/banks')).data);
  },

  /** Null until the technician has saved one. */
  async getMyBankAccount(): Promise<BankAccount | null> {
    const res = await apiClient.get<{ data: BankAccount | null }>(
      '/technician/wallet/bank-account',
    );
    return res.data?.data ?? null;
  },

  async saveMyBankAccount(dto: {
    bankBin: string;
    accountNumber: string;
    accountName: string;
  }): Promise<BankAccount> {
    return unwrap<BankAccount>(
      (await apiClient.put('/technician/wallet/bank-account', dto)).data,
    );
  },

  /**
   * Withdraw and pay out at once, with no approval step; resolves with where
   * the payout ended up. Only the amount travels: the money always goes to the
   * saved account, which is the one the server checked against the KYC name.
   */
  async requestWithdrawal(amount: number): Promise<WithdrawalDecision> {
    return unwrap<WithdrawalDecision>(
      (await apiClient.post('/technician/wallet/withdrawals', { amount })).data,
    );
  },

  async getMyWithdrawals(query?: {
    page?: number;
    limit?: number;
    status?: WithdrawalRequest['status'];
  }): Promise<PaginatedResult<WithdrawalRequest>> {
    const res = await apiClient.get<{ data: WithdrawalRequest[]; meta: PaginationMeta }>(
      '/technician/wallet/withdrawals',
      { params: query },
    );
    return res.data;
  },
};
