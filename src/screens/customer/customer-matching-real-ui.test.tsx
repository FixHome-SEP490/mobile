import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { BookingItem, TechnicianCandidate } from '../../api/bookings.api';

const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TECHNICIAN_A = '11111111-1111-4111-8111-111111111111';
const TECHNICIAN_B = '22222222-2222-4222-8222-222222222222';

let mockRunFocusEffect = false;
let mockAuthState: any = {
  isAuthenticated: true,
  user: { id: CUSTOMER_A, role: 'customer' },
  sessionGeneration: 1,
};
let mockGetBooking = jest.fn();
let mockGetCandidates = jest.fn();
let mockSendShortlist = jest.fn();
let mockGetOrder = jest.fn();
let mockGetTechnicianReviews = jest.fn();
let mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
let mockReduceMotionPreference: boolean | undefined;
const mockUseReduceMotion = jest.fn((initialFallback?: boolean) =>
  mockReduceMotionPreference ?? initialFallback ?? false,
);

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => ReactActual.useEffect(() => {
      if (!mockRunFocusEffect) return undefined;
      return callback();
    }, [callback]),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: { bookingId: BOOKING_ID } }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockStorage,
}));

jest.mock('../../api/bookings.api', () => ({
  bookingsApi: {
    getBooking: (...args: unknown[]) => mockGetBooking(...args),
    getCandidates: (...args: unknown[]) => mockGetCandidates(...args),
    sendShortlist: (...args: unknown[]) => mockSendShortlist(...args),
  },
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: { getOrder: (...args: unknown[]) => mockGetOrder(...args) },
}));

jest.mock('../../api/technician-reviews.api', () => ({
  technicianReviewsApi: {
    listByTechnician: (...args: unknown[]) => mockGetTechnicianReviews(...args),
  },
}));

jest.mock('../../store', () => {
  const useAuthStore = (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState);
  Object.assign(useAuthStore, { getState: () => mockAuthState });
  return { useAuthStore };
});

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    colors: {
      primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF',
      background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A',
      textSecondary: '#64748B', muted: '#94A3B8', border: '#E2E8F0', error: '#DC2626', success: '#059669',
      divider: '#F1F5F9', tone: { success: { bg: '#E7F6F0', text: '#08734F' } },
    },
  }),
}));

jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: (initialFallback?: boolean) => mockUseReduceMotion(initialFallback),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('react-native-reanimated', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const AnimatedView = ReactActual.forwardRef(
    ({ entering, ...props }: { entering?: unknown; [key: string]: unknown }, ref: React.Ref<unknown>) =>
      ReactActual.createElement(View, { ...props, ref }),
  );
  return {
    __esModule: true,
    default: { View: AnimatedView },
    FadeInDown: { delay: () => ({ duration: () => undefined }) },
    cancelAnimation: jest.fn(),
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withRepeat: (animation: unknown) => animation,
    withTiming: (value: number) => value,
  };
});

function makeBooking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: BOOKING_ID,
    customerId: CUSTOMER_A,
    serviceOrderId: null,
    serviceId: 'service-1',
    addressId: 'address-1',
    serviceName: 'Sửa điều hòa',
    description: 'Điều hòa không mát',
    urgency: 'NORMAL',
    status: 'SUBMITTED',
    preferredStartAt: '2030-10-21T09:00:00.000Z',
    preferredEndAt: '2030-10-21T11:00:00.000Z',
    createdAt: '2026-09-25T03:00:00.000Z',
    invitations: [],
    ...overrides,
  } as BookingItem;
}

function makeCandidate(userId: string, fullName: string): TechnicianCandidate {
  return {
    id: userId,
    technicianId: `profile-${userId}`,
    userId,
    fullName,
    avatarUrl: undefined,
    averageRating: 4.8,
    ratingCount: 12,
    yearsExperience: 6,
    reliabilityScore: 98,
    distanceKm: 2.4,
    isAvailable: true,
    listedLaborPrice: 150000,
    typicalWarrantyDays: 30,
    bio: 'Chuyên sửa điều hòa dân dụng.',
    completedOrdersCount: 24,
    completionRate: 96.5,
    phoneNumber: 'PRIVATE_PHONE_SENTINEL',
    email: 'PRIVATE_SENTINEL@example.invalid',
  } as TechnicianCandidate;
}

const candidateA = makeCandidate(TECHNICIAN_A, 'Kỹ thuật viên A');
const candidateB = makeCandidate(TECHNICIAN_B, 'Kỹ thuật viên B');

