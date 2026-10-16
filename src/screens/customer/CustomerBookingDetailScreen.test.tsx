import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockGetBooking = jest.fn();
const mockState: { booking: Record<string, unknown> | null; loading: boolean; refreshing: boolean; error: string | null } = {
  booking: null, loading: false, refreshing: false, error: 'Không thể tải chi tiết yêu cầu đặt lịch.',
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { bookingId: BOOKING_ID } }),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  // Read-only initial render: no authenticated GET, navigation or mutation.
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
    ReactModule.createElement(Native.View, props, children) };
});
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name) };
});
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF',
      background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A',
      textSecondary: '#64748B', muted: '#94A3B8', border: '#E2E8F0',
      divider: '#F1F5F9', success: '#059669', warning: '#D97706', error: '#B91C1C',
    },
  }),
}));
jest.mock('../../components/customer/CustomerSkeleton', () => () => null);
jest.mock('../../store/auth.store', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'customer-1' } }),
    subscribe: () => () => undefined,
  },
}));
jest.mock('../../api/bookings.api', () => ({
  bookingsApi: {
    getBooking: (...args: unknown[]) => mockGetBooking(...args),
  },
}));
jest.mock('./customer-booking-detail', () => {
  const actual = jest.requireActual('./customer-booking-detail');
  return { ...actual, get initialBookingDetailState() { return mockState; } };
});

async function mount(): Promise<ReactTestRenderer> {
  const { default: Screen } = jest.requireActual('./CustomerBookingDetailScreen') as {
    default: React.ComponentType;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(React.createElement(Screen));
    await Promise.resolve();
  });
  return tree;
}
function touch(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
}
function textValues(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((n) =>
    Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? ''),
  );
}
function styleOf(node: ReactTestInstance | undefined): ViewStyle {
  return StyleSheet.flatten(node?.props.style ?? {}) as ViewStyle;
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockState, {
    booking: null, loading: false, refreshing: false,
    error: 'Không thể tải chi tiết yêu cầu đặt lịch.',
  });
});

describe('CustomerBookingDetail REAL read-only presentation', () => {
  it('renders accessible error/retry/back while not falsely reporting booking success', async () => {
    const tree = await mount();
    try {
      expect(textValues(tree)).toContain('Chi tiết yêu cầu đặt lịch');
      expect(textValues(tree)).toContain('Không xem được yêu cầu');
      const header = tree.root.findAllByType(Text).find((x) => x.props.children === 'Chi tiết yêu cầu đặt lịch');
      expect(header?.props.accessibilityRole).toBe('header');
      const back = touch(tree, 'Quay lại');
      const retry = touch(tree, 'Thử tải lại yêu cầu đặt lịch');
      expect(back).toBeDefined();
      expect(retry).toBeDefined();
      expect(styleOf(back).minHeight ?? styleOf(back).height).toBeGreaterThanOrEqual(44);
      expect(styleOf(retry).minHeight ?? styleOf(retry).height).toBeGreaterThanOrEqual(44);
      expect(retry?.props.accessibilityState.disabled).toBe(false);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockGetBooking).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('keeps loading distinct from an empty or denied Booking', async () => {
    Object.assign(mockState, { loading: true, error: null });
    const tree = await mount();
    try {
      expect(textValues(tree)).toContain('Đang tải yêu cầu đặt lịch…');
      expect(textValues(tree)).not.toContain('Không xem được yêu cầu');
      expect(touch(tree, 'Thử tải lại yêu cầu đặt lịch')).toBeUndefined();
      expect(mockGetBooking).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('shows a blocked retry while refresh is in progress', async () => {
    mockState.refreshing = true;
    const tree = await mount();
    try {
      const retry = touch(tree, 'Thử tải lại yêu cầu đặt lịch');
      expect(retry?.props.disabled).toBe(true);
      expect(retry?.props.accessibilityState.disabled).toBe(true);
      expect(mockGetBooking).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('preserves authoritative submitted Booking navigation with one primary action', async () => {
    Object.assign(mockState, {
      booking: {
        id: BOOKING_ID, customerId: 'customer-1', serviceName: 'Sửa điều hòa',
        status: 'SUBMITTED', urgency: 'NORMAL',
        createdAt: '2030-10-20T08:00:00.000Z',
        addressSummary: '123 Đường Láng, Đống Đa',
        preferredAt: '2030-10-21T10:00:00.000Z',
      },
      error: null,
    });
    const tree = await mount();
    try {
      expect(textValues(tree)).toContain('Sửa điều hòa');
      const action = touch(tree, 'Chọn kỹ thuật viên');
      expect(action).toBeDefined();
      expect(styleOf(action).minHeight ?? styleOf(action).height).toBeGreaterThanOrEqual(44);
      act(() => action?.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerMatching', { bookingId: BOOKING_ID });
      expect(mockGetBooking).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('shows the session wording and the note for the technician like the web', async () => {
    Object.assign(mockState, {
      booking: {
        id: BOOKING_ID, customerId: 'customer-1', serviceName: 'Sửa điều hòa',
        status: 'SUBMITTED', urgency: 'NORMAL', createdAt: '2030-10-20T08:00:00.000Z',
        preferredAt: '2030-10-21T01:00:00.000Z', preferredStartAt: '2030-10-21T01:00:00.000Z',
        bookingMode: 'scheduled', slot: 'morning', customerNote: 'Gọi trước 15 phút',
      },
      error: null,
    });
    const tree = await mount();
    try {
      expect(textValues(tree).some((t) => t.startsWith('Buổi sáng (8:00 - 12:00), '))).toBe(true);
      expect(textValues(tree)).toContain('Ghi chú cho thợ: Gọi trước 15 phút');
    } finally { act(() => tree.unmount()); }
  });

  it('shows Booking progress separately from a ServiceOrder that does not exist yet', async () => {
    Object.assign(mockState, {
      booking: {
        id: BOOKING_ID, customerId: 'customer-1', serviceName: 'Sửa điều hòa',
        status: 'SUBMITTED', urgency: 'NORMAL',
        createdAt: '2030-10-20T08:00:00.000Z',
      },
      error: null,
    });
    const tree = await mount();
    try {
      const progress = tree.root.findByProps({ testID: 'booking-detail-status-timeline' });
      const labels = progress.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      expect(labels).toContain('Yêu cầu đã gửi');
      expect(labels).toContain('Đơn sửa chữa chưa được tạo');
      expect(labels).not.toContain('Kỹ thuật viên đã nhận đơn');
      expect(mockGetBooking).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('keeps CLOSED Booking and linked ServiceOrder as distinct navigation targets', async () => {
    Object.assign(mockState, {
      booking: {
        id: BOOKING_ID, customerId: 'customer-1', serviceName: 'Sửa điều hòa',
        status: 'CLOSED', urgency: 'NORMAL', serviceOrderId: ORDER_ID,
        createdAt: '2030-10-20T08:00:00.000Z',
      },
      error: null,
    });
    const tree = await mount();
    try {
      const choose = touch(tree, 'Chọn lại kỹ thuật viên');
      const linked = touch(tree, 'Xem đơn sửa chữa liên quan');
      expect(choose).toBeDefined();
      expect(linked).toBeDefined();
      expect(styleOf(linked).minHeight ?? styleOf(linked).height).toBeGreaterThanOrEqual(44);
      act(() => linked?.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerOrderDetail', { serviceOrderId: ORDER_ID });
      act(() => choose?.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerMatching', { bookingId: BOOKING_ID });
      expect(mockGetBooking).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });
});
