// Technician T-RUI4: real Earnings + Wallet presentation tests.
// Earnings is PRIMARY; Wallet/Transactions stay prominent. Money shown is
// source-backed only (available/withdrawable/pending/processing/minimum
// balance + eligibility). No fake bonus or payment-success copy; stale and
// truncated lists carry honest disclaimers. Controller callbacks, POST
// top-up/withdraw/bank operations, API, permissions and balance math are
// covered elsewhere; this file only asserts what the screens render.
// No network, no device, no real financial actions.
import React from 'react';
import { Modal, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { EarningsSummary } from './technician-earnings';
import { fetchAllOrders, summarizeEarnings } from './technician-earnings';
import { walletApi } from '../../api/wallet.api';
import type { WalletSummary, WithdrawalRequest } from '../../types/wallet.types';
import TechnicianEarningsScreen from './TechnicianEarningsScreen';
import TechnicianWalletScreen from './TechnicianWalletScreen';

let mockReduceMotion = false;

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useNavigation: () => ({
      getParent: () => null,
      goBack: jest.fn(),
      navigate: jest.fn(),
    }),
    useFocusEffect: (callback: () => void | (() => void)) =>
      ReactModule.useEffect(callback, [callback]),
  };
});

jest.mock('../../store', () => ({
  useAuthStore: () => ({ user: { id: 'tech-a' } }),
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: { getMyOrdersPage: jest.fn() },
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

jest.mock('./technician-earnings', () => ({
  fetchAllOrders: jest.fn(),
  summarizeEarnings: jest.fn(),
}));

jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: () => mockReduceMotion,
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

jest.mock('../../components/customer/CustomerSkeleton', () => () => null);

jest.mock('../../components/StatusBadge', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ view }: { view: { label: string } }) =>
    ReactModule.createElement(NativeText, null, view.label);
});

const mockFetchAllOrders = fetchAllOrders as jest.MockedFunction<typeof fetchAllOrders>;
const mockSummarizeEarnings = summarizeEarnings as jest.MockedFunction<typeof summarizeEarnings>;
const mockWalletApi = walletApi as jest.Mocked<typeof walletApi>;

const earningsSummary: EarningsSummary = {
  weeks: [{ key: '2026-10-05', label: '05/10', amount: 300_000, count: 1 }],
  months: [{ key: '2026-10', label: 'T10', amount: 300_000, count: 1 }],
  totalAmount: 300_000,
  totalCount: 1,
  best: null,
};

const walletSummary: WalletSummary = {
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

async function renderEarnings(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(TechnicianEarningsScreen));
  });
  return renderer;
}

async function renderWallet(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(TechnicianWalletScreen));
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
  mockFetchAllOrders.mockResolvedValue({ orders: [], truncated: false });
  mockSummarizeEarnings.mockReturnValue(earningsSummary);
  mockWalletApi.getMyWallet.mockResolvedValue(walletSummary);
  mockWalletApi.getMyTransactions.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 15, total: 0, totalPages: 1 },
  });
  mockWalletApi.getMyWithdrawals.mockResolvedValue({
    data: [withdrawal],
    meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
  });
  mockWalletApi.getMyBankAccount.mockResolvedValue(null);
  mockWalletApi.listBanks.mockResolvedValue([]);
});

