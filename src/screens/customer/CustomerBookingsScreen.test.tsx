import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ServiceOrderItem } from '../../api/orders.api';

const ORDER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let mockOrderDetailTargetResult: string | null = ORDER_ID;
const mockNavigate = jest.fn();
let mockBookingManageAllowed = false;
const mockAddListener = jest.fn(() => jest.fn());

const booking = {
  id: BOOKING_ID,
  customerId: 'customer-a',
  serviceId: 'service-a',
  serviceName: 'Sửa điều hòa',
  addressId: 'address-a',
  addressSummary: '123 Đường Láng',
  description: 'Điều hòa không mát',
  preferredAt: '2026-09-29T02:00:00.000Z',
  urgency: 'NORMAL',
  status: 'SUBMITTED',
  createdAt: '2026-09-29T02:00:00.000Z',
};

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
const mockResolveBookingsView = jest.fn((_state: unknown, _query: string, _tab: string) => ({
  cards: [{ kind: 'order', order }],
  filtered: [{ kind: 'order', order }],
  showList: true,
  emptyNote: null,
  showLoadMore: false,
  showLoadMoreOrders: false,
  ordersCoverageText: null,
  ordersCoverageComplete: true,
}));

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
      tone: {
        success: { bg: '#DCFCE7', text: '#166534' },
        warning: { bg: '#FEF3C7', text: '#92400E' },
        danger: { bg: '#FEE2E2', text: '#991B1B' },
        info: { bg: '#DBEAFE', text: '#1E40AF' },
        repair: { bg: '#EDE9FE', text: '#5B21B6' },
        neutral: { bg: '#F1F5F9', text: '#475569' },
        violet: { bg: '#EDE9FE', text: '#5B21B6' },
      },
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
  canCancelBookingConservative: () => mockBookingManageAllowed,
  canRescheduleBookingConservative: () => mockBookingManageAllowed,
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
  resolveBookingsView: (state: unknown, query: string, tab: string) =>
    mockResolveBookingsView(state, query, tab),
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
  mockBookingManageAllowed = false;
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

