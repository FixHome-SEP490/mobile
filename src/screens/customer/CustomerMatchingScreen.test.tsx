import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { BookingItem, TechnicianCandidate } from '../../api/bookings.api';
import type { ServiceOrderItem } from '../../api/orders.api';

const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORDER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TECHNICIAN_A = '11111111-1111-4111-8111-111111111111';
const TECHNICIAN_B = '22222222-2222-4222-8222-222222222222';
const TECHNICIAN_C = '33333333-3333-4333-8333-333333333333';
const PRIVATE_PHONE_SENTINEL = 'PRIVATE_PHONE_SENTINEL';
const PRIVATE_EMAIL_SENTINEL = 'PRIVATE_SENTINEL@example.invalid';

let mockRunFocusEffect = false;
let mockAuthState: any = {
  isAuthenticated: true,
  user: { id: CUSTOMER_A, role: 'customer' },
  sessionGeneration: 1,
};
let mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
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
const mockFadeInDownDelay = jest.fn();
const mockFadeInDownDuration = jest.fn();
const mockWithRepeat = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => ReactActual.useEffect(() => {
      if (!mockRunFocusEffect) return undefined;
      return callback();
    }, [callback]),
    useNavigation: () => mockNavigation,
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
  const enteringTransition = {
    delay: (...args: unknown[]) => {
      mockFadeInDownDelay(...args);
      return enteringTransition;
    },
    duration: (...args: unknown[]) => {
      mockFadeInDownDuration(...args);
      return enteringTransition;
    },
  };
  return {
    __esModule: true,
    default: { View: AnimatedView },
    FadeInDown: enteringTransition,
    cancelAnimation: jest.fn(),
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withRepeat: (animation: unknown) => {
      mockWithRepeat(animation);
      return animation;
    },
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
    phoneNumber: PRIVATE_PHONE_SENTINEL,
    email: PRIVATE_EMAIL_SENTINEL,
  } as TechnicianCandidate;
}

const candidateA = makeCandidate(TECHNICIAN_A, 'Kỹ thuật viên A');
const candidateB = makeCandidate(TECHNICIAN_B, 'Kỹ thuật viên B');
const candidateC = makeCandidate(TECHNICIAN_C, 'Kỹ thuật viên C');

