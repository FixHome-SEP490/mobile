import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { walletApi } from '../../api/wallet.api';
import type { WalletSummary, WithdrawalRequest } from '../../types/wallet.types';
import TechnicianWalletScreen from './TechnicianWalletScreen';

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

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      background: '#ffffff',
      surface: '#ffffff',
      text: '#1a1714',
      textSecondary: '#5c554c',
      primary: '#2563eb',
      primaryStrong: '#1d4ed8',
      primarySoft: '#eff6ff',
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
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
      ReactModule.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View);
  return {
    AlertCircle: Icon,
    AlertTriangle: Icon,
    ArrowDownToLine: Icon,
    ChevronLeft: Icon,
    Landmark: Icon,
    Plus: Icon,
  };
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

function renderedText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    })
    .join('\n')
    .replace(/\u00a0/g, ' ');
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
  mockWalletApi.getMyBankAccount.mockResolvedValue(null);
  mockWalletApi.listBanks.mockResolvedValue([]);
});

describe('technician wallet presentation', () => {
  it('shows backend available, pending, and processing amounts as separate values', async () => {
    const renderer = await renderScreen();
    const text = renderedText(renderer);

    expect(text).toContain('Số dư khả dụng');
    expect(text).toContain('780.000 ₫');
    expect(text).toContain('Chờ rút');
    expect(text).toContain('120.000 ₫');
    expect(text).toContain('Đang chuyển');
    expect(text).toContain('80.000 ₫');
    expect(text).toContain('Khoản đang chuyển đã được trừ khỏi số dư ví.');
    expect(text).toContain('Mức tối thiểu để nhận việc: 200.000 ₫');
    expect(text).toContain('Đủ điều kiện nhận việc');
    expect(mockWalletApi.topUp).not.toHaveBeenCalled();
    expect(mockWalletApi.requestWithdrawal).not.toHaveBeenCalled();
    expect(mockWalletApi.saveMyBankAccount).not.toHaveBeenCalled();
  });

  it('masks the withdrawal account in visible and accessibility text', async () => {
    const renderer = await renderScreen();
    const historyTab = renderer.root
      .findAllByType(TouchableOpacity)
      .find((button) =>
        button.findAllByType(Text).some((node) => node.props.children === 'Lịch sử rút tiền'),
      );

    expect(historyTab).toBeDefined();
    await act(async () => {
      historyTab?.props.onPress();
    });

    const accountRow = renderer.root
      .findAllByType(Text)
      .find((node) => String(node.props.children).includes('Vietcombank'));

    expect(accountRow).toBeDefined();
    expect(accountRow?.props.children).toEqual(['Vietcombank', ' · ', '•••• 6789']);
    expect(accountRow?.props.accessibilityLabel).toBe('Vietcombank, tài khoản •••• 6789');
    expect(JSON.stringify(accountRow?.props)).not.toContain('0123456789');
  });

  it('does not turn a missing processing amount into a displayed zero', async () => {
    mockWalletApi.getMyWallet.mockResolvedValue({ ...summary, processingWithdrawal: undefined });
    const renderer = await renderScreen();

    expect(renderedText(renderer)).toContain('Chưa xác định');
  });
});
