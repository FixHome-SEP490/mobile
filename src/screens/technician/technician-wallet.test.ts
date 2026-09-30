import {
  createWalletController,
  openWithdrawalOf,
  validateBankAccount,
  validateTopUp,
  validateWithdrawal,
  type WalletDeps,
  type WalletUiState,
} from './technician-wallet';
import type { BankAccount, WalletSummary, WithdrawalRequest } from '../../types/wallet.types';

const TECH_ID = 'tech-a';

const ACCOUNT: BankAccount = {
  bankBin: '970436',
  bankCode: 'VCB',
  bankName: 'Vietcombank',
  accountNumber: '0123456789',
  accountName: 'PHAM DUC TOAN',
  updatedAt: '2026-09-29T00:00:00Z',
};

function summary(overrides: Partial<WalletSummary> = {}): WalletSummary {
  return {
    id: 'wallet-1',
    technicianId: TECH_ID,
    balance: 500_000,
    pendingWithdrawal: 0,
    processingWithdrawal: 0,
    minimumBalance: 200_000,
    minimumWithdrawal: 10_000,
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
    bankAccountName: 'PHAM DUC TOAN',
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
    getBankAccount: jest.fn().mockResolvedValue({ ...ACCOUNT }),
    listBanks: jest.fn().mockResolvedValue([
      { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
    ]),
    saveBankAccount: jest.fn().mockResolvedValue({ ...ACCOUNT }),
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
  it('accepts exactly the 10.000đ minimum', () => {
    expect(validateWithdrawal(10_000, 1_000_000)).toBeNull();
  });

  it('rejects one đồng below the minimum', () => {
    expect(validateWithdrawal(9_999, 1_000_000)).not.toBeNull();
  });

  it('follows the minimum the backend sends', () => {
    expect(validateWithdrawal(20_000, 1_000_000, 50_000)).not.toBeNull();
  });

  it('rejects amount above withdrawable balance', () => {
    expect(validateWithdrawal(100_000, 50_000)).not.toBeNull();
  });

  it('rejects non-integers and nonsense', () => {
    expect(validateWithdrawal(10_000.5, 1_000_000)).not.toBeNull();
    expect(validateWithdrawal(Number.NaN, 1_000_000)).not.toBeNull();
    expect(validateWithdrawal(-50_000, 1_000_000)).not.toBeNull();
  });
});

describe('validateBankAccount', () => {
  const dto = { bankBin: '970436', accountNumber: '0123456789', accountName: 'Phạm Đức Toàn' };

  it('accepts a well-formed account, accents included', () => {
    expect(validateBankAccount(dto)).toBeNull();
  });

  it('requires a bank', () => {
    expect(validateBankAccount({ ...dto, bankBin: '' })).not.toBeNull();
  });

  it.each([
    ['letters', '0123ABC789'],
    ['spaces', '0123 456 789'],
    ['too short', '12345'],
    ['too long', '1'.repeat(20)],
    ['an emoji', '0123456789🔥'],
  ])('rejects an account number with %s', (_label, accountNumber) => {
    expect(validateBankAccount({ ...dto, accountNumber })).not.toBeNull();
  });

  it('requires a holder name', () => {
    expect(validateBankAccount({ ...dto, accountName: '   ' })).not.toBeNull();
  });
});

describe('openWithdrawalOf', () => {
  it('sees a payout still moving to the bank, which the server already debited', () => {
    expect(openWithdrawalOf({ summary: summary({ processingWithdrawal: 50_000 }), withdrawals: [] })).toBe(
      'PROCESSING',
    );
  });

  it('sees a request waiting for approval', () => {
    expect(openWithdrawalOf({ summary: summary({ pendingWithdrawal: 50_000 }), withdrawals: [] })).toBe(
      'PENDING',
    );
  });

  it('is clear when nothing is open', () => {
    expect(openWithdrawalOf({ summary: summary(), withdrawals: [withdrawal({ status: 'SUCCESS' })] })).toBeNull();
  });
});

describe('wallet controller: focus/load', () => {
  it('loads summary, transactions, withdrawals and the bank account on focus', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    expect(deps.getWallet).toHaveBeenCalledTimes(1);
    expect(deps.getTransactions).toHaveBeenCalledWith(1, undefined);
    expect(deps.getWithdrawals).toHaveBeenCalledWith(1);
    expect(deps.getBankAccount).toHaveBeenCalledTimes(1);
    expect(state()?.summary?.balance).toBe(500_000);
    expect(state()?.bankAccount?.accountNumber).toBe('0123456789');
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
    controller.setTxFilter('WITHDRAW_REFUND');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(deps.getTransactions).toHaveBeenLastCalledWith(1, 'WITHDRAW_REFUND');
  });

  it('loads the bank list only once, when the form opens', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    expect(deps.listBanks).not.toHaveBeenCalled();

    await controller.loadBanks();
    await controller.loadBanks();

    expect(deps.listBanks).toHaveBeenCalledTimes(1);
    expect(state()?.banks).toHaveLength(1);
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

describe('wallet controller: bank account', () => {
  const input = { bankBin: '970436', accountNumber: ' 0123456789 ', accountName: ' Phạm Đức Toàn ' };

  it('saves a trimmed account and keeps it for the next withdrawal', async () => {
    const { controller, deps, state } = setup({ getBankAccount: jest.fn().mockResolvedValue(null) });
    await controller.focus();
    const ok = await controller.submitBankAccount(input);
    expect(ok).toBe(true);
    expect(deps.saveBankAccount).toHaveBeenCalledWith({
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'Phạm Đức Toàn',
    });
    expect(state()?.bankAccount?.accountName).toBe('PHAM DUC TOAN');
  });

  it('refuses a malformed account number without calling the server', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    const ok = await controller.submitBankAccount({ ...input, accountNumber: '0123ABC' });
    expect(ok).toBe(false);
    expect(deps.saveBankAccount).not.toHaveBeenCalled();
    expect(state()?.bankError).toMatch(/chữ số/);
  });

  it('shows the server\'s reason when the name does not match KYC', async () => {
    const { controller, state } = setup({
      saveBankAccount: jest.fn().mockRejectedValue({
        response: {
          status: 422,
          data: {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Tên chủ tài khoản phải trùng với tên đã xác minh danh tính: PHAM DUC TOAN',
            },
          },
        },
      }),
    });
    await controller.focus();
    await controller.submitBankAccount({ ...input, accountName: 'TRAN VAN B' });
    expect(state()?.bankError).toBe(
      'Tên chủ tài khoản phải trùng với tên đã xác minh danh tính: PHAM DUC TOAN',
    );
  });
});

describe('wallet controller: withdrawal', () => {
  it('sends only the amount and refreshes wallet + lists', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    const ok = await controller.submitWithdrawal(100_000);
    expect(ok).toBe(true);
    expect(deps.requestWithdrawal).toHaveBeenCalledWith(100_000);
    expect(state()?.withdrawBusy).toBe(false);
  });

  it('refuses to withdraw before a bank account is saved', async () => {
    const { controller, deps, state } = setup({ getBankAccount: jest.fn().mockResolvedValue(null) });
    await controller.focus();
    const ok = await controller.submitWithdrawal(100_000);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
    expect(state()?.withdrawError).toMatch(/tài khoản ngân hàng/);
  });

  it('blocks a second withdrawal while one is already pending', async () => {
    const { controller, deps, state } = setup({
      getWithdrawals: jest.fn().mockResolvedValue(page([withdrawal({ status: 'PENDING' })])),
    });
    await controller.focus();
    const ok = await controller.submitWithdrawal(100_000);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
    expect(state()?.withdrawError).toMatch(/chờ xử lý/);
  });

  it('blocks a second withdrawal while a payout is still moving to the bank', async () => {
    const { controller, deps, state } = setup({
      getWallet: jest.fn().mockResolvedValue(summary({ processingWithdrawal: 100_000 })),
    });
    await controller.focus();
    const ok = await controller.submitWithdrawal(50_000);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
    expect(state()?.withdrawError).toMatch(/đang được chuyển/);
  });

  it('holds the 10.000đ minimum client-side', async () => {
    const { controller, deps, state } = setup();
    await controller.focus();
    const ok = await controller.submitWithdrawal(9_999);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
    expect(state()?.withdrawError).toMatch(/tối thiểu/);
  });

  it('rejects an amount above withdrawable balance client-side', async () => {
    const { controller, deps } = setup({
      getWallet: jest.fn().mockResolvedValue(summary({ withdrawableBalance: 50_000 })),
    });
    await controller.focus();
    const ok = await controller.submitWithdrawal(100_000);
    expect(ok).toBe(false);
    expect(deps.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('maps a bare 409 conflict to a pending-request message', async () => {
    const { controller, state } = setup({
      requestWithdrawal: jest.fn().mockRejectedValue({ response: { status: 409 } }),
    });
    await controller.focus();
    await controller.submitWithdrawal(100_000);
    expect(state()?.withdrawError).toMatch(/chờ xử lý/);
  });

  it('prefers the server\'s own reason when it gives one', async () => {
    const { controller, state } = setup({
      requestWithdrawal: jest.fn().mockRejectedValue({
        response: {
          status: 422,
          data: { error: { message: 'Số tiền rút tối đa hiện tại là 300.000 ₫' } },
        },
      }),
    });
    await controller.focus();
    await controller.submitWithdrawal(100_000);
    expect(state()?.withdrawError).toBe('Số tiền rút tối đa hiện tại là 300.000 ₫');
  });

  it('denies access on 401', async () => {
    const { controller, deps, state } = setup({
      requestWithdrawal: jest.fn().mockRejectedValue({ response: { status: 401 } }),
    });
    await controller.focus();
    await controller.submitWithdrawal(100_000);
    expect(deps.onAccessDenied).toHaveBeenCalledTimes(1);
    expect(state()?.summary).toBeNull();
  });
});
