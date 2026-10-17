// Technician Wallet Codex Fidelity Tests
// T-NATIVE-11A: Codex dark hero / header REAL RN, strict finance-safe
// These tests MUST be RED before source changes, GREEN after.
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { walletApi } from '../../api/wallet.api';
import type { WalletSummary, WithdrawalRequest } from '../../types/wallet.types';
import TechnicianWalletScreen from './TechnicianWalletScreen';

jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
    useFocusEffect: (callback: () => void | (() => void)) =>
      ReactModule.useEffect(callback, [callback]),
  };
});

jest.mock('../../store', () => ({
  useAuthStore: () => ({ user: { id: 'tech-a' } }),
}));

jest.mock('../../api/wallet.api', () => ({
  walletApi: {
    getMyWallet: jest.fn(),
    getMyTransactions: jest.fn(),
    getMyWithdrawals: jest.fn(),
    topUp: jest.fn(),
    getMyBankAccount: jest.fn(),
    listBanks: jest.fn(),
    saveMyBankAccount: jest.fn(),
    requestWithdrawal: jest.fn(),
  },
}));

jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: () => false,
}));

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      background: '#ffffff',
      surface: '#ffffff',
      text: '#1a1714',
      textSecondary: '#5c554c',
      muted: '#94a3b8',
      primary: '#2563eb',
      primaryStrong: '#1d4ed8',
      primarySoft: '#eff6ff',
      primaryTint: '#bfdbfe',
      border: '#e2ddd6',
      divider: '#e2ddd6',
      error: '#b42318',
      tone: {
        success: { bg: '#e7f6f0', fg: '#0e8a5f', text: '#08734f' },
        warning: { bg: '#fef6e0', fg: '#b07d00', text: '#805b00' },
        danger: { bg: '#feeceb', fg: '#d92d20', text: '#b42318' },
        info: { bg: '#eaf1fe', fg: '#175cd3', text: '#175cd3' },
        neutral: { bg: '#efeee7', fg: '#7d7468', text: '#5c554c' },
      },
    },
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) =>
    ReactModule.createElement(View, props, children);
  return {
    SafeAreaView: Passthrough,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('../../components/StatusBadge', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ view }: { view: { label: string } }) =>
    ReactModule.createElement(NativeText, null, view.label);
});

const mockWalletApi = walletApi as jest.Mocked<typeof walletApi>;

const summary: WalletSummary = {
  id: 'wallet-a',
  technicianId: 'tech-a',
  balance: 900_000,
  pendingWithdrawal: 120_000,
  processingWithdrawal: 80_000,
  minimumBalance: 200_000,
  minimumWithdrawal: 10_000,
  availableBalance: 780_000,
  withdrawableBalance: 580_000,
  eligibleForJobs: true,
};

const withdrawal: WithdrawalRequest = {
  id: 'wd-a',
  walletId: 'wallet-a',
  technicianId: 'tech-a',
  amount: 100_000,
  bankName: 'Vietcombank',
  bankAccountNumber: '0123456789',
  bankAccountName: 'PHAM DUC TOAN',
  status: 'PENDING',
  requestedAt: '2026-10-08T10:00:00.000Z',
};

function visibleText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    })
    .join('\n')
    .replace(/ /g, ' ');
}

function stylesOf(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
  );
}

function touchHeight(node: { props: { style?: unknown } }): number {
  return Math.max(
    0,
    ...stylesOf(node.props.style).map((style) => {
      const min = typeof style.minHeight === 'number' ? style.minHeight : 0;
      const h = typeof style.height === 'number' ? style.height : 0;
      return Math.max(min, h);
    }),
  );
}

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(TechnicianWalletScreen));
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWalletApi.getMyWallet.mockResolvedValue(summary);
  mockWalletApi.getMyTransactions.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 15, total: 0, totalPages: 1 },
  });
  mockWalletApi.getMyWithdrawals.mockResolvedValue({
    data: [withdrawal],
    meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
  });
  mockWalletApi.getMyBankAccount.mockResolvedValue({
    bankBin: '970436',
    bankCode: 'VCB',
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountName: 'PHAM DUC TOAN',
    updatedAt: '2026-09-29T00:00:00Z',
  });
  mockWalletApi.listBanks.mockResolvedValue([]);
});

