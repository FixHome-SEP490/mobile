import type { PaginationMeta } from '../../types';
import type {
  BankAccount,
  BankOption,
  TopUpResult,
  WalletSummary,
  WalletTransaction,
  WalletTxType,
  WithdrawalDecision,
  WithdrawalRequest,
} from '../../types/wallet.types';
import { extractApiErrorMessage } from '../../utils/input-validation';

export const MIN_TOP_UP = 10_000;
export const MAX_TOP_UP = 50_000_000;
/**
 * PO decision (29/09/2026). The backend sends its own figure as
 * minimumWithdrawal; this is only the fallback for an older backend.
 */
export const MIN_WITHDRAWAL = 10_000;

export interface WalletUiState {
  loading: boolean;
  refreshing: boolean;
  summary: WalletSummary | null;
  error: string | null;

  txFilter: WalletTxType | 'ALL';
  transactions: WalletTransaction[];
  transactionsTotal: number;
  transactionsPage: number;
  transactionsLoading: boolean;

  withdrawals: WithdrawalRequest[];
  withdrawalsTotal: number;
  withdrawalsPage: number;
  withdrawalsLoading: boolean;

  topUpBusy: boolean;
  topUpPending: boolean;
  topUpError: string | null;

  withdrawBusy: boolean;
  withdrawError: string | null;

  /** The one account withdrawals are paid to; null until saved. */
  bankAccount: BankAccount | null;
  banks: BankOption[];
  bankBusy: boolean;
  bankError: string | null;
}

export const initialWalletState: WalletUiState = {
  loading: true,
  refreshing: false,
  summary: null,
  error: null,
  txFilter: 'ALL',
  transactions: [],
  transactionsTotal: 0,
  transactionsPage: 0,
  transactionsLoading: false,
  withdrawals: [],
  withdrawalsTotal: 0,
  withdrawalsPage: 0,
  withdrawalsLoading: false,
  topUpBusy: false,
  topUpPending: false,
  topUpError: null,
  withdrawBusy: false,
  withdrawError: null,
  bankAccount: null,
  banks: [],
  bankBusy: false,
  bankError: null,
};

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export interface BankAccountInput {
  bankBin: string;
  accountNumber: string;
  accountName: string;
}

export interface WalletDeps {
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  getWallet: () => Promise<WalletSummary>;
  getTransactions: (
    page: number,
    type?: WalletTxType,
  ) => Promise<{ data: WalletTransaction[]; meta: PaginationMeta }>;
  getWithdrawals: (
    page: number,
  ) => Promise<{ data: WithdrawalRequest[]; meta: PaginationMeta }>;
  topUp: (amount: number) => Promise<TopUpResult>;
  getBankAccount: () => Promise<BankAccount | null>;
  listBanks: () => Promise<BankOption[]>;
  saveBankAccount: (dto: BankAccountInput) => Promise<BankAccount>;
  /**
   * Only the amount: where the money goes is the saved, KYC-checked account.
   * Answers with the payout result — there is no approval step.
   */
  requestWithdrawal: (amount: number) => Promise<WithdrawalDecision>;
  openExternalUrl: (url: string) => Promise<void>;
  onAccessDenied: () => void;
}

export function validateTopUp(amount: number): string | null {
  if (!Number.isSafeInteger(amount) || amount < MIN_TOP_UP || amount > MAX_TOP_UP) {
    return `Số tiền nạp từ ${MIN_TOP_UP.toLocaleString('vi-VN')}đ đến ${MAX_TOP_UP.toLocaleString('vi-VN')}đ`;
  }
  return null;
}

export function minimumWithdrawalOf(summary: WalletSummary | null): number {
  return summary?.minimumWithdrawal ?? MIN_WITHDRAWAL;
}

export function validateWithdrawal(
  amount: number,
  withdrawableBalance: number,
  minimum: number = MIN_WITHDRAWAL,
): string | null {
  if (!Number.isSafeInteger(amount) || amount < minimum) {
    return `Số tiền rút tối thiểu ${minimum.toLocaleString('vi-VN')}đ`;
  }
  if (amount > withdrawableBalance) {
    return 'Số tiền vượt quá số dư có thể rút';
  }
  return null;
}

/**
 * The same shape the server enforces, checked first so a typo never costs a
 * round trip. Whether the name matches KYC only the server can say.
 */
