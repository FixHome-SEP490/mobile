// src/types/wallet.types.ts
export interface WalletSummary {
  id: string;
  technicianId: string;
  balance: number;
  pendingWithdrawal: number;
  minimumBalance: number;
  availableBalance: number;
  withdrawableBalance: number;
  eligibleForJobs: boolean;
}

export type WalletTxType =
  | 'TOP_UP'
  | 'WITHDRAW'
  | 'ONLINE_EARNING'
  | 'PLATFORM_FEE'
  | 'ADJUSTMENT';

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: WalletTxType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdAt: string;
}

export type WithdrawalReqStatus = 'PENDING' | 'SUCCESS' | 'REJECTED' | 'FAILED';

export interface WithdrawalRequest {
  id: string;
  walletId: string;
  technicianId: string;
  amount: number;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  status: WithdrawalReqStatus;
  requestedAt: string;
  processedAt?: string | null;
  rejectReason?: string | null;
}

export interface TopUpResult {
  success: boolean;
  paymentId: string;
  balanceAfter: number | null;
  paymentUrl?: string | null;
  message: string;
}
