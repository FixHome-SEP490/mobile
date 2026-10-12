// Notifications-only tests ported from the Technician Profile/Notifications WIP; profile and finance are held.
// Technician T-RUI5: real Profile + Notifications presentation tests.
// Profile asserts source-backed loading/skills/rating, KYC mapping to server
// verification, safe 44pt avatar target and reduced-motion handling.
// Notifications asserts honest REST-only states: loading copy, empty inbox,
// badge from server sources, and mark-read only after confirmed API.
// Mocked network boundaries only; no real API/device mutations.
import React from 'react';
import { SectionList, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usersApi } from '../../api/users.api';
import { ordersApi } from '../../api/orders.api';
import { notificationsApi } from '../../api/notifications.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { technicianVerificationApi } from '../../api/technician-verification.api';
import { servicesApi } from '../../api/services.api';

let mockReduceMotion = false;
let mockUnreadCount = 0;
const mockBadgeListeners = new Set<() => void>();
const mockSetUnreadNotifications = jest.fn((count: number) => {
  mockUnreadCount = Math.max(0, count);
  mockBadgeListeners.forEach((listener) => listener());
});
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockLogout = jest.fn();
const mockAuthUser = {
  id: 'tech-1',
  fullName: 'Nguyen Van A',
  email: 'tech@example.test' as string | null,
  phoneNumber: '0901234567' as string | null,
  avatarUrl: null,
};

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, canGoBack: mockCanGoBack }),
    useFocusEffect: (callback: () => void | (() => void)) =>
      ReactModule.useEffect(callback, [callback]),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) =>
    ReactModule.createElement(View, props, children);
  return {
    SafeAreaProvider: Passthrough,
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

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 1 },
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View, SectionList: NativeSectionList } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockModal = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(View, null, children);
  return {
    __esModule: true,
    BottomSheetModal: MockModal,
    BottomSheetBackdrop: () => null,
    BottomSheetSectionList: NativeSectionList,
    BottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
    BottomSheetTextInput: () => null,
  };
});

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
        repair: { bg: '#eff6ff', fg: '#2563eb', text: '#1d4ed8' },
        violet: { bg: '#f3eefe', fg: '#6335d9', text: '#6335d9' },
      },
    },
  }),
}));

jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

jest.mock('../../store', () => {
  const state = {
    user: mockAuthUser,
    logout: mockLogout,
  };
  const hook = Object.assign(
    (selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
    { getState: () => state },
  );
  return { useAuthStore: hook };
});

jest.mock('../../store/badge.store', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useBadgeStore: (selector: (s: Record<string, unknown>) => unknown) =>
      ReactModule.useSyncExternalStore(
        (listener) => {
          mockBadgeListeners.add(listener);
          return () => { mockBadgeListeners.delete(listener); };
        },
        () => selector({
          unreadNotifications: mockUnreadCount,
          setUnreadNotifications: mockSetUnreadNotifications,
        }),
      ),
  };
});

jest.mock('../../api/users.api', () => ({
  usersApi: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    getAddresses: jest.fn(),
    createAddress: jest.fn(),
    updateAddress: jest.fn(),
    deleteAddress: jest.fn(),
  },
}));

jest.mock('../../api/media.api', () => ({
  mediaApi: { uploadPublicImage: jest.fn() },
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: { getMyOrders: jest.fn() },
}));

jest.mock('../../api/auth.api', () => ({
  authApi: { logout: jest.fn() },
}));

jest.mock('../../api/geo.api', () => ({
  geoApi: { autocomplete: jest.fn(async () => []), reverse: jest.fn(), getProvinces: jest.fn(async () => []) },
}));

jest.mock('../../api/services.api', () => ({
  servicesApi: { getServices: jest.fn(async () => ({ data: [], total: 0 })), getCategories: jest.fn(async () => []) },
}));

jest.mock('../../api/technician-profile.api', () => ({
  technicianProfileApi: {
    getMyProfile: jest.fn(),
    updateMyProfile: jest.fn(),
    getMySchedule: jest.fn(async () => []),
    updateMySchedule: jest.fn(),
    getMyTimeOff: jest.fn(async () => []),
    createTimeOff: jest.fn(),
    deleteTimeOff: jest.fn(),
    getMyServices: jest.fn(),
    setSkillPricing: jest.fn(),
  },
}));