export function validateBankAccount(dto: BankAccountInput): string | null {
  if (!dto.bankBin) return 'Vui lòng chọn ngân hàng';
  if (!/^\d{6,19}$/.test(dto.accountNumber.trim())) {
    return 'Số tài khoản chỉ gồm chữ số, từ 6 đến 19 số';
  }
  if (!dto.accountName.trim()) return 'Vui lòng nhập tên chủ tài khoản';
  return null;
}

/** One withdrawal at a time: waiting for approval, or still moving to the bank. */
export function openWithdrawalOf(
  state: Pick<WalletUiState, 'summary' | 'withdrawals'>,
): 'PENDING' | 'PROCESSING' | null {
  if (
    (state.summary?.processingWithdrawal ?? 0) > 0 ||
    state.withdrawals.some((w) => w.status === 'PROCESSING')
  ) {
    return 'PROCESSING';
  }
  if (
    (state.summary?.pendingWithdrawal ?? 0) > 0 ||
    state.withdrawals.some((w) => w.status === 'PENDING')
  ) {
    return 'PENDING';
  }
  return null;
}

const OPEN_WITHDRAWAL_MESSAGE = {
  PENDING: 'Bạn đang có một yêu cầu rút tiền chờ xử lý.',
  PROCESSING: 'Bạn đang có một lệnh rút đang được chuyển về ngân hàng.',
} as const;

