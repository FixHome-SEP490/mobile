import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
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
const mockCounts = {
  repair: { all: 6, in_progress: 2, completed: 3, cancelled: 1 },
  request: { all: 42, no_technician: 33, sent: 4, cancelled: 5 },
};
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
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) };
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

jest.mock('../../components/BookingRescheduleSheet', () => ({ __esModule: true, default: () => null }));
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
    getActivityCounts: jest.fn(() => Promise.resolve(mockCounts)),
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

const mockLoader = {
  focus: jest.fn(),
  blur: jest.fn(),
  refresh: jest.fn(),
  loadMore: jest.fn(),
  loadMoreOrders: jest.fn(),
};

jest.mock('./customer-bookings-history', () => ({
  createBookingsHistoryLoader: () => mockLoader,
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
  isRepairCard: (card: { kind: string; order: unknown }) => card.kind === 'order' || card.order !== null,
  requestStage: (card: { order: unknown }) => (card.order ? 'no_tech' : 'sent'),
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

/** Mounts and lets the server counts arrive. */
async function mountCounted(): Promise<ReactTestRenderer> {
  const tree = mountScreen();
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrderDetailTargetResult = ORDER_ID;
  mockBookingManageAllowed = false;
});

describe('CustomerBookingsScreen order-detail affordance', () => {
  it('lets the list scroll clear of the whole tab bar', () => {
    const tree = mountScreen();
    try {
      // 64 pill + 34 home indicator + 16 gap
      const list = tree.root.findAllByType(ScrollView).find((node) => node.props.refreshControl);
      expect(StyleSheet.flatten(list!.props.contentContainerStyle).paddingBottom).toBe(114);
    } finally {
      act(() => tree.unmount());
    }
  });
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

  it('shows repairs and booking requests as two tabs with counts, one list at a time', async () => {
    const historyMock = jest.requireMock('./customer-bookings-history') as {
      resolveBookingsView: (...args: unknown[]) => unknown;
      resumeTargetFor: (...args: unknown[]) => string | null;
    };
    const originalResolve = historyMock.resolveBookingsView;
    const originalResume = historyMock.resumeTargetFor;
    const requestCard = { kind: 'booking', booking, order: null };
    const orderCard = { kind: 'order', order };
    historyMock.resolveBookingsView = () => ({
      cards: [requestCard, orderCard], filtered: [requestCard, orderCard], showList: true, emptyNote: null,
      showLoadMore: false, showLoadMoreOrders: false, ordersCoverageText: null, ordersCoverageComplete: true,
    });
    historyMock.resumeTargetFor = () => null // nothing needs the customer's action;
    const tree = await mountCounted();
    try {
      const tab = (id: string) => tree.root.findAllByProps({ testID: `activity-kind-${id}` }).find((node) => node.props.accessibilityRole === 'tab')!;
      expect(tab('repair').props.accessibilityLabel).toBe('Đơn sửa chữa, 6');
      expect(tab('request').props.accessibilityLabel).toBe('Yêu cầu đặt lịch, 42');
      // Repairs open first when nothing needs action, and the request list is not drawn under them.
      expect(tab('repair').props.accessibilityState.selected).toBe(true);
      expect(tree.root.findAllByProps({ testID: 'activity-action-required-section' })).toHaveLength(0);
      act(() => tab('request').props.onPress());
      expect(tab('request').props.accessibilityState.selected).toBe(true);
      expect(tab('repair').props.accessibilityState.selected).toBe(false);
      expect(tree.root.findAllByProps({ testID: 'activity-kind-empty' })).toHaveLength(0);
    } finally {
      act(() => tree.unmount());
      historyMock.resolveBookingsView = originalResolve;
      historyMock.resumeTargetFor = originalResume;
    }
  });

  it('stays on the repairs and only flags the requests tab when a request needs the customer', async () => {
    const historyMock = jest.requireMock('./customer-bookings-history') as {
      resolveBookingsView: (...args: unknown[]) => unknown;
      resumeTargetFor: (...args: unknown[]) => string | null;
    };
    const originalResolve = historyMock.resolveBookingsView;
    const originalResume = historyMock.resumeTargetFor;
    const requestCard = { kind: 'booking', booking, order: null };
    const orderCard = { kind: 'order', order };
    historyMock.resolveBookingsView = () => ({
      cards: [requestCard, orderCard], filtered: [requestCard, orderCard], showList: true, emptyNote: null,
      showLoadMore: false, showLoadMoreOrders: false, ordersCoverageText: null, ordersCoverageComplete: true,
    });
    historyMock.resumeTargetFor = (target: unknown) => ((target as { id?: string }).id === BOOKING_ID ? BOOKING_ID : null);
    const tree = await mountCounted();
    try {
      const tab = (id: string) => tree.root.findAllByProps({ testID: `activity-kind-${id}` }).find((node) => node.props.accessibilityRole === 'tab')!;
      expect(tab('repair').props.accessibilityState.selected).toBe(true);
      expect(tab('request').props.accessibilityLabel).toBe('Yêu cầu đặt lịch, 42, 1 cần bạn xử lý');
      act(() => tab('request').props.onPress());
      expect(tab('request').props.accessibilityState.selected).toBe(true);
    } finally {
      act(() => tree.unmount());
      historyMock.resolveBookingsView = originalResolve;
      historyMock.resumeTargetFor = originalResume;
    }
  });

  it('filters requests by stage: no technician yet, sent, cancelled', async () => {
    const historyMock = jest.requireMock('./customer-bookings-history') as {
      resolveBookingsView: (...args: unknown[]) => unknown;
      isRepairCard: (card: unknown) => boolean;
      requestStage: (card: unknown) => string;
    };
    const saved = { ...historyMock };
    const sent = { kind: 'booking', booking, order: null };
    const lost = { kind: 'booking', booking: { ...booking, id: 'booking-lost' }, order };
    const cancelled = { kind: 'booking', booking: { ...booking, id: 'booking-cancelled' }, order: null };
    historyMock.resolveBookingsView = () => ({
      cards: [sent, lost, cancelled], filtered: [sent, lost, cancelled], showList: true, emptyNote: null,
      showLoadMore: false, showLoadMoreOrders: false, ordersCoverageText: null, ordersCoverageComplete: true,
    });
    historyMock.isRepairCard = () => false;
    historyMock.requestStage = (card: unknown) => (card === lost ? 'no_tech' : card === cancelled ? 'cancelled' : 'sent');
    const tree = await mountCounted();
    try {
      act(() => tree.root.findAllByProps({ testID: 'activity-kind-request' }).find((node) => node.props.accessibilityRole === 'tab')!.props.onPress());
      const chip = (id: string) => tree.root.findAllByProps({ testID: id }).find((node) => node.props.accessibilityRole === 'tab')!;
      expect(chip('activity-request-filter-all').props.accessibilityLabel).toBe('Tất cả (42)');
      expect(chip('activity-request-filter-no-tech').props.accessibilityLabel).toBe('Chưa có thợ (33)');
      expect(chip('activity-request-filter-sent').props.accessibilityLabel).toBe('Đã gửi (4)');
      expect(chip('activity-request-filter-cancelled').props.accessibilityLabel).toBe('Đã hủy (5)');
      expect(tree.root.findAllByProps({ testID: 'activity-filter-open' })).toHaveLength(0);
      const shown = (id: string) => tree.root.findAllByProps({ testID: `booking-card-detail-${id}` }).length > 0;
      act(() => chip('activity-request-filter-cancelled').props.onPress());
      expect(chip('activity-request-filter-cancelled').props.accessibilityState.selected).toBe(true);
      expect(shown('booking-cancelled')).toBe(true);
      expect(shown(BOOKING_ID)).toBe(false);
    } finally {
      act(() => tree.unmount());
      Object.assign(historyMock, saved);
    }
  });
});

describe('CustomerBookingsScreen loads more pages by itself while scrolling', () => {
  const defaultView = mockResolveBookingsView.getMockImplementation();
  afterEach(() => { if (defaultView) mockResolveBookingsView.mockImplementation(defaultView); });
  const withMore = (over: Record<string, unknown> = {}) => {
    mockResolveBookingsView.mockImplementation(() => ({
      cards: [], filtered: [], showList: true, emptyNote: null, showLoadMore: true, showLoadMoreOrders: false,
      ordersCoverageText: null, ordersCoverageComplete: true, ...over,
    }));
  };
  const list = (tree: ReactTestRenderer) => tree.root.findAllByType(ScrollView).find((node) => node.props.refreshControl)!;
  const scroll = (tree: ReactTestRenderer, offset: number, viewport: number, content: number) => act(() => {
    list(tree).props.onScroll({ nativeEvent: { contentOffset: { y: offset }, layoutMeasurement: { height: viewport }, contentSize: { height: content } } });
  });

  it('loads the next page when the end comes near, never before, and has no "Tải thêm" button', () => {
    withMore();
    const tree = mountScreen();
    try {
      act(() => tree.root.findAllByProps({ testID: 'activity-kind-request' }).find((node) => node.props.accessibilityRole === 'tab')!.props.onPress());
      scroll(tree, 0, 600, 3000); // far from the end
      expect(mockLoader.loadMore).not.toHaveBeenCalled();
      scroll(tree, 2100, 600, 3000); // within 400 of the end
      expect(mockLoader.loadMore).toHaveBeenCalledTimes(1);
      expect(tree.root.findAllByProps({ accessibilityLabel: 'Tải thêm lịch sử đặt lịch' })).toHaveLength(0);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('loads one extra page when the list is too short to scroll, and the orders after the bookings', () => {
    withMore({ showLoadMore: false, showLoadMoreOrders: true });
    const tree = mountScreen();
    try {
      act(() => { list(tree).props.onLayout({ nativeEvent: { layout: { height: 800 } } }); });
      act(() => { list(tree).props.onContentSizeChange(0, 300); });
      expect(mockLoader.loadMore).not.toHaveBeenCalled();
      expect(mockLoader.loadMoreOrders).toHaveBeenCalledTimes(1);
      // One extra page for a short list, not the whole history: further growth does not chain more loads.
      act(() => { list(tree).props.onContentSizeChange(0, 400); });
      expect(mockLoader.loadMoreOrders).toHaveBeenCalledTimes(1);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('loads only orders on the repairs tab, and the counts stay the server totals while pages load', async () => {
    withMore({ showLoadMore: true, showLoadMoreOrders: true });
    const tree = await mountCounted();
    try {
      scroll(tree, 2100, 600, 3000);
      expect(mockLoader.loadMore).not.toHaveBeenCalled();
      expect(mockLoader.loadMoreOrders).toHaveBeenCalledTimes(1);
      const tab = (id: string) => tree.root.findAllByProps({ testID: `activity-kind-${id}` }).find((node) => node.props.accessibilityRole === 'tab')!;
      expect(tab('repair').props.accessibilityLabel).toBe('Đơn sửa chữa, 6');
      expect(tab('request').props.accessibilityLabel).toBe('Yêu cầu đặt lịch, 42');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('stays quiet when there is nothing more to load', () => {
    withMore({ showLoadMore: false, showLoadMoreOrders: false });
    const tree = mountScreen();
    try {
      scroll(tree, 2900, 600, 3000);
      expect(mockLoader.loadMore).not.toHaveBeenCalled();
      expect(mockLoader.loadMoreOrders).not.toHaveBeenCalled();
    } finally {
      act(() => tree.unmount());
    }
  });
});

describe('CustomerBookingsScreen real Activity filters (C-NATIVE-05)', () => {
  it('offers all, in progress, completed and cancelled filters like the web and passes the selected bucket to the existing real-data resolver', () => {
    const tree = mountScreen();
    try {
      const open = tree.root.findByProps({ testID: 'activity-filter-open' });
      const history = tree.root.findByProps({ testID: 'activity-filter-history' });
      const all = tree.root.findByProps({ testID: 'activity-filter-all' });
      expect(open.props.accessibilityState.selected).toBe(true);
      const cancelled = tree.root.findByProps({ testID: 'activity-filter-cancelled' });
      expect(open.props.accessibilityLabel).toBe('Đang xử lý');
      expect(history.props.accessibilityLabel).toBe('Hoàn tất');
      expect(cancelled.props.accessibilityLabel).toBe('Đã hủy');
      expect(all.props.accessibilityLabel).toMatch(/^Tất cả/);

      act(() => history.props.onPress());
      expect(mockResolveBookingsView).toHaveBeenLastCalledWith(expect.any(Object), '', 'completed');
      act(() => cancelled.props.onPress());
      expect(mockResolveBookingsView).toHaveBeenLastCalledWith(expect.any(Object), '', 'cancelled');
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
