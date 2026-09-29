import type { PaginationMeta } from '../../types';
import type {
  TopUpResult,
  WalletSummary,
  WalletTransaction,
  WalletTxType,
  WithdrawalRequest,
} from '../../types/wallet.types';

export const MIN_TOP_UP = 10_000;
export const MAX_TOP_UP = 50_000_000;
export const MIN_WITHDRAWAL = 50_000;

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
};

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
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
  requestWithdrawal: (dto: {
    amount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  }) => Promise<WithdrawalRequest>;
  openExternalUrl: (url: string) => Promise<void>;
  onAccessDenied: () => void;
}

export function validateTopUp(amount: number): string | null {
  if (!Number.isSafeInteger(amount) || amount < MIN_TOP_UP || amount > MAX_TOP_UP) {
    return `Số tiền nạp từ ${MIN_TOP_UP.toLocaleString('vi-VN')}đ đến ${MAX_TOP_UP.toLocaleString('vi-VN')}đ`;
  }
  return null;
}

export function validateWithdrawal(
  dto: { amount: number; bankName: string; bankAccountNumber: string; bankAccountName: string },
  withdrawableBalance: number,
): string | null {
  if (!Number.isSafeInteger(dto.amount) || dto.amount < MIN_WITHDRAWAL) {
    return `Số tiền rút tối thiểu ${MIN_WITHDRAWAL.toLocaleString('vi-VN')}đ`;
  }
  if (dto.amount > withdrawableBalance) {
    return 'Số tiền vượt quá số dư có thể rút';
  }
  if (!dto.bankName.trim() || !dto.bankAccountNumber.trim() || !dto.bankAccountName.trim()) {
    return 'Vui lòng nhập đầy đủ thông tin ngân hàng';
  }
  return null;
}

export function createWalletController(
  deps: WalletDeps,
  write: (state: WalletUiState) => void,
) {
  let state = { ...initialWalletState };
  let topUpSubmitting = false;
  let withdrawSubmitting = false;

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

  function setTxFilter(filter: WalletTxType | 'ALL'): void {
    publish({ txFilter: filter });
    void loadTransactions(1);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([
      loadSummary(true),
      loadTransactions(state.transactionsPage || 1),
      loadWithdrawals(state.withdrawalsPage || 1),
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

  async function submitWithdrawal(dto: {
    amount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  }): Promise<boolean> {
    if (withdrawSubmitting || state.withdrawBusy) return false;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !state.summary) return false;
    if (state.withdrawals.some((w) => w.status === 'PENDING')) {
      publish({ withdrawError: 'Bạn đang có một yêu cầu rút tiền chờ xử lý.' });
      return false;
    }
    const validationError = validateWithdrawal(dto, state.summary.withdrawableBalance);
    if (validationError) {
      publish({ withdrawError: validationError });
      return false;
    }
    withdrawSubmitting = true;
    publish({ withdrawBusy: true, withdrawError: null });
    try {
      await deps.requestWithdrawal(dto);
      if (!same(technicianId)) return false;
      publish({ withdrawBusy: false });
      await refreshAll();
      return true;
    } catch (error) {
      if (!same(technicianId)) return false;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        denyAccess();
        return false;
      }
      const message =
        statusOf(error) === 409
          ? 'Bạn đang có một yêu cầu rút tiền chờ xử lý.'
          : 'Không thể tạo yêu cầu rút tiền. Vui lòng thử lại.';
      publish({ withdrawBusy: false, withdrawError: message });
      return false;
    } finally {
      withdrawSubmitting = false;
    }
  }

  function focus(): Promise<void> {
    state = { ...initialWalletState };
    write(state);
    return Promise.all([loadSummary(), loadTransactions(1), loadWithdrawals(1)]).then(
      () => undefined,
    );
  }

  return {
    focus,
    refreshAll,
    loadTransactions,
    loadWithdrawals,
    setTxFilter,
    startTopUp,
    reconcileTopUp,
    submitWithdrawal,
  };
}