export function createWalletController(
  deps: WalletDeps,
  write: (state: WalletUiState) => void,
) {
  let state = { ...initialWalletState };
  let topUpSubmitting = false;
  let withdrawSubmitting = false;
  let bankSubmitting = false;

  const publish = (patch: Partial<WalletUiState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  const same = (technicianId: string) =>
    deps.isFocused() && deps.getTechnicianId() === technicianId;

  function denyAccess() {
    state = { ...initialWalletState, loading: false };
    write(state);
    deps.onAccessDenied();
  }

  async function loadSummary(refresh = false): Promise<void> {
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    publish({ loading: !refresh, refreshing: refresh, error: null });
    try {
      const summary = await deps.getWallet();
      if (!same(technicianId)) return;
      publish({ loading: false, refreshing: false, summary, error: null });
    } catch (error) {
      if (!same(technicianId)) return;
      if (statusOf(error) === 401 || statusOf(error) === 403) return denyAccess();
      publish({
        loading: false,
        refreshing: false,
        error: 'Không thể tải thông tin ví. Vui lòng thử lại.',
      });
    }
  }

  async function loadTransactions(page = 1): Promise<void> {
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    publish({ transactionsLoading: true });
    try {
      const type = state.txFilter === 'ALL' ? undefined : state.txFilter;
      const res = await deps.getTransactions(page, type);
      if (!same(technicianId)) return;
      publish({
        transactions: res.data,
        transactionsTotal: res.meta.total,
        transactionsPage: page,
        transactionsLoading: false,
      });
    } catch {
      if (!same(technicianId)) return;
      publish({ transactionsLoading: false });
    }
  }

  async function loadWithdrawals(page = 1): Promise<void> {
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    publish({ withdrawalsLoading: true });
    try {
      const res = await deps.getWithdrawals(page);
      if (!same(technicianId)) return;
      publish({
        withdrawals: res.data,
        withdrawalsTotal: res.meta.total,
        withdrawalsPage: page,
        withdrawalsLoading: false,
      });
    } catch {
      if (!same(technicianId)) return;
      publish({ withdrawalsLoading: false });
    }
  }

  async function loadBankAccount(): Promise<void> {
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    try {
      const bankAccount = await deps.getBankAccount();
      if (!same(technicianId)) return;
      publish({ bankAccount });
    } catch {
      // Not fatal: the withdraw flow asks for an account again if it is missing.
    }
  }

  /** The bank list only matters once the form opens, so it loads lazily. */
  async function loadBanks(): Promise<void> {
    if (state.banks.length > 0) return;
    try {
      publish({ banks: await deps.listBanks() });
    } catch {
      publish({ bankError: 'Không tải được danh sách ngân hàng. Vui lòng thử lại.' });
    }
  }

  function setTxFilter(filter: WalletTxType | 'ALL'): void {
    publish({ txFilter: filter });
    void loadTransactions(1);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([
      loadSummary(true),
      loadTransactions(state.transactionsPage || 1),
      loadWithdrawals(state.withdrawalsPage || 1),
      loadBankAccount(),
    ]);
  }

  async function startTopUp(amount: number): Promise<boolean> {
    if (topUpSubmitting || state.topUpBusy) return false;
    const technicianId = deps.getTechnicianId();
    if (!technicianId) return false;
    const validationError = validateTopUp(amount);
    if (validationError) {
      publish({ topUpError: validationError });
      return false;
    }
    topUpSubmitting = true;
    publish({ topUpBusy: true, topUpError: null });
    try {
      const result = await deps.topUp(amount);
      if (!same(technicianId)) return false;
      if (result.paymentUrl) {
        publish({ topUpBusy: false, topUpPending: true });
        try {
          await deps.openExternalUrl(result.paymentUrl);
        } catch {
          if (!same(technicianId)) return true;
          publish({
            topUpError: 'Không mở được VNPay. Vui lòng kiểm tra số dư trước khi thử lại.',
          });
        }
        return true;
      }
      // DEMO payment mode: balance is credited instantly, no redirect needed.
      publish({ topUpBusy: false, topUpPending: false });
      await refreshAll();
      return true;
    } catch (error) {
      if (!same(technicianId)) return false;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        denyAccess();
        return false;
      }
      publish({
        topUpBusy: false,
        topUpPending: true,
        topUpError: 'Kết quả nạp tiền chưa xác định. Vui lòng kiểm tra số dư trước khi nạp lại.',
      });
      return false;
    } finally {
      topUpSubmitting = false;
    }
  }

  async function reconcileTopUp(): Promise<void> {
    if (!state.topUpPending) return;
    await loadSummary(true);
    publish({ topUpPending: false });
  }

  async function submitBankAccount(dto: BankAccountInput): Promise<boolean> {
    if (bankSubmitting || state.bankBusy) return false;
    const technicianId = deps.getTechnicianId();
    if (!technicianId) return false;
    const validationError = validateBankAccount(dto);
    if (validationError) {
      publish({ bankError: validationError });
      return false;
    }
    bankSubmitting = true;
    publish({ bankBusy: true, bankError: null });
    try {
      const bankAccount = await deps.saveBankAccount({
        bankBin: dto.bankBin,
        accountNumber: dto.accountNumber.trim(),
        accountName: dto.accountName.trim(),
      });
      if (!same(technicianId)) return false;
      publish({ bankBusy: false, bankAccount });
      return true;
    } catch (error) {
      if (!same(technicianId)) return false;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        denyAccess();
        return false;
      }
      // The server's reason matters here: it names the KYC name to match.
      publish({
        bankBusy: false,
        bankError: extractApiErrorMessage(error, 'Không lưu được tài khoản ngân hàng'),
      });
      return false;
    } finally {
      bankSubmitting = false;
    }
  }

  /**
   * Withdraw and get the payout result back at once, or null when nothing was
   * sent (a validation error, or the server refused before moving money).
   */
  async function submitWithdrawal(amount: number): Promise<WithdrawalDecision | null> {
    if (withdrawSubmitting || state.withdrawBusy) return null;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !state.summary) return null;
    if (!state.bankAccount) {
      publish({ withdrawError: 'Bạn cần khai báo tài khoản ngân hàng nhận tiền trước khi rút.' });
      return null;
    }
    const open = openWithdrawalOf(state);
    if (open) {
      publish({ withdrawError: OPEN_WITHDRAWAL_MESSAGE[open] });
      return null;
    }
    const validationError = validateWithdrawal(
      amount,
      state.summary.withdrawableBalance,
      minimumWithdrawalOf(state.summary),
    );
    if (validationError) {
      publish({ withdrawError: validationError });
      return null;
    }
    withdrawSubmitting = true;
    publish({ withdrawBusy: true, withdrawError: null });
    try {
      const result = await deps.requestWithdrawal(amount);
      if (!same(technicianId)) return null;
      publish({ withdrawBusy: false });
      await refreshAll();
      return result;
    } catch (error) {
      if (!same(technicianId)) return null;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        denyAccess();
        return null;
      }
      const message = extractApiErrorMessage(
        error,
        statusOf(error) === 409
          ? OPEN_WITHDRAWAL_MESSAGE.PENDING
          : 'Rút tiền không thành công. Vui lòng thử lại.',
      );
      publish({ withdrawBusy: false, withdrawError: message });
      return null;
    } finally {
      withdrawSubmitting = false;
    }
  }

  function focus(): Promise<void> {
    state = { ...initialWalletState };
    write(state);
    return Promise.all([
      loadSummary(),
      loadTransactions(1),
      loadWithdrawals(1),
      loadBankAccount(),
    ]).then(() => undefined);
  }

  return {
    focus,
    refreshAll,
    loadTransactions,
    loadWithdrawals,
    loadBanks,
    setTxFilter,
    startTopUp,
    reconcileTopUp,
    submitBankAccount,
    submitWithdrawal,
  };
}
