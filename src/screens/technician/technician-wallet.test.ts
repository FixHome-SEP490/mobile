import {
  createWalletController,
  validateTopUp,
  validateWithdrawal,
  type WalletDeps,
  type WalletUiState,
} from './technician-wallet';
import type { WalletSummary, WithdrawalRequest } from '../../types/wallet.types';

const TECH_ID = 'tech-a';

function summary(overrides: Partial<WalletSummary> = {}): WalletSummary {
  return {
    id: 'wallet-1',
    technicianId: TECH_ID,
    balance: 500_000,
    pendingWithdrawal: 0,
    minimumBalance: 200_000,
    availableBalance: 500_000,
    withdrawableBalance: 300_000,
    eligibleForJobs: true,
    ...overrides,
  };
}

function page<T>(data: T[], total = data.length) {
  return { data, meta: { page: 1, limit: 15, total, totalPages: 1 } };
}

function withdrawal(overrides: Partial<WithdrawalRequest> = {}): WithdrawalRequest {
  return {
    id: 'wd-1',
    walletId: 'wallet-1',
    technicianId: TECH_ID,
    amount: 100_000,
    bankName: 'Vietcombank',
    bankAccountNumber: '0123456789',
    bankAccountName: 'NGUYEN VAN A',
    status: 'PENDING',
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

function setup(overrides: Partial<WalletDeps> = {}) {
  let technicianId: string | null = TECH_ID;
  const write = jest.fn<void, [WalletUiState]>();
  const deps: WalletDeps = {
    getTechnicianId: () => technicianId,
    isFocused: () => true,
    getWallet: jest.fn().mockResolvedValue(summary()),
    getTransactions: jest.fn().mockResolvedValue(page([])),
    getWithdrawals: jest.fn().mockResolvedValue(page([])),
    topUp: jest.fn().mockResolvedValue({
      success: true,
      paymentId: 'p1',
      balanceAfter: 600_000,
      paymentUrl: null,
      message: 'ok',
    }),
    requestWithdrawal: jest.fn().mockResolvedValue(withdrawal()),
    openExternalUrl: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    ...overrides,
  };
  const controller = createWalletController(deps, write);
  return {
    deps,
    controller,
    state: () => write.mock.calls.at(-1)?.[0],
    setTechnicianId: (v: string | null) => {
      technicianId = v;
    },
  };
}

describe('validateTopUp', () => {
  it('rejects below minimum, above maximum, and non-integers', () => {
    expect(validateTopUp(9_999)).not.toBeNull();
    expect(validateTopUp(50_000_001)).not.toBeNull();
    expect(validateTopUp(1.5)).not.toBeNull();
  });

  it('accepts boundary values', () => {
    expect(validateTopUp(10_000)).toBeNull();
    expect(validateTopUp(50_000_000)).toBeNull();
  });
});

describe('validateWithdrawal', () => {
  const dto = {
    amount: 100_000,
    bankName: 'Vietcombank',
    bankAccountNumber: '0123456789',
    bankAccountName: 'NGUYEN VAN A',
  };

  it('rejects below minimum', () => {
    expect(validateWithdrawal({ ...dto, amount: 49_999 }, 1_000_000)).not.toBeNull();
  });

  it('rejects amount above withdrawable balance', () => {
    expect(validateWithdrawal(dto, 50_000)).not.toBeNull();
  });

  it('rejects missing bank info', () => {
    expect(validateWithdrawal({ ...dto, bankAccountNumber: '  ' }, 1_000_000)).not.toBeNull();
  });

  it('accepts a valid request', () => {
    expect(validateWithdrawal(dto, 1_000_000)).toBeNull();
  });
});

describe('wallet controller: focus/load', () => {
  it('loads summary, transactions, and withdrawals on focus', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    expect(deps.getWallet).toHaveBeenCalledTimes(1);
    expect(deps.getTransactions).toHaveBeenCalledWith(1, undefined);
    expect(deps.getWithdrawals).toHaveBeenCalledWith(1);
    expect(state()?.summary?.balance).toBe(500_000);
    expect(state()?.loading).toBe(false);
  });

  it('denies access and clears state on 401', async () => {
    const { controller, deps, state } = setup({
      getWallet: jest.fn().mockRejectedValue({ response: { status: 401 } }),
    });
    await controller.focus();
    expect(deps.onAccessDenied).toHaveBeenCalledTimes(1);
    expect(state()?.summary).toBeNull();
  });

  it('surfaces a generic error on unknown load failure', async () => {
    const { controller, state } = setup({
      getWallet: jest.fn().mockRejectedValue(new Error('network')),
    });
    await controller.focus();
    expect(state()?.error).toMatch(/Không thể tải/);
  });

  it('re-fetches transactions with the selected type filter', async () => {
    const { controller, deps } = setup();
    await controller.focus();
    controller.setTxFilter('TOP_UP');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(deps.getTransactions).toHaveBeenLastCalledWith(1, 'TOP_UP');
  });
});

describe('wallet controller: top-up', () => {
  it('DEMO mode credits instantly and refreshes wallet', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    await controller.startTopUp(100_000);
    expect(deps.topUp).toHaveBeenCalledWith(100_000);
    expect(deps.openExternalUrl).not.toHaveBeenCalled();
    expect(state()?.topUpBusy).toBe(false);
    expect(state()?.topUpPending).toBe(false);
  });

  it('LIVE mode opens VNPay and marks top-up pending', async () => {
    const { controller, deps, state } = setup({
      topUp: jest.fn().mockResolvedValue({
        success: true,
        paymentId: 'p1',
        balanceAfter: null,
        paymentUrl: 'https://sandbox.vnpayment.vn/pay',
        message: 'ok',
      }),
    });
    await controller.focus();
    await controller.startTopUp(100_000);
    expect(deps.openExternalUrl).toHaveBeenCalledWith('https://sandbox.vnpayment.vn/pay');
    expect(state()?.topUpPending).toBe(true);
  });

  it('rejects an amount outside the allowed range without calling the API', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    const ok = await controller.startTopUp(5_000);
    expect(ok).toBe(false);
    expect(deps.topUp).not.toHaveBeenCalled();
    expect(state()?.topUpError).not.toBeNull();
  });

  it('reconcileTopUp refreshes the wallet and clears the pending flag', async () => {
    const { controller, deps, state } = setup({
      topUp: jest.fn().mockResolvedValue({
        success: true,
        paymentId: 'p1',
        balanceAfter: null,
        paymentUrl: 'https://sandbox.vnpayment.vn/pay',
        message: 'ok',
      }),
    });
    await controller.focus();
    await controller.startTopUp(100_000);
    (deps.getWallet as jest.Mock).mockResolvedValue(summary({ balance: 600_000 }));
    await controller.reconcileTopUp();
    expect(state()?.topUpPending).toBe(false);
    expect(state()?.summary?.balance).toBe(600_000);
  });
});