jest.mock('../../api/technician-verification.api', () => ({
  technicianVerificationApi: { getMyVerification: jest.fn(), requestUploadUrl: jest.fn(), submit: jest.fn() },
}));

jest.mock('../../api/notifications.api', () => ({
  notificationsApi: {
    getNotifications: jest.fn(),
    getCountUnread: jest.fn(),
    readNotification: jest.fn(),
    readAll: jest.fn(),
  },
}));

jest.mock('../../services/avatar-upload', () => ({
  updateMyAvatar: jest.fn(),
  avatarErrorMessage: jest.fn(() => 'Không thể cập nhật ảnh đại diện'),
}));

jest.mock('../../components/CategoryPills', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/AddressMap', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockMap = () => ReactModule.createElement(View, null);
  return { __esModule: true, default: MockMap, Marker: MockMap };
});

jest.mock('../../components/StatusBadge', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ view }: { view: { label: string } }) =>
      ReactModule.createElement(NativeText, null, view.label),
  };
});

jest.mock('../../components/customer/CustomerSkeleton', () => ({
  __esModule: true,
  default: () => null,
}));

const TechnicianNotificationsScreen =
  jest.requireActual('./TechnicianNotificationsScreen').default as React.ComponentType;

const mockUsersApi = usersApi as jest.Mocked<typeof usersApi>;
const mockOrdersApi = ordersApi as jest.Mocked<typeof ordersApi>;
const mockNotificationsApi = notificationsApi as jest.Mocked<typeof notificationsApi>;
const mockProfileApi = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const mockVerificationApi = technicianVerificationApi as jest.Mocked<typeof technicianVerificationApi>;
const mockServicesApi = servicesApi as jest.Mocked<typeof servicesApi>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function notificationPage(items: Record<string, unknown>[]) {
  return { success: true, statusCode: 200, message: 'ok', data: { data: items, total: items.length } };
}

function notificationRows(renderer: ReactTestRenderer) {
  return renderer.root.findByType(SectionList).props.sections.flatMap(
    (section: { data: Record<string, unknown>[] }) => section.data,
  ) as Record<string, unknown>[];
}

function inboxButton(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType(TouchableOpacity).find(
    (node) => node.props.accessibilityLabel === label,
  )!;
}

function refreshInbox(renderer: ReactTestRenderer) {
  renderer.root.findByType(SectionList).props.refreshControl.props.onRefresh();
}

const unreadItem = { id: 'n1', title: 'Cập nhật đơn', body: 'Nội dung', isRead: false, type: 'BOOKING' };
const fullPage = Array.from({ length: 20 }, (_, index) => ({ ...unreadItem, id: `n${index + 1}` }));

function visibleText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      if (typeof children === 'string' || typeof children === 'number') return String(children);
      if (Array.isArray(children))
        return children.map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('');
      return '';
    })
    .join('\n');
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
      const wMin = typeof style.minWidth === 'number' ? style.minWidth : 0;
      const w = typeof style.width === 'number' ? style.width : 0;
      return Math.max(min, h, wMin, w);
    }),
  );
}

const baseProfile = {
  bio: null,
  yearsExperience: 3,
  isAvailable: true,
  averageRating: null,
  ratingCount: 0,
  reliabilityScore: null,
  serviceRadiusKm: null,
  schedules: [],
};

function mockNotificationsPage(items: Record<string, unknown>[], unread = 0) {
  (mockNotificationsApi.getNotifications as jest.Mock).mockResolvedValue({
    success: true,
    statusCode: 200,
    message: 'ok',
    data: { data: items, total: items.length },
  });
  (mockNotificationsApi.getCountUnread as jest.Mock).mockResolvedValue(unread);
}