function screenElement() {
  const { default: CustomerMatchingScreen } = jest.requireActual('./CustomerMatchingScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerMatchingScreen);
}

function allText(tree: ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map((node) => {
    const child = node.props.children;
    return Array.isArray(child) ? child.join('') : String(child ?? '');
  }).join('\n');
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function mountLoadedScreen(
  booking = makeBooking(),
  candidates: TechnicianCandidate[] = [candidateA, candidateB],
): Promise<ReactTestRenderer> {
  mockRunFocusEffect = true;
  mockGetBooking.mockResolvedValue(booking);
  mockGetCandidates.mockResolvedValue(candidates);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(screenElement());
    await flushPromises();
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRunFocusEffect = false;
  mockReduceMotionPreference = undefined;
  mockAuthState = {
    isAuthenticated: true,
    user: { id: CUSTOMER_A, role: 'customer' },
    sessionGeneration: 1,
  };
  mockStorage.getItem.mockResolvedValue(null);
  mockStorage.setItem.mockResolvedValue(undefined);
  mockStorage.removeItem.mockResolvedValue(undefined);
  mockGetTechnicianReviews.mockResolvedValue({ data: [], total: 0 });
});

describe('Customer Matching real UI polish (C-RUI5)', () => {

  it('uses compact truthful invitation status with no search radar for any Booking phase', async () => {
    const readActive = (tree: ReactTestRenderer) => tree.root.findAll((node) =>
      typeof node.type === 'function' && node.type.name === 'CustomerMatchingRadar',
    ).map((node) => node.props.active);
    const submitted = await mountLoadedScreen(makeBooking({ status: 'SUBMITTED' }));
    expect(readActive(submitted)).toEqual([]);
    const pending = await mountLoadedScreen(makeBooking({ status: 'MATCHING', invitations: [{ id: 'invite-1', status: 'PENDING', priorityOrder: 1 }] as BookingItem['invitations'] }));
    expect(readActive(pending)).toEqual([]);
    expect(allText(pending)).toContain('Đã gửi lời mời · Chờ phản hồi');
    expect(allText(pending)).not.toContain('Đang tìm kỹ thuật viên');
    const matched = await mountLoadedScreen(makeBooking({ status: 'MATCHED' }));
    expect(readActive(matched)).toEqual([]);
    expect(mockSendShortlist).not.toHaveBeenCalled();
    await act(async () => {
      submitted.unmount();
      pending.unmount();
      matched.unmount();
    });
  });

  it('uses a neutral loading state with no near-you promise', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(screenElement()); });
    const text = allText(tree);
    expect(text).toContain('Đang tải danh sách kỹ thuật viên…');
    expect(text).not.toContain('gần bạn');
    expect(tree.root.findByProps({ testID: 'matching-initial-skeleton' }).props.accessibilityRole)
      .toBe('progressbar');
  });

  it('shows a true empty state with header and keeps refresh retry available', async () => {
    const tree = await mountLoadedScreen(makeBooking(), []);
    expect(tree.root.findByProps({ testID: 'matching-empty-none' })).toBeDefined();
    expect(allText(tree)).toContain('Chưa có kỹ thuật viên phù hợp');
    expect(allText(tree)).toContain('Hiện chưa có kỹ thuật viên phù hợp');
    const refresh = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Làm mới trạng thái'
        || String(button.findAllByType(Text).map((node) => String(node.props.children ?? '')).join('')).includes('Làm mới'),
    );
    expect(refresh).toBeDefined();
    expect(mockSendShortlist).not.toHaveBeenCalled();
  });

  it('shows the single-candidate state with header', async () => {
    const tree = await mountLoadedScreen(makeBooking(), [candidateA]);
    expect(tree.root.findByProps({ testID: 'matching-empty-one' })).toBeDefined();
    expect(allText(tree)).toContain('Có 1 kỹ thuật viên phù hợp');
    expect(mockSendShortlist).not.toHaveBeenCalled();
  });

  it('announces load failures as alert and keeps last-good candidates disabled', async () => {
    mockRunFocusEffect = true;
    mockGetBooking.mockResolvedValue(makeBooking());
    mockGetCandidates.mockRejectedValue({ response: { status: 503 } });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(screenElement());
      await flushPromises();
    });
    const alert = tree.root.findAllByType(Text).find(
      (node) => node.props.accessibilityRole === 'alert',
    );
    expect(alert).toBeDefined();
    expect(allText(tree)).toContain('Không thể tải danh sách kỹ thuật viên');
    expect(allText(tree)).not.toContain('Hiện chưa có kỹ thuật viên phù hợp');
    expect(mockSendShortlist).not.toHaveBeenCalled();
  });

  it('keeps selection capped at ordered 1-2 with primary/standby copy and 44px targets', async () => {
    const tree = await mountLoadedScreen();
    const selectA = tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_A}` });
    expect(selectA.props.accessibilityRole).toBe('checkbox');
    expect(selectA.props.accessibilityHint).toContain('Người thứ nhất được mời trước');
    expect(StyleSheet.flatten(selectA.props.style)).toMatchObject({ minHeight: 44 });

    await act(async () => selectA.props.onPress());
    await act(async () => tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_B}` }).props.onPress());
    const text = allText(tree);
    expect(text).toContain('(2/2)');
    expect(text).toContain('Ưu tiên 1 · Mời trước');
    expect(text).toContain('Ưu tiên 2 · Dự phòng');
    expect(mockSendShortlist).not.toHaveBeenCalled();
  });

  it('labels distance as reference only and never leaks private trust fields', async () => {
    const tree = await mountLoadedScreen();
    const text = allText(tree);
    expect(text).toContain('2,4 km tham khảo');
    expect(text).not.toMatch(/ETA|đang đến|đấu thầu|giá thầu|GPS/i);
    expect(text).not.toContain('PRIVATE_PHONE_SENTINEL');
    expect(text).not.toContain('PRIVATE_SENTINEL@example.invalid');
    expect(text).not.toContain(TECHNICIAN_A);
    expect(mockSendShortlist).not.toHaveBeenCalled();
  });

  it('keeps the send action disabled until selection with accessible state', async () => {
    const tree = await mountLoadedScreen();
    const send = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Gửi danh sách kỹ thuật viên đã chọn',
    );
    expect(send).toBeDefined();
    expect(send?.props.disabled).toBe(true);
    expect(send?.props.accessibilityState).toMatchObject({ disabled: true });
    expect(StyleSheet.flatten(send?.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(mockSendShortlist).not.toHaveBeenCalled();
  });
});