describe('wallet controller: withdrawal', () => {
  const dto = {
    amount: 100_000,
    bankName: 'Vietcombank',
    bankAccountNumber: '0123456789',
    bankAccountName: 'NGUYEN VAN A',
  };

  it('submits a valid withdrawal and refreshes wallet + lists', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    const ok = await controller.submitWithdrawal(dto);
    expect(ok).toBe(true);
    expect(deps.requestWithdrawal).toHaveBeenCalledWith(dto);
    expect(state()?.withdrawBusy).toBe(false);
  });

  it('blocks a second withdrawal while one is already pending', async () => {
    const { controller, deps, state } = setup({
      getWithdrawals: jest.fn().mockResolvedValue(page([withdrawal({ status: 'PENDING' })])),
    });
    await controller.focus();
    const ok = await controller.submitWithdrawal(dto);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
    expect(state()?.withdrawError).toMatch(/chờ xử lý/);
  });

  it('rejects an amount above withdrawable balance client-side', async () => {
    const { controller, deps } = setup({
      getWallet: jest.fn().mockResolvedValue(summary({ withdrawableBalance: 50_000 })),
    });
    await controller.focus();
    const ok = await controller.submitWithdrawal(dto);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('maps a 409 conflict from the backend to a pending-request message', async () => {
    const { controller, state } = setup({
      requestWithdrawal: jest.fn().mockRejectedValue({ response: { status: 409 } }),
    });
    await controller.focus();
    await controller.submitWithdrawal(dto);
    expect(state()?.withdrawError).toMatch(/chờ xử lý/);
  });

  it('denies access on 401', async () => {
    const { controller, deps, state } = setup({
      requestWithdrawal: jest.fn().mockRejectedValue({ response: { status: 401 } }),
    });
    await controller.focus();
    await controller.submitWithdrawal(dto);
    expect(deps.onAccessDenied).toHaveBeenCalledTimes(1);
    expect(state()?.summary).toBeNull();
  });
});