async function renderNotifications(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(TechnicianNotificationsScreen));
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBadgeListeners.clear();
  mockReduceMotion = false;
  mockUnreadCount = 0;
  Object.assign(mockAuthUser, {
    id: 'tech-1',
    fullName: 'Nguyen Van A',
    email: 'tech@example.test',
    phoneNumber: '0901234567',
    avatarUrl: null,
  });
  mockNavigate.mockClear();
  mockCanGoBack.mockReturnValue(false);
  mockUsersApi.getProfile.mockResolvedValue(null as never);
  mockUsersApi.getAddresses.mockResolvedValue([]);
  mockProfileApi.getMyProfile.mockResolvedValue({ ...baseProfile } as never);
  mockProfileApi.getMyServices.mockResolvedValue([]);
  mockVerificationApi.getMyVerification.mockResolvedValue(null);
  mockOrdersApi.getMyOrders.mockResolvedValue([]);
  mockServicesApi.getServices.mockResolvedValue({ data: [], total: 0 } as never);
  mockServicesApi.getCategories.mockResolvedValue([]);
  (mockNotificationsApi.getNotifications as jest.Mock).mockResolvedValue({
    success: true,
    statusCode: 200,
    message: 'ok',
    data: { data: [], total: 0 },
  });
  (mockNotificationsApi.getCountUnread as jest.Mock).mockResolvedValue(0);
  (mockNotificationsApi.readAll as jest.Mock).mockResolvedValue(undefined);
  (mockNotificationsApi.readNotification as jest.Mock).mockResolvedValue(undefined);
});