describe('technician finance real UI (T-RUI4)', () => {
  it('keeps earnings primary with a prominent wallet shortcut and honest source wording', async () => {
    const renderer = await renderEarnings();
    const text = visibleText(renderer);

    expect(text).toContain('Thu nhập');
    expect(text).toContain('Ví & giao dịch');
    expect(text).toContain('Số dư, điều kiện nhận việc, nạp/rút và lịch sử giao dịch');
    expect(text).toContain('Tổng tiền theo đơn');
    expect(text).toContain('Ước tính từ các đơn đã tải');
    expect(text).toContain('chưa xác nhận thanh toán');
    expect(text).toContain('không phải số dư ví');
    // No fake bonus or payment-success copy.
    expect(text).not.toMatch(/thưởng|khuyến mãi/i);
    expect(text).not.toContain('Thanh toán thành công');
    expect(text).not.toContain('Nạp tiền thành công');
    await act(async () => renderer.unmount());
  });

  it('shows loading copy while earnings fetch and keeps stale/truncated disclaimers', async () => {
    mockFetchAllOrders.mockImplementation(() => new Promise(() => undefined));
    mockSummarizeEarnings.mockReturnValue(earningsSummary);
    const loadingRenderer = await renderEarnings();
    expect(visibleText(loadingRenderer)).toContain('Đang tải…');
    await act(async () => loadingRenderer.unmount());

    mockFetchAllOrders.mockResolvedValue({ orders: [], truncated: true });
    const truncatedRenderer = await renderEarnings();
    expect(visibleText(truncatedRenderer)).toContain(
      'Chỉ tính trên các đơn hoàn thành gần đây nhất đã tải',
    );
    await act(async () => truncatedRenderer.unmount());
  });

  it('shows source-backed wallet balances, eligibility and masked own account', async () => {
    const renderer = await renderWallet();
    const text = visibleText(renderer);

    expect(text).toContain('Ví của tôi');
    expect(text).toContain('Số dư ví');
    expect(text).toContain('Số dư khả dụng');
    expect(text).toContain('780.000 ₫');
    expect(text).toContain('Có thể rút');
    expect(text).toContain('Chờ rút');
    expect(text).toContain('120.000 ₫');
    expect(text).toContain('Đang chuyển');
    expect(text).toContain('80.000 ₫');
    expect(text).toContain('Khoản đang chuyển đã được trừ khỏi số dư ví.');
    expect(text).toContain('Mức tối thiểu để nhận việc: 200.000 ₫');
    expect(text).toContain('Đủ điều kiện nhận việc');
    expect(text).toContain('Biến động số dư');
    expect(text).toContain('Lịch sử rút tiền');
    // Withdrawal accounts are masked to the last four digits only.
    const historyTab = renderer.root
      .findAllByType(TouchableOpacity)
      .find((button) =>
        button.findAllByType(Text).some((node) => node.props.children === 'Lịch sử rút tiền'),
      );
    expect(historyTab).toBeDefined();
    await act(async () => {
      historyTab?.props.onPress();
    });
    const masked = visibleText(renderer);
    expect(masked).toContain('•••• 6789');
    expect(masked).not.toContain('0123456789');
    const accountRow = renderer.root
      .findAllByType(Text)
      .find((node) => String(node.props.children).includes('Vietcombank'));
    expect(accountRow).toBeDefined();
    expect(accountRow?.props.accessibilityLabel).toBe('Vietcombank, tài khoản •••• 6789');
    expect(JSON.stringify(accountRow?.props)).not.toContain('0123456789');
    // No fake bonus or payment-success copy.
    expect(text).not.toMatch(/thưởng|khuyến mãi/i);
    expect(text).not.toContain('Thanh toán thành công');
    expect(mockWalletApi.topUp).not.toHaveBeenCalled();
    expect(mockWalletApi.requestWithdrawal).not.toHaveBeenCalled();
    expect(mockWalletApi.saveMyBankAccount).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('disables modal animation when Reduce Motion is on', async () => {
    const renderer = await renderWallet();
    const topUpButton = renderer.root.findAll(
      (node) =>
        node.type === TouchableOpacity &&
        node.props.accessibilityLabel === 'Mở nạp tiền qua VNPay',
    );
    expect(topUpButton).toHaveLength(1);
    await act(async () => {
      topUpButton[0].props.onPress();
    });
    const faded = renderer.root.findAllByType(Modal);
    expect(faded.length).toBeGreaterThan(0);
    expect(faded[0].props.animationType).toBe('fade');
    await act(async () => renderer.unmount());

    mockReduceMotion = true;
    const stillRenderer = await renderWallet();
    const stillButton = stillRenderer.root.findAll(
      (node) =>
        node.type === TouchableOpacity &&
        node.props.accessibilityLabel === 'Mở nạp tiền qua VNPay',
    );
    await act(async () => {
      stillButton[0].props.onPress();
    });
    const still = stillRenderer.root.findAllByType(Modal);
    expect(still.length).toBeGreaterThan(0);
    expect(still[0].props.animationType).toBe('none');
    await act(async () => stillRenderer.unmount());
  });

  it('keeps every touch target at 44pt or more and every text size at 12 or more', async () => {
    const earnings = await renderEarnings();
    const wallet = await renderWallet();
    for (const renderer of [earnings, wallet]) {
      const touchables = renderer.root.findAllByType(TouchableOpacity);
      expect(touchables.length).toBeGreaterThan(0);
      for (const node of touchables) {
        expect(touchHeight(node)).toBeGreaterThanOrEqual(44);
      }
      const texts = renderer.root.findAllByType(Text);
      for (const node of texts) {
        for (const style of stylesOf(node.props.style)) {
          if (typeof style.fontSize === 'number') {
            expect(style.fontSize).toBeGreaterThanOrEqual(12);
          }
        }
      }
    }
    await act(async () => earnings.unmount());
    await act(async () => wallet.unmount());
  });
});
