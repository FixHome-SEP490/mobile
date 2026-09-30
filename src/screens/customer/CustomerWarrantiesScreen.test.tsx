import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const COVERAGE_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_ID = '33333333-3333-4333-8333-333333333333';
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockGetRepairHistory = jest.fn();
const mockGetOrderWarranties = jest.fn();
const mockGetOrderWarrantyClaims = jest.fn();
const mockGetOrder = jest.fn();
const mockCreateWarrantyClaim = jest.fn();
const mockRespondWarrantyClaim = jest.fn();

jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactModule.useEffect(() => effect(), [effect]),
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: undefined }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactModule.createElement(Native.Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#3B82F6',
      primaryStrong: '#2563EB',
      primarySoft: '#EFF6FF',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#64748B',
      muted: '#94A3B8',
      border: '#E2E8F0',
      divider: '#F1F5F9',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
    },
  }),
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: {
    getRepairHistory: (...args: unknown[]) => mockGetRepairHistory(...args),
    getOrderWarranties: (...args: unknown[]) => mockGetOrderWarranties(...args),
    getOrderWarrantyClaims: (...args: unknown[]) => mockGetOrderWarrantyClaims(...args),
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
    createWarrantyClaim: (...args: unknown[]) => mockCreateWarrantyClaim(...args),
    respondWarrantyClaim: (...args: unknown[]) => mockRespondWarrantyClaim(...args),
  },
}));

function screenElement() {
  const { default: CustomerWarrantiesScreen } = jest.requireActual('./CustomerWarrantiesScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerWarrantiesScreen);
}

async function mountScreen(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(screenElement());
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepairHistory.mockResolvedValue({ data: [], total: 0 });
  mockGetOrderWarranties.mockResolvedValue([]);
  mockGetOrderWarrantyClaims.mockResolvedValue([]);
  mockCreateWarrantyClaim.mockResolvedValue({
    id: CLAIM_ID,
    serviceOrderId: ORDER_ID,
    warrantyCoverageId: COVERAGE_ID,
    status: 'submitted',
    description: 'Thiết bị bị lỗi trở lại sau sửa chữa.',
    evidenceRefs: null,
    submittedAfterExpiry: false,
    customerResponse: null,
    awaitingPrompt: null,
    resolutionNotes: null,
    submittedAt: '2026-09-30T00:00:00.000Z',
    resolvedAt: null,
    technician: null,
  });
});

describe('CustomerWarrantiesScreen', () => {
  it('shows an honest empty state when the customer has no completed warranty coverage', async () => {
    const tree = await mountScreen();
    expect(mockGetRepairHistory).toHaveBeenCalledWith(1, 10, 'completed');
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Chưa có hạng mục bảo hành')).toBe(true);
  });

  it('loads completed-order coverage and opens the real claim form', async () => {
    mockGetRepairHistory.mockResolvedValue({
      data: [{
        orderId: ORDER_ID,
        bookingId: '44444444-4444-4444-8444-444444444444',
        code: 'FH-001',
        status: 'completed',
        serviceName: 'Vệ sinh máy lạnh',
        technicianName: 'Nguyễn Văn A',
        laborTotal: 100000,
        partsTotal: 0,
        grandTotal: 100000,
        completedAt: '2026-09-29T00:00:00.000Z',
      }],
      total: 1,
    });
    mockGetOrderWarranties.mockResolvedValue([{
      id: COVERAGE_ID,
      serviceOrderId: ORDER_ID,
      warrantyDaysSnapshot: 30,
      note: 'Công sửa chữa',
      startsAt: '2026-09-29T00:00:00.000Z',
      expiresAt: '2026-10-29T00:00:00.000Z',
      status: 'ACTIVE',
    }]);
    mockGetOrderWarrantyClaims.mockResolvedValue([]);

    const tree = await mountScreen();
    expect(mockGetOrderWarranties).toHaveBeenCalledWith(ORDER_ID);
    expect(mockGetOrderWarrantyClaims).toHaveBeenCalledWith(ORDER_ID);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Vệ sinh máy lạnh')).toBe(true);

    const createButtons = tree.root.findAllByType(TouchableOpacity).filter((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Yêu cầu bảo hành'),
    );
    expect(createButtons.length).toBeGreaterThan(0);
    act(() => createButtons[0].props.onPress());
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Mô tả sự cố')).toBe(true);
  });
});