describe('technician notifications real UI (T-RUI5)', () => {
  it('blocks read-all during initial loading so invalidation cannot produce an unconfirmed empty inbox', async () => {
    mockUnreadCount = 1;
    const page = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(page.promise);
    const renderer = await renderNotifications();
    const markAll = inboxButton(renderer, 'Đánh dấu đã đọc tất cả');
    expect(markAll.props.disabled).toBe(true);
    await act(async () => markAll.props.onPress());
    expect(mockNotificationsApi.readAll).not.toHaveBeenCalled();
    await act(async () => page.resolve(notificationPage([unreadItem])));
    expect(notificationRows(renderer)).toEqual([unreadItem]);
    expect(inboxButton(renderer, 'Đánh dấu đã đọc tất cả').props.disabled).toBe(false);
    await act(async () => renderer.unmount());
  });

  it.each([undefined, null, {}, { data: {} }])('rejects malformed successful page %j with retry', async (data) => {
    (mockNotificationsApi.getNotifications as jest.Mock).mockResolvedValueOnce({ success: true, data });
    const renderer = await renderNotifications();
    expect(visibleText(renderer)).toContain('Không thể tải thông báo');
    expect(visibleText(renderer)).not.toContain('Chưa có thông báo nào');
    const retry = renderer.root.findAllByType(TouchableOpacity).find(
      (node) => node.findAllByType(Text).some((text) => text.props.children === 'Thử lại'),
    )!;
    await act(async () => retry.props.onPress());
    expect(visibleText(renderer)).toContain('Chưa có thông báo nào');
    await act(async () => renderer.unmount());
  });

  it('preserves the last list on malformed refresh and accepts a subsequent valid empty page', async () => {
    mockNotificationsPage([unreadItem], 1);
    const renderer = await renderNotifications();
    (mockNotificationsApi.getNotifications as jest.Mock).mockResolvedValueOnce({ success: true, data: {} });
    await act(async () => refreshInbox(renderer));
    expect(notificationRows(renderer)).toEqual([unreadItem]);
    expect(visibleText(renderer)).toContain('Không thể tải thông báo');
    mockNotificationsPage([], 0);
    await act(async () => refreshInbox(renderer));
    expect(notificationRows(renderer)).toEqual([]);
    expect(visibleText(renderer)).toContain('Chưa có thông báo nào');
    expect(visibleText(renderer)).not.toContain('Không thể tải thông báo');
    await act(async () => renderer.unmount());
  });

  it('does not let a count GET started before read-all restore the unread badge', async () => {
    mockNotificationsPage([unreadItem], 1);
    mockUnreadCount = 1;
    const count = deferred<number>();
    mockNotificationsApi.getCountUnread.mockReturnValueOnce(count.promise);
    const renderer = await renderNotifications();
    await act(async () => inboxButton(renderer, 'Đánh dấu đã đọc tất cả').props.onPress());
    expect(visibleText(renderer)).not.toContain('Danh sách từ máy chủ');
    await act(async () => count.resolve(8));
    expect(visibleText(renderer)).not.toContain('8 chưa đọc');
    expect(mockUnreadCount).toBe(0);
    await act(async () => renderer.unmount());
  });

  it('keeps the newest confirmed count after a single read without inventing a decrement', async () => {
    mockNotificationsPage([unreadItem], 4);
    mockUnreadCount = 4;
    const oldCount = deferred<number>();
    const newCount = deferred<number>();
    mockNotificationsApi.getCountUnread.mockReturnValueOnce(oldCount.promise).mockReturnValueOnce(newCount.promise);
    const renderer = await renderNotifications();
    await act(async () => inboxButton(renderer, 'Chưa đọc. Cập nhật đơn. Nội dung').props.onPress());
    expect(notificationRows(renderer)[0].isRead).toBe(true);
    expect(mockUnreadCount).toBe(4);
    await act(async () => newCount.resolve(6));
    expect(visibleText(renderer)).toContain('6 chưa đọc');
    await act(async () => oldCount.resolve(9));
    expect(visibleText(renderer)).toContain('6 chưa đọc');
    expect(mockUnreadCount).toBe(6);
    await act(async () => renderer.unmount());
  });

  it('ignores an older count GET after a newer refresh count, even without a PATCH', async () => {
    const oldCount = deferred<number>();
    const newCount = deferred<number>();
    mockNotificationsApi.getCountUnread.mockReturnValueOnce(oldCount.promise).mockReturnValueOnce(newCount.promise);
    const renderer = await renderNotifications();
    await act(async () => refreshInbox(renderer));
    await act(async () => newCount.resolve(3));
    await act(async () => oldCount.resolve(10));
    expect(visibleText(renderer)).toContain('3 chưa đọc');
    expect(mockUnreadCount).toBe(3);
    await act(async () => renderer.unmount());
  });

  it('does not let a single-read count GET overwrite later read-all confirmation', async () => {
    mockNotificationsPage([unreadItem], 4);
    const renderer = await renderNotifications();
    const count = deferred<number>();
    mockNotificationsApi.getCountUnread.mockReturnValueOnce(count.promise);
    await act(async () => inboxButton(renderer, 'Chưa đọc. Cập nhật đơn. Nội dung').props.onPress());
    await act(async () => inboxButton(renderer, 'Đánh dấu đã đọc tất cả').props.onPress());
    await act(async () => count.resolve(3));
    expect(visibleText(renderer)).not.toContain('Danh sách từ máy chủ');
    expect(mockUnreadCount).toBe(0);
    await act(async () => renderer.unmount());
  });

  it('accepts a fresh count after overlapping single-read and read-all PATCH confirmations', async () => {
    mockNotificationsPage([unreadItem], 4);
    const renderer = await renderNotifications();
    const read = deferred<void>();
    mockNotificationsApi.readNotification.mockReturnValueOnce(read.promise);
    await act(async () => inboxButton(renderer, 'Chưa đọc. Cập nhật đơn. Nội dung').props.onPress());
    await act(async () => inboxButton(renderer, 'Đánh dấu đã đọc tất cả').props.onPress());
    expect(mockUnreadCount).toBe(0);
    mockNotificationsApi.getCountUnread.mockResolvedValueOnce(2);
    await act(async () => read.resolve());
    expect(notificationRows(renderer)[0].isRead).toBe(true);
    expect(visibleText(renderer)).toContain('2 chưa đọc');
    await act(async () => renderer.unmount());
  });

  it('keeps the previous confirmed count when the post-read count GET fails', async () => {
    mockNotificationsPage([unreadItem], 4);
    const renderer = await renderNotifications();
    mockNotificationsApi.getCountUnread.mockRejectedValueOnce(new Error('offline'));
    await act(async () => inboxButton(renderer, 'Chưa đọc. Cập nhật đơn. Nội dung').props.onPress());
    expect(notificationRows(renderer)[0].isRead).toBe(true);
    expect(visibleText(renderer)).toContain('4 chưa đọc');
    expect(mockUnreadCount).toBe(4);
    await act(async () => renderer.unmount());
  });

  it.each(['single', 'all'] as const)('does not let pending refresh undo a confirmed %s read', async (mark) => {
    mockNotificationsPage(fullPage, 20);
    const renderer = await renderNotifications();
    const page = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(page.promise);
    await act(async () => refreshInbox(renderer));
    await act(async () => {
      void inboxButton(renderer, mark === 'all' ? 'Đánh dấu đã đọc tất cả' : 'Chưa đọc. Cập nhật đơn. Nội dung').props.onPress();
    });
    await act(async () => page.resolve(notificationPage(fullPage)));
    expect(notificationRows(renderer)[0].isRead).toBe(true);
    expect(renderer.root.findByType(SectionList).props.refreshControl.props.refreshing).toBe(false);
    if (mark === 'all') expect(notificationRows(renderer).every((item) => item.isRead)).toBe(true);
    // Invalidation must not wedge pagination or fresh refreshes.
    mockNotificationsPage([{ ...unreadItem, isRead: true }], 0);
    await act(async () => refreshInbox(renderer));
    expect(notificationRows(renderer)).toEqual([{ ...unreadItem, isRead: true }]);
    await act(async () => renderer.unmount());
  });

  it.each(['single', 'all'] as const)('discards pending pagination after a confirmed %s read and retries the same page', async (mark) => {
    mockNotificationsPage(fullPage, 20);
    const renderer = await renderNotifications();
    const page = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(page.promise);
    let pagination!: Promise<void>;
    await act(async () => { pagination = renderer.root.findByType(SectionList).props.onEndReached(); });
    await act(async () => {
      void inboxButton(renderer, mark === 'all' ? 'Đánh dấu đã đọc tất cả' : 'Chưa đọc. Cập nhật đơn. Nội dung').props.onPress();
    });
    await act(async () => { page.resolve(notificationPage([{ ...unreadItem, id: 'n21' }])); await pagination; });
    expect(notificationRows(renderer)).toHaveLength(20);
    expect(notificationRows(renderer)[0].isRead).toBe(true);
    mockNotificationsPage([{ ...unreadItem, id: 'n21', isRead: true }], 0);
    await act(async () => renderer.root.findByType(SectionList).props.onEndReached());
    expect(mockNotificationsApi.getNotifications).toHaveBeenLastCalledWith(2, 20);
    expect(notificationRows(renderer)).toHaveLength(21);
    await act(async () => renderer.unmount());
  });

  it('does not let old pagination restore rows or pageRef after refresh', async () => {
    mockNotificationsPage(fullPage, 20);
    const renderer = await renderNotifications();
    const page = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(page.promise);
    let pagination!: Promise<void>;
    await act(async () => { pagination = renderer.root.findByType(SectionList).props.onEndReached(); });
    const refreshed = fullPage.map((item) => ({ ...item, isRead: true }));
    mockNotificationsPage(refreshed, 0);
    await act(async () => refreshInbox(renderer));
    await act(async () => { page.resolve(notificationPage([{ ...unreadItem, id: 'old-page' }])); await pagination; });
    expect(notificationRows(renderer)).toEqual(refreshed);
    mockNotificationsPage([{ ...unreadItem, id: 'fresh-page', isRead: true }], 0);
    await act(async () => renderer.root.findByType(SectionList).props.onEndReached());
    expect(mockNotificationsApi.getNotifications).toHaveBeenLastCalledWith(2, 20);
    expect(notificationRows(renderer).at(-1)?.id).toBe('fresh-page');
    await act(async () => renderer.unmount());
  });

  it('keeps the newer first page when overlapping refreshes finish out of order', async () => {
    mockNotificationsPage([unreadItem], 1);
    const renderer = await renderNotifications();
    const older = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    const newer = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await act(async () => refreshInbox(renderer));
    await act(async () => refreshInbox(renderer));
    await act(async () => newer.resolve(notificationPage([{ ...unreadItem, id: 'new' }])));
    await act(async () => older.resolve(notificationPage([unreadItem])));
    expect(notificationRows(renderer)[0].id).toBe('new');
    await act(async () => renderer.unmount());
  });

  it('does not let an older failed refresh overwrite a newer successful refresh with an error', async () => {
    mockNotificationsPage([unreadItem], 1);
    const renderer = await renderNotifications();
    const older = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(older.promise);
    await act(async () => refreshInbox(renderer));
    mockNotificationsPage([{ ...unreadItem, id: 'new' }], 1);
    await act(async () => refreshInbox(renderer));
    await act(async () => older.reject(new Error('offline')));
    expect(notificationRows(renderer)[0].id).toBe('new');
    expect(visibleText(renderer)).not.toContain('Không thể tải thông báo');
    await act(async () => renderer.unmount());
  });

  it('keeps rows and pageRef on malformed pagination and retries the same page', async () => {
    mockNotificationsPage(fullPage, 20);
    const renderer = await renderNotifications();
    mockNotificationsApi.getNotifications.mockResolvedValueOnce({ success: true, data: {} } as never);
    await act(async () => renderer.root.findByType(SectionList).props.onEndReached());
    expect(notificationRows(renderer)).toEqual(fullPage);
    expect(visibleText(renderer)).toContain('Không thể tải thông báo');
    mockNotificationsPage([{ ...unreadItem, id: 'n21' }], 21);
    await act(async () => renderer.root.findByType(SectionList).props.onEndReached());
    expect(mockNotificationsApi.getNotifications).toHaveBeenLastCalledWith(2, 20);
    expect(notificationRows(renderer)).toHaveLength(21);
    expect(visibleText(renderer)).not.toContain('Không thể tải thông báo');
    await act(async () => renderer.unmount());
  });

  it('locks duplicate pagination callbacks in the same render', async () => {
    mockNotificationsPage(fullPage, 20);
    const renderer = await renderNotifications();
    const page = deferred<Awaited<ReturnType<typeof notificationsApi.getNotifications>>>();
    mockNotificationsApi.getNotifications.mockReturnValueOnce(page.promise);
    const loadMore = renderer.root.findByType(SectionList).props.onEndReached;
    let first!: Promise<void>;
    await act(async () => { first = loadMore(); void loadMore(); });
    expect(mockNotificationsApi.getNotifications).toHaveBeenCalledTimes(2);
    await act(async () => { page.resolve(notificationPage([])); await first; });
    expect(notificationRows(renderer)).toHaveLength(20);
    await act(async () => renderer.unmount());
  });

  it('locks duplicate same-id PATCH while preserving order navigation and unread until confirmation', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    mockNotificationsPage([{ ...unreadItem, referenceType: 'SERVICE_ORDER', referenceId: id }], 1);
    const read = deferred<void>();
    mockNotificationsApi.readNotification.mockReturnValueOnce(read.promise);
    const renderer = await renderNotifications();
    const row = inboxButton(renderer, 'Chưa đọc. Cập nhật đơn. Nội dung');
    await act(async () => { row.props.onPress(); row.props.onPress(); });
    expect(mockNotificationsApi.readNotification).toHaveBeenCalledTimes(1);
    expect(notificationRows(renderer)[0].isRead).toBe(false);
    expect(mockNavigate).toHaveBeenLastCalledWith('TechnicianOrderDetail', { serviceOrderId: id });
    await act(async () => read.resolve());
    expect(notificationRows(renderer)[0].isRead).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('shows loading copy with no fake rows while fetching', async () => {
    (mockNotificationsApi.getNotifications as jest.Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    (mockNotificationsApi.getCountUnread as jest.Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    const renderer = await renderNotifications();
    expect(visibleText(renderer)).toContain('Thông báo');
    expect(visibleText(renderer)).toContain('Đang tải…');
    expect(visibleText(renderer)).not.toContain('Chưa có thông báo nào');
    await act(async () => renderer.unmount());
  });

  it('does not optimistically clear one unread item before the PATCH succeeds', async () => {
    mockNotificationsPage([
      { id: 'n1', title: 'Lời mời mới', body: 'Bạn có lời mời mới', createdAt: '2026-10-09T01:00:00Z', isRead: false, type: 'BOOKING' },
    ], 1);
    mockUnreadCount = 1;
    let finishRead!: () => void;
    (mockNotificationsApi.readNotification as jest.Mock).mockReturnValueOnce(
      new Promise<void>((resolve) => { finishRead = resolve; }),
    );
    const renderer = await renderNotifications();
    const row = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.includes('Chưa đọc. Lời mời mới'),
    )[0];
    expect(row).toBeDefined();
    await act(async () => row.props.onPress());
    expect(mockNotificationsApi.readNotification).toHaveBeenCalledTimes(1);
    expect(visibleText(renderer)).toContain('1 chưa đọc');
    expect(mockSetUnreadNotifications).not.toHaveBeenCalledWith(0);
    await act(async () => finishRead());
    expect(renderer.root.findAll(
      (node) => node.type === TouchableOpacity && typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.startsWith('Chưa đọc. Lời mời mới'),
    )).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('leaves a single item unread and shows an error if the PATCH fails', async () => {
    mockNotificationsPage([
      { id: 'n2', title: 'Cập nhật đơn', body: 'Đơn được cập nhật', createdAt: '2026-10-09T01:00:00Z', isRead: false, type: 'BOOKING' },
    ], 1);
    mockUnreadCount = 1;
    (mockNotificationsApi.readNotification as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const renderer = await renderNotifications();
    const row = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.includes('Chưa đọc. Cập nhật đơn'),
    )[0];
    await act(async () => row.props.onPress());
    expect(visibleText(renderer)).toContain('Không thể đánh dấu đã đọc');
    expect(mockSetUnreadNotifications).not.toHaveBeenCalledWith(0);
    expect(renderer.root.findAll(
      (node) => node.type === TouchableOpacity && typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.startsWith('Chưa đọc. Cập nhật đơn'),
    )).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it('shows an honest empty inbox after a confirmed empty page', async () => {
    mockNotificationsPage([], 0);
    const renderer = await renderNotifications();
    const text = visibleText(renderer);
    expect(text).toContain('Chưa có thông báo nào');
    expect(text).toContain('Khi có lời mời nhận việc hoặc cập nhật đơn');
    expect(mockNotificationsApi.readAll).not.toHaveBeenCalled();
    expect(mockNotificationsApi.readNotification).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('marks all read only after the confirmed API and keeps badge from server sources', async () => {
    const items = [
      { id: 'n1', title: 'Lời mời mới', body: 'Bạn có lời mời mới', createdAt: '2026-10-09T01:00:00Z', isRead: false, type: 'BOOKING' },
      { id: 'n2', title: 'Thanh toán', body: 'Đã nhận tiền', createdAt: '2026-10-08T01:00:00Z', isRead: false, type: 'PAYMENT' },
    ];
    mockNotificationsPage(items, 2);
    mockUnreadCount = 2;
    const readAll = deferred<void>();
    mockNotificationsApi.readAll.mockReturnValueOnce(readAll.promise);
    const renderer = await renderNotifications();
    expect(visibleText(renderer)).toContain('2 chưa đọc');
    const markAll = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Đánh dấu đã đọc tất cả',
    );
    expect(markAll).toHaveLength(1);
    await act(async () => {
      markAll[0].props.onPress();
      markAll[0].props.onPress();
    });
    expect(mockNotificationsApi.readAll).toHaveBeenCalledTimes(1);
    expect(notificationRows(renderer).every((item) => item.isRead === false)).toBe(true);
    expect(mockSetUnreadNotifications).not.toHaveBeenCalledWith(0);
    expect(inboxButton(renderer, 'Đánh dấu đã đọc tất cả').props.disabled).toBe(true);
    await act(async () => readAll.resolve());
    expect(mockSetUnreadNotifications).toHaveBeenCalledWith(0);
    expect(visibleText(renderer)).not.toContain('Danh sách từ máy chủ');
    await act(async () => renderer.unmount());
  });

  it('does not claim read-all success when the API fails', async () => {
    const items = [
      { id: 'n1', title: 'Lời mời mới', body: 'Bạn có lời mời mới', createdAt: '2026-10-09T01:00:00Z', isRead: false, type: 'BOOKING' },
    ];
    mockNotificationsPage(items, 1);
    mockUnreadCount = 1;
    (mockNotificationsApi.readAll as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const renderer = await renderNotifications();
    const markAll = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Đánh dấu đã đọc tất cả',
    );
    await act(async () => {
      markAll[0].props.onPress();
    });
    expect(mockNotificationsApi.readAll).toHaveBeenCalledTimes(1);
    // Badge is not cleared and the failure is surfaced honestly.
    expect(mockSetUnreadNotifications).not.toHaveBeenCalledWith(0);
    expect(visibleText(renderer)).toContain('Không thể đánh dấu đã đọc');
    await act(async () => renderer.unmount());
  });

  it('keeps every touch target at 44pt or more and every text size at 12 or more', async () => {
    mockNotificationsPage(
      [
        { id: 'n1', title: 'Lời mời mới', body: 'Bạn có lời mời mới', createdAt: '2026-10-09T01:00:00Z', isRead: false, type: 'BOOKING' },
      ],
      1,
    );
    mockUnreadCount = 1;
    const inbox = await renderNotifications();
    for (const renderer of [inbox]) {
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
    await act(async () => inbox.unmount());
  });
});

describe('T14A REAL Technician notifications Codex header/card visual fidelity', () => {
  it('uses one accessible Thông báo title without redundant header copy', async () => {
    mockNotificationsPage([], 0);
    const r = await renderNotifications();
    const t = visibleText(r);
    expect(r.root.findAllByType(Text).filter(x => x.props.accessibilityRole === 'header' && x.props.children === 'Thông báo')).toHaveLength(1);
    expect(t).not.toContain('Điều cần bạn biết');
    expect(t).not.toContain('Danh sách từ máy chủ');
    await act(async () => r.unmount());
  });

  it('provides a 44pt back button that returns to the prior screen when possible', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockNotificationsPage([], 0);
    const r = await renderNotifications();
    const back = r.root.findAllByType(TouchableOpacity).find(x => x.props.accessibilityLabel === 'Quay lại');
    expect(back).toBeDefined();
    expect(touchHeight(back!)).toBeGreaterThanOrEqual(44);
    await act(async () => back!.props.onPress());
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('uses the Technician tab as a safe root fallback when no screen is behind it', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockNotificationsPage([], 0);
    const r = await renderNotifications();
    const back = r.root.findAllByType(TouchableOpacity).find(x => x.props.accessibilityLabel === 'Quay lại');
    expect(back).toBeDefined();
    await act(async () => back!.props.onPress());
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianMain');
    await act(async () => r.unmount());
  });

  it('shows only actual server unread count after load without marking read on mount', async () => {
    mockNotificationsPage([unreadItem], 2);
    const r = await renderNotifications();
    expect(visibleText(r)).toContain('2 chưa đọc');
    expect(mockNotificationsApi.readAll).not.toHaveBeenCalled();
    expect(mockNotificationsApi.readNotification).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('uses rounded theme-backed cards for loaded rows, 44pt touch targets unchanged', async () => {
    mockNotificationsPage([unreadItem], 1);
    const r = await renderNotifications();
    const row = inboxButton(r, 'Chưa đọc. Cập nhật đơn. Nội dung');
    expect(stylesOf(row.props.style).some(s => s.borderRadius === 16 && s.marginHorizontal === 16)).toBe(true);
    expect(touchHeight(row)).toBeGreaterThanOrEqual(44);
    expect(stylesOf(row.props.style).some(s => s.backgroundColor === '#eff6ff')).toBe(true);
    await act(async () => r.unmount());
  });

  it('retains a source-honest empty state, never fake Codex booking/message/paid fixtures', async () => {
    mockNotificationsPage([], 0);
    const r = await renderNotifications();
    const t = visibleText(r);
    expect(t).toContain('Chưa có thông báo nào');
    expect(t).not.toMatch(/Booking mẫu của bạn|Hội thoại gắn với yêu cầu|Thời điểm mẫu|Demo: mở liên kết đã cũ/);
    await act(async () => r.unmount());
  });

  it('continues to show a real source load failure and retry without auto PATCH', async () => {
    (mockNotificationsApi.getNotifications as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const r = await renderNotifications();
    const t = visibleText(r);
    expect(t).toContain('Không thể tải thông báo');
    expect(t).not.toContain('Chưa có thông báo nào');
    expect(mockNotificationsApi.readAll).not.toHaveBeenCalled();
    expect(mockNotificationsApi.readNotification).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
});
