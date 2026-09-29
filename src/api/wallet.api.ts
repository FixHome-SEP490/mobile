// src/api/wallet.api.ts
import apiClient from './client';
import type {
  PaginationMeta,
  TopUpResult,
  WalletSummary,
  WalletTransaction,
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
    return {
      success: true,
      paymentId: payload.paymentId ?? '',
      paymentUrl: payload.paymentUrl ?? null,
      balanceAfter:
        payload.balanceAfter !== undefined && payload.balanceAfter !== null
          ? Number(payload.balanceAfter)
          : null,
      message: payload.message ?? 'Nạp tiền vào ví thành công',
    };
  },

  async requestWithdrawal(dto: {
    amount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  }): Promise<WithdrawalRequest> {
    return unwrap<WithdrawalRequest>(
      (await apiClient.post('/technician/wallet/withdrawals', dto)).data,
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