describe('CustomerBookingsScreen activity ordering (C-RUI1)', () => {
  it('keeps history in one filter without duplicate history navigation', () => {
    const tree = mountScreen();
    try {
      const labels = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      expect(labels.join('\n')).toContain('Hoạt động');
      const historyButtons = tree.root.findAllByType(TouchableOpacity).filter(
        (node) => node.props.accessibilityLabel === 'Mở lịch sử sửa chữa',
      );
      expect(historyButtons).toHaveLength(0);
      const historyFilter = tree.root.findAllByType(TouchableOpacity).filter(
        (node) => node.props.testID === 'activity-filter-history',
      );
      expect(historyFilter).toHaveLength(1);
      act(() => historyFilter[0].props.onPress());
      expect(mockResolveBookingsView).toHaveBeenLastCalledWith(expect.anything(), '', 'completed');
      expect(historyFilter[0].props.accessibilityState.selected).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('renders action-required before ongoing with counts', () => {
    const historyMock = jest.requireMock('./customer-bookings-history') as {
      resolveBookingsView: (...args: unknown[]) => unknown;
      resumeTargetFor: (...args: unknown[]) => string | null;
    };
    const originalResolve = historyMock.resolveBookingsView;
    const originalResume = historyMock.resumeTargetFor;
    const bookingCard = { kind: 'booking', booking, order: null };
    const orderCard = { kind: 'order', order };
    historyMock.resolveBookingsView = () => ({
      cards: [bookingCard, orderCard],
      filtered: [bookingCard, orderCard],
      showList: true,
      emptyNote: null,
      showLoadMore: false,
      showLoadMoreOrders: false,
      ordersCoverageText: null,
      ordersCoverageComplete: true,
    });
    historyMock.resumeTargetFor = (target: unknown) =>
      (target as { id?: string }).id === BOOKING_ID ? BOOKING_ID : null;
    const tree = mountScreen();
    try {
      const actionNodes = tree.root.findAllByProps({ testID: 'activity-action-required-section' });
      const ongoingNodes = tree.root.findAllByProps({ testID: 'activity-ongoing-section' });
      const actionSection = actionNodes.find((node) => node.props.accessibilityRole === 'header') ?? actionNodes[0];
      const ongoingSection = ongoingNodes.find((node) => node.props.accessibilityRole === 'header') ?? ongoingNodes[0];
      expect(String(actionSection.props.accessibilityLabel)).toContain('Cần bạn xử lý');
      expect(String(ongoingSection.props.accessibilityLabel)).toContain('Đang diễn ra');
      const texts = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      const actionIndex = texts.findIndex((text) => text.includes('Cần bạn xử lý'));
      const ongoingIndex = texts.findIndex((text) => text.includes('Đang diễn ra'));
      expect(actionIndex).toBeGreaterThanOrEqual(0);
      expect(ongoingIndex).toBeGreaterThanOrEqual(0);
      expect(actionIndex).toBeLessThan(ongoingIndex);
    } finally {
      act(() => tree.unmount());
      historyMock.resolveBookingsView = originalResolve;
      historyMock.resumeTargetFor = originalResume;
    }
  });
});

describe('CustomerBookingsScreen real Activity filters (C-NATIVE-05)', () => {
  it('offers open, history, and all filters and passes the selected bucket to the existing real-data resolver', () => {
    const tree = mountScreen();
    try {
      const open = tree.root.findByProps({ testID: 'activity-filter-open' });
      const history = tree.root.findByProps({ testID: 'activity-filter-history' });
      const all = tree.root.findByProps({ testID: 'activity-filter-all' });
      expect(open.props.accessibilityState.selected).toBe(true);
      expect(history.props.accessibilityLabel).toBe('Lịch sử');
      expect(all.props.accessibilityLabel).toBe('Tất cả');

      act(() => history.props.onPress());
      expect(mockResolveBookingsView).toHaveBeenLastCalledWith(expect.any(Object), '', 'completed');
      act(() => all.props.onPress());
      expect(mockResolveBookingsView).toHaveBeenLastCalledWith(expect.any(Object), '', 'all');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('applies a search query to the existing paginated Booking and ServiceOrder view', () => {
    const tree = mountScreen();
    try {
      const search = tree.root.findByType(TextInput);
      expect(search.props.accessibilityLabel).toBe('Tìm yêu cầu hoặc đơn sửa chữa');
      act(() => search.props.onChangeText('điều hòa'));
      expect(mockResolveBookingsView).toHaveBeenLastCalledWith(expect.any(Object), 'điều hòa', 'in_progress');
    } finally {
      act(() => tree.unmount());
    }
  });
});


it('reveals Booking management options only on expansion and only when permission guards allow them', () => {
  const historyMock = jest.requireMock('./customer-bookings-history');
  const originalResolve = historyMock.resolveBookingsView;
  historyMock.resolveBookingsView = () => ({
    cards: [{ kind: 'booking', booking, order: null }],
    filtered: [{ kind: 'booking', booking, order: null }],
    showList: true, emptyNote: null, showLoadMore: false, showLoadMoreOrders: false,
    ordersCoverageText: null, ordersCoverageComplete: true,
  });
  mockBookingManageAllowed = true;
  const tree = mountScreen();
  const text = () => tree.root.findAllByType(Text).map((node) => String(node.props.children ?? '')).join(' ');
  try {
    expect(text()).not.toContain('Đổi lịch');
    expect(text()).not.toContain('Hủy yêu cầu');
    const options = tree.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === 'Tùy chọn yêu cầu');
    expect(options?.props.accessibilityState.expanded).toBe(false);
    act(() => options!.props.onPress());
    expect(text()).toContain('Đổi lịch');
    expect(text()).toContain('Hủy yêu cầu');
    mockBookingManageAllowed = false;
    act(() => tree.update(screenElement()));
    expect(text()).not.toContain('Đổi lịch');
    expect(text()).not.toContain('Hủy yêu cầu');
    expect(mockNavigate).not.toHaveBeenCalled();
  } finally {
    act(() => tree.unmount());
    historyMock.resolveBookingsView = originalResolve;
  }
});