function makeOrder(overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem {
  return {
    id: ORDER_ID,
    bookingId: BOOKING_ID,
    code: 'FH-TEST-ORDER',
    serviceName: 'Sửa điều hòa',
    status: 'ACCEPTED',
    customerName: 'Khách hàng',
    customerPhone: '',
    addressSummary: '',
    scheduledAt: '2030-10-21T09:00:00.000Z',
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
    createdAt: '2026-09-25T04:00:00.000Z',
    ...overrides,
  } as ServiceOrderItem;
}

function screenElement() {
  const { default: CustomerMatchingScreen } = jest.requireActual('./CustomerMatchingScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerMatchingScreen);
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => {
    const child = node.props.children;
    return Array.isArray(child) ? child.join('') : String(child ?? '');
  });
}

function hasText(tree: ReactTestRenderer, value: string): boolean {
  return texts(tree).some((text) => text.includes(value));
}

function findText(tree: ReactTestRenderer, value: string): ReactTestInstance | undefined {
  return tree.root.findAllByType(Text).find((node) => {
    const child = node.props.children;
    return (Array.isArray(child) ? child.join('') : String(child ?? '')).includes(value);
  });
}

function textOf(node: ReactTestInstance): string {
  const child = node.props.children;
  return Array.isArray(child) ? child.join('') : String(child ?? '');
}

function findPressableAncestor(node: ReactTestInstance | undefined): ReactTestInstance | undefined {
  let current = node?.parent;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  return current ?? undefined;
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function mountLoadedScreen(
  booking = makeBooking(),
  candidates: TechnicianCandidate[] = [candidateA, candidateB, candidateC],
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

function usePersistentMockStorage(): Map<string, string> {
  const items = new Map<string, string>();
  mockStorage.getItem.mockImplementation(async (key: string) => items.get(key) ?? null);
  mockStorage.setItem.mockImplementation(async (key: string, value: string) => {
    items.set(key, value);
  });
  mockStorage.removeItem.mockImplementation(async (key: string) => {
    items.delete(key);
  });
  return items;
}

async function startShortlistSend(
  tree: ReactTestRenderer,
  linked = false,
): Promise<{ sendTask: Promise<void> }> {
  const selectButton = tree.root.findByProps({ testID: 'matching-candidate-select-' + TECHNICIAN_A });
  await act(async () => selectButton.props.onPress());

  const sendLabel = linked
    ? 'Gửi yêu cầu chọn 1 kỹ thuật viên mới'
    : 'Xác nhận mời 1 kỹ thuật viên';
  const sendButton = findPressableAncestor(findText(tree, sendLabel));
  expect(sendButton).toBeDefined();

  let sendTask!: Promise<void>;
  await act(async () => {
    sendTask = sendButton?.props.onPress();
    await flushPromises();
  });
  return { sendTask };
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

describe('Customer Matching presentation and privacy', () => {
  it('shows an initial Matching skeleton instead of a lone spinner', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(screenElement()); });

    expect(hasText(tree, 'Đang tìm kỹ thuật viên phù hợp gần bạn.')).toBe(true);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('keeps Matching static until the OS Reduce Motion preference resolves', async () => {
    mockReduceMotionPreference = undefined;
    const tree = await mountLoadedScreen();
    try {
      expect(mockUseReduceMotion).toHaveBeenCalledWith(true);
      expect(mockWithRepeat).not.toHaveBeenCalled();
      expect(mockFadeInDownDelay).not.toHaveBeenCalled();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not schedule Matching motion when Reduce Motion is enabled', async () => {
    mockReduceMotionPreference = true;
    const tree = await mountLoadedScreen();
    try {
      expect(mockUseReduceMotion).toHaveBeenCalledWith(true);
      expect(mockWithRepeat).not.toHaveBeenCalled();
      expect(mockFadeInDownDelay).not.toHaveBeenCalled();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not show the no-candidates state when the candidate request failed', async () => {
    mockRunFocusEffect = true;
    mockGetBooking.mockResolvedValue(makeBooking());
    mockGetCandidates.mockRejectedValue({ response: { status: 503 } });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(screenElement());
      await flushPromises();
    });

    expect(hasText(tree, 'Không thể tải danh sách kỹ thuật viên')).toBe(true);
    expect(hasText(tree, 'Hiện chưa có kỹ thuật viên phù hợp')).toBe(false);
  });

  it('keeps last-good owner-bound candidates visible during a refresh', async () => {
    const tree = await mountLoadedScreen();
    expect(hasText(tree, 'Kỹ thuật viên A')).toBe(true);

    let resolveRefresh!: (value: BookingItem) => void;
    mockGetBooking.mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const refreshButton = findPressableAncestor(findText(tree, 'Làm mới trạng thái'));
    expect(refreshButton).toBeDefined();
    await act(async () => {
      refreshButton?.props.onPress();
      await Promise.resolve();
    });

    expect(hasText(tree, 'Kỹ thuật viên A')).toBe(true);
    expect(hasText(tree, 'Đang cập nhật trạng thái…')).toBe(true);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async () => {
      resolveRefresh(makeBooking());
      await flushPromises();
    });
  });

  it('keeps owner-bound candidates after a transient refresh failure but disables actions', async () => {
    const tree = await mountLoadedScreen();
    mockGetBooking.mockRejectedValueOnce({ code: 'ERR_NETWORK', request: {} });
    const refreshButton = findPressableAncestor(findText(tree, 'Làm mới trạng thái'));

    await act(async () => {
      refreshButton?.props.onPress();
      await flushPromises();
    });

    expect(hasText(tree, 'Kỹ thuật viên A')).toBe(true);
    expect(hasText(tree, 'Không thể tải trạng thái yêu cầu')).toBe(true);
    const selectA = tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_A}` });
    expect(selectA.props.disabled).toBe(true);
  });

  it('clears last-good data when a refresh returns a malformed booking contract', async () => {
    const tree = await mountLoadedScreen();
    mockGetBooking.mockRejectedValueOnce(new Error('Booking response did not match the requested id'));
    const refreshButton = findPressableAncestor(findText(tree, 'Làm mới trạng thái'));

    await act(async () => {
      refreshButton?.props.onPress();
      await flushPromises();
    });

    expect(hasText(tree, 'Kỹ thuật viên A')).toBe(false);
    expect(hasText(tree, 'Yêu cầu dịch vụ')).toBe(false);
  });

  it('opens candidate details from the card body without changing shortlist selection', async () => {
    const tree = await mountLoadedScreen();
    const candidateName = findText(tree, 'Kỹ thuật viên A');
    expect(candidateName).toBeDefined();

    await act(async () => findPressableAncestor(candidateName)?.props.onPress());

    expect(hasText(tree, '(0/2)')).toBe(true);
    expect(hasText(tree, 'Thông tin kỹ thuật viên')).toBe(true);
  });

  it('keeps candidate cards compact and moves secondary details into the detail sheet', async () => {
    const tree = await mountLoadedScreen();
    const compactText = texts(tree).join('\n');

    expect(compactText).toContain('4,8/5 · 12 lượt đánh giá');
    expect(compactText).toContain('2,4 km');
    expect(compactText).not.toContain('6 năm kinh nghiệm');
    expect(compactText).not.toContain('150.000 ₫');
    expect(compactText).not.toContain('30 ngày');

    const candidateName = findText(tree, 'Kỹ thuật viên A');
    await act(async () => findPressableAncestor(candidateName)?.props.onPress());

    const detailText = texts(tree).join('\n');
    expect(detailText).toContain('6 năm kinh nghiệm');
    expect(detailText).toContain('150.000 ₫');
    expect(detailText).toContain('30 ngày');
    expect(detailText).toContain('Chuyên sửa điều hòa dân dụng.');
    expect(detailText).toContain('24');
    expect(detailText).toContain('96,5%');
  });

  it('shows "Chưa có đánh giá" for an unrated technician instead of a score', async () => {
    const unrated = { ...candidateA, averageRating: null, ratingCount: 0 };
    const tree = await mountLoadedScreen(makeBooking(), [unrated, candidateB]);

    const compactText = texts(tree).join('\n');
    expect(compactText).toContain('Chưa có đánh giá');
    expect(compactText).toContain('4,8/5 · 12 lượt đánh giá');

    const candidateName = findText(tree, 'Kỹ thuật viên A');
    await act(async () => findPressableAncestor(candidateName)?.props.onPress());
    const detailText = texts(tree).join('\n');
    expect(detailText).toContain('Chưa có đánh giá');
    expect(detailText).not.toContain('0 lượt đánh giá');
    expect(detailText).not.toMatch(/5,0 ★|0,0 ★/);
  });

  it('shows only customer-safe candidate details with known units', async () => {
    const tree = await mountLoadedScreen();
    const candidateName = findText(tree, 'Kỹ thuật viên A');
    await act(async () => findPressableAncestor(candidateName)?.props.onPress());

    const visibleText = texts(tree).join('\n');
    expect(visibleText).toContain('4,8/5');
    expect(visibleText).toContain('12 lượt đánh giá');
    expect(visibleText).toContain('2,4 km');
    expect(visibleText).toContain('6 năm kinh nghiệm');
    expect(visibleText).toContain('150.000 ₫');
    expect(visibleText).toContain('30 ngày');
    expect(visibleText).not.toContain('98');
    expect(visibleText).not.toContain(PRIVATE_PHONE_SENTINEL);
    expect(visibleText).not.toContain(PRIVATE_EMAIL_SENTINEL);
    expect(visibleText).not.toContain(TECHNICIAN_A);
  });

  it('loads real technician reviews by USER id and renders the safe review view model', async () => {
    mockGetTechnicianReviews.mockResolvedValueOnce({
      data: [{
        id: 'review-1',
        rating: 5,
        comment: 'Làm việc gọn gàng, đúng giờ.',
        customerName: 'Khách A',
        createdAt: '2026-09-29T03:00:00.000Z',
      }],
      total: 3,
    });
    const tree = await mountLoadedScreen();
    const candidateName = findText(tree, 'Kỹ thuật viên A');

    await act(async () => {
      findPressableAncestor(candidateName)?.props.onPress();
      await flushPromises();
    });

    expect(mockGetTechnicianReviews).toHaveBeenCalledWith(TECHNICIAN_A, 1, 20);
    const visibleText = texts(tree).join('\n');
    expect(visibleText).toContain('Đánh giá từ khách hàng');
    expect(visibleText).toContain('3 đánh giá');
    expect(visibleText).toContain('Khách A');
    expect(visibleText).toContain('★ 5/5');
    expect(visibleText).toContain('Làm việc gọn gàng, đúng giờ.');
    expect(visibleText).not.toContain(PRIVATE_PHONE_SENTINEL);
    expect(visibleText).not.toContain(PRIVATE_EMAIL_SENTINEL);
  });

  it('shows a review error state and retries without changing matching selection', async () => {
    mockGetTechnicianReviews
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: [{
          id: 'review-retry',
          rating: 4,
          comment: null,
          customerName: null,
          createdAt: '2026-09-28T03:00:00.000Z',
        }],
        total: 1,
      });
    const tree = await mountLoadedScreen();
    const candidateName = findText(tree, 'Kỹ thuật viên A');

    await act(async () => {
      findPressableAncestor(candidateName)?.props.onPress();
      await flushPromises();
    });
    expect(hasText(tree, 'Không thể tải đánh giá lúc này.')).toBe(true);
    expect(hasText(tree, '(0/2)')).toBe(true);

    const retry = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Thử tải lại đánh giá',
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.props.onPress();
      await flushPromises();
    });

    expect(mockGetTechnicianReviews).toHaveBeenCalledTimes(2);
    expect(hasText(tree, 'Khách hàng đánh giá 4 sao và không để lại nhận xét.')).toBe(true);
    expect(hasText(tree, '(0/2)')).toBe(true);
  });

  it('ignores a stale review response after the detail candidate changes', async () => {
    let resolveOldReviews: ((value: {
      data: { id: string; rating: number; comment: string | null; customerName: string | null; createdAt: string }[];
      total: number;
    }) => void) | undefined;
    mockGetTechnicianReviews.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOldReviews = resolve;
    }));

    const tree = await mountLoadedScreen();
    const candidateAButton = tree.root.findByProps({ testID: 'matching-candidate-details-' + TECHNICIAN_A });
    await act(async () => {
      candidateAButton.props.onPress();
      await Promise.resolve();
    });

    const close = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Đóng thông tin kỹ thuật viên',
    );
    await act(async () => {
      close?.props.onPress();
      await Promise.resolve();
    });

    mockGetTechnicianReviews.mockResolvedValueOnce({
      data: [{
        id: 'review-new',
        rating: 5,
        comment: 'Đánh giá của kỹ thuật viên B',
        customerName: 'Khách B',
        createdAt: '2026-09-30T03:00:00.000Z',
      }],
      total: 1,
    });
    const candidateBButton = tree.root.findByProps({ testID: 'matching-candidate-details-' + TECHNICIAN_B });
    await act(async () => {
      candidateBButton.props.onPress();
      await flushPromises();
    });
    expect(hasText(tree, 'Đánh giá của kỹ thuật viên B')).toBe(true);

    await act(async () => {
      resolveOldReviews?.({
        data: [{
          id: 'review-old',
          rating: 1,
          comment: 'Đánh giá cũ không được xuất hiện',
          customerName: 'Phiên cũ',
          createdAt: '2026-09-20T03:00:00.000Z',
        }],
        total: 1,
      });
      await flushPromises();
    });

    expect(hasText(tree, 'Đánh giá của kỹ thuật viên B')).toBe(true);
    expect(hasText(tree, 'Đánh giá cũ không được xuất hiện')).toBe(false);
  });

  it('clears the detail sheet when owner changes or the candidate disappears', async () => {
    const tree = await mountLoadedScreen();
    const candidateName = findText(tree, 'Kỹ thuật viên A');
    await act(async () => findPressableAncestor(candidateName)?.props.onPress());
    expect(hasText(tree, 'Thông tin kỹ thuật viên')).toBe(true);

    mockAuthState = { isAuthenticated: true, user: { id: CUSTOMER_B, role: 'customer' } };
    await act(async () => tree.update(screenElement()));
    expect(hasText(tree, 'Thông tin kỹ thuật viên')).toBe(false);
    act(() => tree.unmount());
  });

  it('hides same-owner private state on session generation change and ignores stale candidate results', async () => {
    const tree = await mountLoadedScreen();
    let resolveStaleCandidates: ((value: TechnicianCandidate[]) => void) | undefined;
    let resolveNewBooking: ((value: BookingItem) => void) | undefined;
    try {
      const candidateName = findText(tree, 'Kỹ thuật viên A');
      await act(async () => findPressableAncestor(candidateName)?.props.onPress());
      expect(hasText(tree, 'Thông tin kỹ thuật viên')).toBe(true);

      mockGetCandidates.mockImplementationOnce(() => new Promise((resolve) => {
        resolveStaleCandidates = resolve;
      }));
      const refreshButton = findPressableAncestor(findText(tree, 'Làm mới trạng thái'));
      await act(async () => {
        refreshButton?.props.onPress();
        await flushPromises();
      });
      expect(resolveStaleCandidates).toBeDefined();

      mockGetBooking.mockImplementationOnce(() => new Promise((resolve) => {
        resolveNewBooking = resolve;
      }));
      mockAuthState = { ...mockAuthState, sessionGeneration: 2 };
      await act(async () => {
        tree.update(screenElement());
        await Promise.resolve();
      });

      const privateStateHidden = !hasText(tree, 'Sửa điều hòa')
        && !hasText(tree, 'Kỹ thuật viên A')
        && !hasText(tree, 'Thông tin kỹ thuật viên')
        && !hasText(tree, 'Mã tham chiếu:')
        && !hasText(tree, 'Tài khoản hiện tại không sở hữu yêu cầu này');
      const newGenerationLoadStarted = resolveNewBooking !== undefined;

      const staleCandidate = makeCandidate('44444444-4444-4444-8444-444444444444', 'Kỹ thuật viên phiên cũ');
      await act(async () => {
        resolveStaleCandidates?.([staleCandidate]);
        await flushPromises();
      });
      const staleCandidateIgnored = !hasText(tree, 'Kỹ thuật viên phiên cũ');

      if (resolveNewBooking) {
        await act(async () => {
          resolveNewBooking?.(makeBooking());
          await flushPromises();
        });
      }
      const newGenerationDataLoaded = hasText(tree, 'Kỹ thuật viên A');

      expect(privateStateHidden).toBe(true);
      expect(newGenerationLoadStarted).toBe(true);
      expect(staleCandidateIgnored).toBe(true);
      expect(newGenerationDataLoaded).toBe(true);
    } finally {
      mockGetBooking.mockReset();
      mockGetBooking.mockResolvedValue(makeBooking());
      mockGetCandidates.mockReset();
      mockGetCandidates.mockResolvedValue([candidateA, candidateB, candidateC]);
      act(() => tree.unmount());
    }
  });

  it('dismisses technician details when that candidate leaves the current list', async () => {
    const tree = await mountLoadedScreen();
    const candidateName = findText(tree, 'Kỹ thuật viên A');
    await act(async () => findPressableAncestor(candidateName)?.props.onPress());
    expect(hasText(tree, 'Thông tin kỹ thuật viên')).toBe(true);

    mockGetCandidates.mockResolvedValueOnce([]);
    const refreshButton = findPressableAncestor(findText(tree, 'Làm mới trạng thái'));
    await act(async () => {
      refreshButton?.props.onPress();
      await flushPromises();
    });
    expect(hasText(tree, 'Thông tin kỹ thuật viên')).toBe(false);
  });

  it('uses explicit select controls and preserves the ordered two-technician cap', async () => {
    const tree = await mountLoadedScreen();
    const selectA = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Chọn Kỹ thuật viên A',
    );
    expect(selectA).toBeDefined();
    expect(selectA?.props.accessibilityRole).toBe('checkbox');
    expect(selectA?.props.accessibilityState).toEqual({ checked: false, disabled: false });
    const detailsA = tree.root.findByProps({ testID: `matching-candidate-details-${TECHNICIAN_A}` });
    expect(detailsA.props.accessibilityRole).toBe('button');
    expect(detailsA).not.toBe(selectA);
    await act(async () => selectA?.props.onPress());
    expect(hasText(tree, '(1/2)')).toBe(true);
    expect(hasText(tree, 'Ưu tiên 1 · Mời trước')).toBe(true);
    expect(tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_A}` }).props.accessibilityState)
      .toEqual({ checked: true, disabled: false });

    const selectB = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Chọn Kỹ thuật viên B',
    );
    await act(async () => selectB?.props.onPress());
    expect(hasText(tree, '(2/2)')).toBe(true);
    expect(hasText(tree, 'Ưu tiên 2 · Dự phòng')).toBe(true);

    const selectC = tree.root.findAllByType(TouchableOpacity).find(
      (button) => button.props.accessibilityLabel === 'Chọn Kỹ thuật viên C',
    );
    expect(selectC?.props.disabled).toBe(true);
    expect(selectC?.props.accessibilityState).toEqual({ checked: false, disabled: true });
  });

  it('uses compact right-side selection, blue selected outline, priority badges, and detail-sheet selection', async () => {
    const tree = await mountLoadedScreen();
    const cardA = tree.root.findByProps({ testID: `matching-candidate-card-${TECHNICIAN_A}` });
    const detailsA = tree.root.findByProps({ testID: `matching-candidate-details-${TECHNICIAN_A}` });
    const selectA = tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_A}` });

    expect(detailsA.props.testID).toBe(`matching-candidate-details-${TECHNICIAN_A}`);
    expect(selectA.props.testID).toBe(`matching-candidate-select-${TECHNICIAN_A}`);
    expect(cardA.findAllByProps({ testID: `matching-candidate-priority-${TECHNICIAN_A}` })).toHaveLength(0);
    expect(selectA.findAllByType(Text).map((node) => String(node.props.children ?? '')).join(' ')).toContain('Chọn');

    await act(async () => detailsA.props.onPress());
    const detailSelect = tree.root.findByProps({ testID: 'matching-detail-select' });
    expect(detailSelect.props.accessibilityLabel).toBe('Chọn Kỹ thuật viên A');
    await act(async () => detailSelect.props.onPress());

    const selectedCardA = tree.root.findByProps({ testID: `matching-candidate-card-${TECHNICIAN_A}` });
    const selectedControlA = tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_A}` });
    const badgeA = tree.root.findByProps({ testID: `matching-candidate-priority-${TECHNICIAN_A}` });
    expect(StyleSheet.flatten(selectedCardA.props.style)).toMatchObject({ borderColor: '#2563EB', borderWidth: 2 });
    expect(textOf(badgeA.findByType(Text))).toBe('#1');
    expect(selectedControlA.findAllByType(Text).map(textOf).join(' ')).toContain('#1');
    expect(textOf(tree.root.findByProps({ testID: 'matching-detail-priority' }).findByType(Text))).toBe('#1');

    const selectB = tree.root.findByProps({ testID: `matching-candidate-select-${TECHNICIAN_B}` });
    await act(async () => selectB.props.onPress());
    const selectedCardB = tree.root.findByProps({ testID: `matching-candidate-card-${TECHNICIAN_B}` });
    const badgeB = tree.root.findByProps({ testID: `matching-candidate-priority-${TECHNICIAN_B}` });
    expect(StyleSheet.flatten(selectedCardB.props.style)).toMatchObject({ borderColor: '#2563EB', borderWidth: 2 });
    expect(textOf(badgeB.findByType(Text))).toBe('#2');
  });

  it('provides Home and secondary refresh while waiting without a verified order', async () => {
    const tree = await mountLoadedScreen(makeBooking({ status: 'MATCHING' }), []);

    expect(hasText(tree, 'Về trang chủ')).toBe(true);
    expect(hasText(tree, 'Làm mới trạng thái')).toBe(true);
    expect(hasText(tree, 'Rời màn hình không hủy lời mời.')).toBe(true);
    const primary = tree.root.findByProps({ testID: 'matching-waiting-primary' });
    expect(primary).toBeDefined();
    expect(tree.root.findByProps({ testID: 'matching-waiting-refresh' })).toBeDefined();
    await act(async () => primary.props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CustomerMain');
  });

  it('uses the exact verified linked order as the waiting primary action', async () => {
    mockGetOrder.mockResolvedValue(makeOrder());
    const tree = await mountLoadedScreen(
      makeBooking({ status: 'MATCHED', serviceOrderId: ORDER_ID }),
      [],
    );
    expect(hasText(tree, 'Xem đơn sửa chữa')).toBe(true);

    const primary = tree.root.findByProps({ testID: 'matching-waiting-primary' });
    await act(async () => primary.props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CustomerOrderDetail', {
      serviceOrderId: ORDER_ID,
    });
  });

  it('does not dispatch an initial shortlist when the same customer session changes during preflight', async () => {
    const storedAttempts = usePersistentMockStorage();
    const tree = await mountLoadedScreen();
    let resolveFreshBooking!: (value: BookingItem) => void;
    try {
      mockGetBooking.mockImplementationOnce(() => new Promise((resolve) => {
        resolveFreshBooking = resolve;
      }));
      const { sendTask } = await startShortlistSend(tree);
      expect(resolveFreshBooking).toBeDefined();

      mockAuthState = { ...mockAuthState, sessionGeneration: 2 };
      await act(async () => {
        tree.update(screenElement());
        await flushPromises();
      });
      const refreshButton = tree.root.findByProps({ testID: 'matching-waiting-refresh' });
      const newSessionIsNotBlockedByOldSendingState = refreshButton.props.disabled === false;

      await act(async () => {
        resolveFreshBooking(makeBooking());
        await sendTask;
        await flushPromises();
      });

      expect(mockSendShortlist).not.toHaveBeenCalled();
      expect(newSessionIsNotBlockedByOldSendingState).toBe(true);
      expect(storedAttempts.size).toBe(1);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not dispatch a linked reselect when the same customer session changes during preflight', async () => {
    const storedAttempts = usePersistentMockStorage();
    mockGetOrder.mockResolvedValue(makeOrder());
    const linkedBooking = makeBooking({ status: 'CLOSED', serviceOrderId: ORDER_ID });
    const tree = await mountLoadedScreen(linkedBooking);
    let resolveFreshBooking!: (value: BookingItem) => void;
    try {
      mockGetBooking.mockImplementationOnce(() => new Promise((resolve) => {
        resolveFreshBooking = resolve;
      }));
      const { sendTask } = await startShortlistSend(tree, true);
      expect(resolveFreshBooking).toBeDefined();

      mockAuthState = { ...mockAuthState, sessionGeneration: 2 };
      await act(async () => {
        tree.update(screenElement());
        await flushPromises();
      });
      const refreshButton = tree.root.findByProps({ testID: 'matching-waiting-refresh' });
      const newSessionIsNotBlockedByOldSendingState = refreshButton.props.disabled === false;

      await act(async () => {
        resolveFreshBooking(linkedBooking);
        await sendTask;
        await flushPromises();
      });

      expect(mockSendShortlist).not.toHaveBeenCalled();
      expect(newSessionIsNotBlockedByOldSendingState).toBe(true);
      expect(storedAttempts.size).toBe(1);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('keeps an ambiguous shortlist marker when positive reconciliation finishes in an older session', async () => {
    const storedAttempts = usePersistentMockStorage();
    let rejectShortlist!: (problem: Error) => void;
    mockSendShortlist.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectShortlist = reject;
    }));
    const tree = await mountLoadedScreen();
    let resolveReconciliation!: (value: BookingItem) => void;
    try {
      const { sendTask } = await startShortlistSend(tree);
      expect(mockSendShortlist).toHaveBeenCalledTimes(1);
      expect(storedAttempts.size).toBe(1);

      mockGetBooking.mockImplementationOnce(() => new Promise((resolve) => {
        resolveReconciliation = resolve;
      }));
      await act(async () => {
        rejectShortlist(new Error('network timeout'));
        await flushPromises();
      });
      expect(resolveReconciliation).toBeDefined();

      mockAuthState = { ...mockAuthState, sessionGeneration: 2 };
      await act(async () => {
        tree.update(screenElement());
        await flushPromises();
      });

      const positiveReconciliation = makeBooking({
        status: 'MATCHING',
        invitations: [{
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          priorityOrder: 1,
          status: 'PENDING',
        }] as unknown as BookingItem['invitations'],
      });
      await act(async () => {
        resolveReconciliation(positiveReconciliation);
        await sendTask;
        await flushPromises();
      });

      expect(storedAttempts.size).toBe(1);
      expect(hasText(tree, 'Đã có một lượt mời đang chờ xác minh.')).toBe(true);
    } finally {
      act(() => tree.unmount());
    }
  });

  it.each([
    {
      outcome: 'ambiguous',
      postError: new Error('network timeout'),
      expectedMessage: 'Chưa thể xác nhận kết quả gửi.',
    },
    {
      outcome: 'definitive',
      postError: { response: { status: 409 } },
      expectedMessage: 'Hệ thống đã kiểm tra và từ chối yêu cầu chọn lại',
    },
  ])('$outcome linked-reselect reconciliation stays owner-bound for the same Booking ID', async ({
    postError,
    expectedMessage,
  }) => {
    const storedAttempts = usePersistentMockStorage();
    mockGetOrder.mockResolvedValue(makeOrder());
    const linkedBooking = makeBooking({ status: 'CLOSED', serviceOrderId: ORDER_ID });
    let rejectShortlist!: (problem: unknown) => void;
    mockSendShortlist.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectShortlist = reject;
    }));
    const tree = await mountLoadedScreen(linkedBooking);
    let resolveReconciliation!: (value: BookingItem) => void;
    try {
      const { sendTask } = await startShortlistSend(tree, true);
      expect(mockSendShortlist).toHaveBeenCalledTimes(1);
      expect(storedAttempts.size).toBe(1);

      mockGetBooking.mockImplementationOnce(() => new Promise((resolve) => {
        resolveReconciliation = resolve;
      }));
      await act(async () => {
        rejectShortlist(postError);
        await flushPromises();
      });
      expect(resolveReconciliation).toBeDefined();

      const wrongOwnerBooking = makeBooking({
        customerId: CUSTOMER_B,
        serviceName: 'Nội dung riêng tư của khách hàng khác',
        status: 'MATCHING',
        serviceOrderId: ORDER_ID,
        invitations: [{
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          priorityOrder: 1,
          status: 'PENDING',
        }] as unknown as BookingItem['invitations'],
      });
      await act(async () => {
        resolveReconciliation(wrongOwnerBooking);
        await sendTask;
        await flushPromises();
      });

      expect(storedAttempts.size).toBe(1);
      expect(mockSendShortlist).toHaveBeenCalledTimes(1);
      expect(hasText(tree, 'Nội dung riêng tư của khách hàng khác')).toBe(false);
      expect(hasText(tree, 'Sửa điều hòa')).toBe(true);
      expect(hasText(tree, expectedMessage)).toBe(true);
      expect(tree.root.findByProps({ testID: 'matching-waiting-refresh' })).toBeDefined();
    } finally {
      act(() => tree.unmount());
    }
  });
});
