import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ServiceOrderItem } from '../../api/orders.api';
import type { EarningsSummary } from './technician-earnings';
import { fetchAllOrders, summarizeEarnings } from './technician-earnings';
import TechnicianEarningsScreen from './TechnicianEarningsScreen';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => undefined, // live refresh needs the focus hook; the socket is not under test here
  useNavigation: () => ({ getParent: () => null, goBack: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: { getTechnicianJobsPage: jest.fn() },
}));

jest.mock('./technician-earnings', () => ({
  fetchAllOrders: jest.fn(),
  summarizeEarnings: jest.fn(),
}));

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      background: '#ffffff',
      surface: '#ffffff',
      text: '#1a1714',
      textSecondary: '#5c554c',
      primaryStrong: '#1d4ed8',
      primaryTint: '#bfdbfe',
      primarySoft: '#eff6ff',
      border: '#e2ddd6',
      divider: '#e2ddd6',
      error: '#b42318',
      tone: {
        warning: { bg: '#fef6e0', fg: '#b07d00', text: '#805b00' },
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
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View);
  return {
    AlertTriangle: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Info: Icon,
    WalletCards: Icon,
  };
});

jest.mock('../../components/customer/CustomerSkeleton', () => () => null);

const mockFetchAllOrders = fetchAllOrders as jest.MockedFunction<typeof fetchAllOrders>;
const mockSummarizeEarnings = summarizeEarnings as jest.MockedFunction<typeof summarizeEarnings>;

const earningsSummary: EarningsSummary = {
  weeks: [{ key: '2026-10-05', label: '05/10', amount: 300_000, count: 1 }],
  months: [{ key: '2026-10', label: 'T10', amount: 300_000, count: 1 }],
  totalAmount: 300_000,
  totalCount: 1,
  best: null,
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
    renderer = create(React.createElement(TechnicianEarningsScreen));
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAllOrders.mockResolvedValue({ orders: [], truncated: false });
  mockSummarizeEarnings.mockReturnValue(earningsSummary);
});

describe('technician earnings presentation', () => {
  it('discloses loaded-order estimates and warns when the list is truncated', async () => {
    mockFetchAllOrders.mockResolvedValue({ orders: [], truncated: true });
    const renderer = await renderScreen();
    const text = renderedText(renderer);

    expect(text).toContain('Tổng tiền theo đơn');
    expect(text).toContain('Ước tính từ các đơn đã tải');
    expect(text).toContain('Chỉ tính trên các đơn hoàn thành gần đây nhất đã tải');
    expect(text).toContain('đơn hoàn thành đã tải');
    expect(text).toContain('chưa xác nhận thanh toán');
    expect(text).toContain('không phải số dư ví');
  });

  it('warns that displayed earnings may be stale after a failed refresh', async () => {
    mockFetchAllOrders
      .mockResolvedValueOnce({ orders: [], truncated: false })
      .mockRejectedValueOnce(new Error('offline'));
    const renderer = await renderScreen();
    const refreshControl = renderer.root.findByType(ScrollView).props.refreshControl;

    await act(async () => {
      refreshControl.props.onRefresh();
    });

    expect(renderedText(renderer)).toContain('Không cập nhật được dữ liệu mới');
    expect(renderedText(renderer)).toContain('dữ liệu đã tải trước đó');
    expect(renderedText(renderer)).toContain('chưa xác nhận thanh toán');
  });

  it('purges stale income after a confirmed historical page even if the next page times out', async () => {
    const previousFull = { id: 'revoked', code: 'SO-OLD', status: 'COMPLETED',
      laborTotal: 750000, grandTotal: 750000 } as ServiceOrderItem;
    mockFetchAllOrders.mockResolvedValueOnce({ orders: [previousFull], truncated: false })
      .mockImplementationOnce(async (_getPage, _maxPages, onHistorical) => {
        onHistorical?.(['revoked']);
        throw new Error('next page timeout');
      });
    const renderer = await renderScreen();
    expect(mockSummarizeEarnings.mock.lastCall?.[0]).toEqual([previousFull]);
    const refreshControl = renderer.root.findByType(ScrollView).props.refreshControl;
    await act(async () => { refreshControl.props.onRefresh(); });
    expect(mockSummarizeEarnings.mock.lastCall?.[0]).toEqual([]);
    expect(mockFetchAllOrders).toHaveBeenCalledTimes(2);
  });

});
