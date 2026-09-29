import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ServiceOrderItem } from '../../api/orders.api';

const ORDER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
let mockOrderDetailTargetResult: string | null = ORDER_ID;
const mockNavigate = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());

const order: ServiceOrderItem = {
  id: ORDER_ID,
  bookingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  code: 'FH-20260929-TEST',
  serviceName: 'Vệ sinh & nạp gas điều hòa',
  status: 'UNDER_REPAIR',
  customerName: 'Khách hàng',
  customerPhone: '',
  addressSummary: '',
  scheduledAt: '2026-09-29T02:00:00.000Z',
  laborTotal: 250000,
  partsTotal: 0,
  grandTotal: 250000,
  paymentStatus: 'UNPAID',
  technician: { id: 'tech-user', fullName: 'Kỹ thuật viên A' },
  createdAt: '2026-09-29T02:00:00.000Z',
} as ServiceOrderItem;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => undefined,
  useNavigation: () => ({
    navigate: mockNavigate,
    addListener: mockAddListener,
    isFocused: () => true,
  }),
}));

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

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
}));

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563EB',
      primaryTint: '#DBEAFE',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#64748B',
      border: '#E2E8F0',
      divider: '#E2E8F0',
      error: '#DC2626',
    },
    spacing: {},
    fontSize: {},
  }),
}));

jest.mock('../../hooks/useScrollHideTabBar', () => ({
  useScrollHideTabBar: () => jest.fn(),
}));

jest.mock('../../components/customer/CustomerSkeleton', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../store/auth.store', () => ({
  useAuthStore: Object.assign(jest.fn(), {
    getState: () => ({ user: { id: 'customer-a' } }),
    subscribe: jest.fn(() => jest.fn()),
  }),
}));

jest.mock('../../api/bookings.api', () => ({
  bookingsApi: {
    getMyBookingsPage: jest.fn(),
    getBooking: jest.fn(),
    cancelBooking: jest.fn(),
    reschedule: jest.fn(),
  },
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: {
    getMyOrders: jest.fn(),
    getMyOrdersPage: jest.fn(),
  },
}));

jest.mock('./customer-booking-manage', () => ({
  canCancelBookingConservative: () => false,
  canRescheduleBookingConservative: () => false,
  cancelBookingConservative: jest.fn(),
  rescheduleBookingConservative: jest.fn(),
}));

jest.mock('./customer-bookings-history', () => ({
  createBookingsHistoryLoader: () => ({
    focus: jest.fn(),
    blur: jest.fn(),
    refresh: jest.fn(),
    loadMore: jest.fn(),
    loadMoreOrders: jest.fn(),
  }),
  customerBookingsUserId: () => 'customer-a',
  getCachedHistoryState: () => ({
    bookings: [],
    total: 0,
    loading: false,
    refreshing: false,
    loadingMore: false,
    loadingMoreOrders: false,
    error: null,
    ordersError: null,
  }),
  linkedReplacementState: () => null,
  orderTotalText: () => '250.000 ₫',
  resolveBookingsView: () => ({
    cards: [{ kind: 'order', order }],
    filtered: [{ kind: 'order', order }],
    showList: true,
    emptyNote: null,
    showLoadMore: false,
    showLoadMoreOrders: false,
    ordersCoverageText: null,
    ordersCoverageComplete: true,
  }),
  resumeTargetFor: () => null,
}));

jest.mock('./customer-order-detail', () => ({
  orderDetailTarget: () => mockOrderDetailTargetResult,
}));

function screenElement() {
  const { default: CustomerBookingsScreen } = jest.requireActual('./CustomerBookingsScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerBookingsScreen);
}

function mountScreen(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(screenElement());
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrderDetailTargetResult = ORDER_ID;
});

describe('CustomerBookingsScreen order-detail affordance', () => {
  it('shows a chevron on a ServiceOrder summary when the row opens detail', () => {
    const tree = mountScreen();
    try {
      expect(
        tree.root.findAllByType(Text).filter((node) => node.props.testID === 'icon-chevron-forward'),
      ).toHaveLength(1);
      const detailRows = tree.root.findAllByType(TouchableOpacity).filter(
        (node) => node.props.accessibilityLabel === 'Xem chi tiết đơn sửa chữa',
      );
      expect(detailRows).toHaveLength(1);
      act(() => detailRows[0].props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerOrderDetail', { serviceOrderId: ORDER_ID });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not show a detail chevron when the ServiceOrder target is invalid', () => {
    mockOrderDetailTargetResult = null;
    const tree = mountScreen();
    try {
      expect(
        tree.root.findAllByType(Text).filter((node) => node.props.testID === 'icon-chevron-forward'),
      ).toHaveLength(0);
      const labels = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      expect(labels.join('\n')).toContain('Vệ sinh & nạp gas điều hòa');
    } finally {
      act(() => tree.unmount());
    }
  });
});
