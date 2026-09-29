// src/types/wallet.types.ts
export interface WalletSummary {
  id: string;
  technicianId: string;
  balance: number;
  pendingWithdrawal: number;
  /** Approved and already debited, on its way to the bank. */
  processingWithdrawal?: number;
  minimumBalance: number;
  /** Smallest amount one withdrawal may be, set by the backend. */
  minimumWithdrawal?: number;
  availableBalance: number;
  withdrawableBalance: number;
  eligibleForJobs: boolean;
}

export type WalletTxType =
  | 'TOP_UP'
  | 'WITHDRAW'
  | 'WITHDRAW_REFUND'
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

export type WithdrawalReqStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'REJECTED'
  | 'FAILED';

export interface WithdrawalRequest {
  id: string;
  walletId: string;
  technicianId: string;
  amount: number;
  bankBin?: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  status: WithdrawalReqStatus;
  requestedAt: string;
  processedAt?: string | null;
  rejectReason?: string | null;
  /** Reference the bank printed on the transfer: proof the money moved. */
  payoutBankReference?: string | null;
  failureReason?: string | null;
}

/** A bank that can receive payouts, keyed by the BIN payOS routes on. */
export interface BankOption {
  bin: string;
  code: string;
  shortName: string;
  name: string;
}

/** The one account a technician's withdrawals are paid to. */
export interface BankAccount {
  bankBin: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  /** Upper case, no accents, exactly as the bank prints it. */
  accountName: string;
  updatedAt: string;
}

export interface TopUpResult {
  success: boolean;
  paymentId: string;
  balanceAfter: number | null;
  paymentUrl?: string | null;
  message: string;
}