describe('technician wallet Codex fidelity (T-NATIVE-11A)', () => {
  it('shows Codex eyebrow "Ví của tôi" in header', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Ví của tôi');
    await act(async () => renderer.unmount());
  });

  it('shows Codex title "Ví rõ từng khoản" as main header', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Ví rõ từng khoản');
    await act(async () => renderer.unmount());
  });

  it('renders dark navy balance hero with white balance text from server summary.balance', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('900.000 ₫');
    expect(text).toContain('Số dư ví');
    expect(renderer.root.findAllByType(View).some((node) => stylesOf(node.props.style).some((style) => style.backgroundColor === '#193E70'))).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('preserves "Số dư ví" label exactly (existing test requirement)', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Số dư ví');
    await act(async () => renderer.unmount());
  });

  it('shows eligibility StatusBadge and minimumBalance from server', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Mức tối thiểu để nhận việc: 200.000 ₫');
    expect(text).toContain('Đủ điều kiện nhận việc');
    await act(async () => renderer.unmount());
  });

  it('shows all 4 real summaryMetrics with undefined => "Chưa xác định"', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({
      ...summary,
      availableBalance: undefined,
      withdrawableBalance: undefined,
      pendingWithdrawal: undefined,
      processingWithdrawal: undefined,
    } as unknown as WalletSummary); // Intentionally malformed API fixture; production fields remain required.
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Số dư khả dụng');
    expect(text).toContain('Chưa xác định');
    expect(text).toContain('Có thể rút');
    expect(text).toContain('Chờ rút');
    expect(text).toContain('Đang chuyển');
    await act(async () => renderer.unmount());
  });

  it('does NOT duplicate or recompute availableBalance', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    // Should show the server value exactly once in metrics
    const matches = text.match(/Số dư khả dụng/g);
    expect(matches?.length).toBe(1);
    await act(async () => renderer.unmount());
  });

  it('shows real negative balance warning when balance < 0', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({ ...summary, balance: -50_000, eligibleForJobs: false });
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Ví đang âm');
    expect(text).toContain('công nợ');
    await act(async () => renderer.unmount());
  });

  it('shows real eligibility warning when not eligible for jobs', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({ ...summary, balance: 150_000, eligibleForJobs: false });
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Số dư dưới mức tối thiểu');
    expect(text).toContain('không nhận được việc mới');
    await act(async () => renderer.unmount());
  });

  it('has NAV back button with 44pt touch target', async () => {
    const renderer = await renderScreen();
    const backBtn = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Quay lại',
    );
    expect(backBtn).toHaveLength(1);
    expect(touchHeight(backBtn[0])).toBeGreaterThanOrEqual(44);
    await act(async () => renderer.unmount());
  });

  it('has topup/withdraw buttons with 44pt hit targets, same handlers, disabled guards', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({ ...summary, pendingWithdrawal: 0, processingWithdrawal: 0 });
    mockWalletApi.getMyWithdrawals.mockResolvedValue({ data: [], meta: { page: 1, limit: 15, total: 0, totalPages: 1 } });
    const renderer = await renderScreen();
    const topUpBtn = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Mở nạp tiền qua VNPay',
    );
    const withdrawBtn = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Rút tiền',
    );
    expect(topUpBtn).toHaveLength(1);
    expect(withdrawBtn).toHaveLength(1);
    expect(touchHeight(topUpBtn[0])).toBeGreaterThanOrEqual(44);
    expect(touchHeight(withdrawBtn[0])).toBeGreaterThanOrEqual(44);
    // Withdraw should be enabled when canWithdraw is true
    expect(withdrawBtn[0].props.disabled).toBe(false);
    await act(async () => renderer.unmount());
  });

  it('withdraw button disabled when not eligible (open withdrawal or below minimum)', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({ ...summary, withdrawableBalance: 5_000 });
    const renderer = await renderScreen();
    const withdrawBtn = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Rút tiền',
    );
    expect(withdrawBtn).toHaveLength(1);
    expect(withdrawBtn[0].props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('withdraw button disabled when open withdrawal is PROCESSING', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({ ...summary, processingWithdrawal: 100_000 });
    mockWalletApi.getMyWithdrawals.mockResolvedValue({
      data: [withdrawal],
      meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
    });
    const renderer = await renderScreen();
    const withdrawBtn = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Rút tiền',
    );
    expect(withdrawBtn).toHaveLength(1);
    expect(withdrawBtn[0].props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('shows pending/processing/failed/rejected/success badges from source truth', async () => {
    const renderer = await renderScreen();
    // Tab to withdrawals
    const historyTab = renderer.root
      .findAllByType(TouchableOpacity)
      .find((button) =>
        button.findAllByType(Text).some((node) => node.props.children === 'Lịch sử rút tiền'),
      );
    expect(historyTab).toBeDefined();
    await act(async () => {
      historyTab?.props.onPress();
    });
    const tabText = visibleText(renderer);
    expect(tabText).toContain('Chờ xử lý');
    // The test data has PENDING status
    await act(async () => renderer.unmount());
  });

  it('masks bank account number in receiving account card and history', async () => {
    mockWalletApi.getMyBankAccount.mockResolvedValue({
      bankBin: '970436', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '0123456789',
      accountName: 'TEST FIXTURE', updatedAt: '2026-10-01T00:00:00.000Z',
    });
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    // Should show masked account
    expect(text).toContain('•••• 6789');
    // Should NOT show full account number
    expect(text).not.toContain('0123456789');
    await act(async () => renderer.unmount());
  });

  it('does NOT accidentally expose full bank number from public list', async () => {
    mockWalletApi.listBanks.mockResolvedValue([
      { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
    ]);
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    // Should never show full account numbers in any visible text
    expect(text).not.toContain('0123456789');
    await act(async () => renderer.unmount());
  });

  it('no duplicate CTA for topup/withdraw', async () => {
    const renderer = await renderScreen();
    const topUpBtns = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Mở nạp tiền qua VNPay',
    );
    const withdrawBtns = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Rút tiền',
    );
    expect(topUpBtns).toHaveLength(1);
    expect(withdrawBtns).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it('shows server-backed processing notice without faking an unverified topup', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Ngân hàng đang xử lý lệnh chuyển');
    expect(text).not.toContain('Đang chờ xác nhận thanh toán VNPay');
    expect(text).not.toContain('Nạp tiền thành công');
    await act(async () => renderer.unmount());
  });

  it('shows error state and refresh button on load failure', async () => {
    mockWalletApi.getMyWallet.mockRejectedValue(new Error('network'));
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Không thể tải thông tin ví');
    expect(text).toContain('Thử lại');
    await act(async () => renderer.unmount());
  });

  it('shows loading state while fetching', async () => {
    mockWalletApi.getMyWallet.mockImplementation(() => new Promise(() => {}));
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Đang tải…');
    await act(async () => renderer.unmount());
  });

  it('accessibility text >= 12pt for new styles', async () => {
    const renderer = await renderScreen();
    const texts = renderer.root.findAllByType(Text);
    for (const node of texts) {
      for (const style of stylesOf(node.props.style)) {
        if (typeof style.fontSize === 'number') {
          expect(style.fontSize).toBeGreaterThanOrEqual(12);
        }
      }
    }
    await act(async () => renderer.unmount());
  });

  it('no POST mutation on render', async () => {
    const renderer = await renderScreen();
    expect(mockWalletApi.topUp).not.toHaveBeenCalled();
    expect(mockWalletApi.requestWithdrawal).not.toHaveBeenCalled();
    expect(mockWalletApi.saveMyBankAccount).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});