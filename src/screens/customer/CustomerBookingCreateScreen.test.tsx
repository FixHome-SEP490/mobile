import React from 'react';
import { Image, ScrollView, TouchableOpacity, View } from 'react-native';
import CustomerBookingCreateScreen, { clearBookingCreateRuntimeForTest } from './CustomerBookingCreateScreen';
import { clearBookingAddressAttempt } from './CustomerBookingAddressEditor';
import type { BookingItem } from '../../api/bookings.api';
import type { ServiceItem } from '../../api/services.api';
import type { AddressData } from '../../api/users.api';
import { vnWallClockToDate } from '../../utils/vn-time';
import { createEntryAttemptJournal, type EntryAttemptJournal } from '../../features/order-flow/runtime/entry-attempt-journal';
let mockEntryJournal: EntryAttemptJournal;
const mockGetBooking = jest.fn();
jest.mock('../../features/order-flow/runtime/entry-attempt-production', () => {
  const { createBookingAttemptController } = jest.requireActual('../../features/order-flow/customer/booking-create-attempt');
  let sequence = 0;
  return {
    entryAttemptJournal: {
      restore: () => mockEntryJournal.restore(), blocked: (...args: Parameters<EntryAttemptJournal['blocked']>) => mockEntryJournal.blocked(...args),
      list: (owner: string) => mockEntryJournal.list(owner), subscribe: (fn: () => void) => mockEntryJournal.subscribe(fn),
    },
    createProductionBookingAttempt: (isCurrent: (owner: string) => boolean) => createBookingAttemptController({ journal: mockEntryJournal,
      api: { createBooking: (...args: unknown[]) => mockCreateBooking(...args), getBooking: (...args: unknown[]) => mockGetBooking(...args) }, isCurrent, newIntentId: () => `test-intent-${++sequence}` }),
  };
});

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const ADDRESS_ID = '22222222-2222-4222-8222-222222222222';
const ADDRESS_B_ID = '44444444-4444-4444-8444-444444444444';
const mockAuthState = {
  isAuthenticated: true,
  user: { id: 'customer-a', role: 'customer' },
  sessionGeneration: 1,
};
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockUsePreventRemove = jest.fn();
const mockRoute = { key: 'booking-flow-a', params: { prefill: { serviceId: SERVICE_ID } } };
const mockGetServices = jest.fn();
const mockGetAddresses = jest.fn();
const mockGetCategories = jest.fn();
const mockGetMyBookingsPage = jest.fn();
const mockCreateBooking = jest.fn();
const mockUploadBookingPhoto = jest.fn();
const mockUploadPublicImage = jest.fn();
const mockRequestMediaLibraryPermissions = jest.fn();
const mockLaunchImageLibrary = jest.fn();
const mockReviewSheetDismiss = jest.fn();

jest.mock('@react-navigation/native', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) =>
      ReactModule.useEffect(callback, [callback]),
    usePreventRemove: (prevent: boolean, callback: () => void) => mockUsePreventRemove(prevent, callback),
    useNavigation: () => mockNavigation,
    useRoute: () => mockRoute,
  };
});

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#3B82F6',
      primaryDark: '#1D4ED8',
      primaryStrong: '#2563EB',
      primarySoft: '#EFF6FF',
      primaryTint: '#DBEAFE',
      secondary: '#5C554C',
      background: '#F7F5F2',
      surface: '#FFFFFF',
      text: '#1A1714',
      textSecondary: '#5C554C',
      muted: '#7D7468',
      border: '#E2DDD6',
      divider: '#EFECE7',
      error: '#DC2626',
      success: '#059669',
      warning: '#D97706',
      info: '#175CD3',
    },
  }),
}));

jest.mock('../../api/bookings.api', () => ({
  bookingsApi: {
    getMyBookingsPage: (...args: unknown[]) => mockGetMyBookingsPage(...args),
    createBooking: (...args: unknown[]) => mockCreateBooking(...args),
    getBooking: (...args: unknown[]) => mockGetBooking(...args),
  },
}));

jest.mock('../../api/media.api', () => ({
  mediaApi: {
    uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
    uploadPublicImage: (...args: unknown[]) => mockUploadPublicImage(...args),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestMediaLibraryPermissions(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));

jest.mock('../../api/services.api', () => ({
  servicesApi: {
    getServices: (...args: unknown[]) => mockGetServices(...args),
    getCategories: (...args: unknown[]) => mockGetCategories(...args),
    getServiceById: jest.fn(),
  },
}));

jest.mock('../../components/AddressMap', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    __esModule: true,
    default: ({ children, onPress }: { children?: React.ReactNode; onPress?: (event: unknown) => void }) =>
      ReactModule.createElement(Native.View, { testID: 'booking-address-map', onPress }, children),
    Marker: () => null,
  };
});

jest.mock('../../api/geo.api', () => ({
  geoApi: { autocomplete: jest.fn(), reverse: jest.fn() },
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../../api/users.api', () => ({
  usersApi: { getAddresses: (...args: unknown[]) => mockGetAddresses(...args) },
}));

jest.mock('../../store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const BottomSheetModal = ReactModule.forwardRef(
    (
      props: { children?: React.ReactNode; onDismiss?: () => void },
      ref: React.Ref<{ present: () => void; dismiss: () => void }>,
    ) => {
      ReactModule.useImperativeHandle(ref, () => ({
        present: () => undefined,
        dismiss: () => {
          mockReviewSheetDismiss();
          props.onDismiss?.();
        },
      }));
      return ReactModule.createElement(Native.View, null, props.children);
    },
  );
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: Native.FlatList,
    BottomSheetModal,
    BottomSheetScrollView: Native.ScrollView,
    BottomSheetTextInput: Native.TextInput,
  };
});

jest.mock('react-native-safe-area-context', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});

jest.mock('@expo/ui/community/datetime-picker', () => ({
  DateTimePicker: () => null,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('lucide-react-native', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Icon = () => ReactModule.createElement(Native.View, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('../../components/CategoryPills', () => ({
  __esModule: true,
  default: () => null,
}));

type TestNode = {
  type: unknown;
  props: Record<string, unknown>;
  children: (TestNode | string | number)[];
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  findByProps: (props: Record<string, unknown>) => TestNode;
};
type TestRenderer = { root: TestNode; unmount: () => void; update: (element: React.ReactElement) => void };
const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => TestRenderer;
};

const service: ServiceItem = {
  id: SERVICE_ID,
  name: 'Sửa máy lạnh',
  categoryId: '33333333-3333-4333-8333-333333333333',
  pricingMode: 'fixed_price',
  basePrice: 250000,
  fixedPrice: 250000,
  isActive: true,
  sortOrder: 1,
};
const otherService: ServiceItem = {
  ...service,
  id: OTHER_SERVICE_ID,
  name: 'Khác',
  code: 'DICH_VU_KHAC',
  pricingMode: 'inspection_required',
  fixedPrice: null,
  basePrice: 0,
  minPrice: null,
  maxPrice: null,
};

const address: AddressData = {
  id: ADDRESS_ID,
  userId: 'customer-a',
  label: 'Nhà riêng',
  line1: '12 Đường Hoa',
  ward: 'Phường 1',
  district: 'Quận 3',
  province: 'TP. Hồ Chí Minh',
  lat: 10.7769,
  lng: 106.7009,
  isDefault: true,
};
const addressB: AddressData = {
  ...address,
  id: ADDRESS_B_ID,
  userId: 'customer-b',
  label: 'Nhà của khách B',
  line1: '99 Đường Mới',
};

function textContent(node: TestNode): string {
  return node.children
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : textContent(child),
    )
    .join('');
}

function findActions(renderer: TestRenderer, label: string): TestNode[] {
  return renderer.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.type === TouchableOpacity &&
      textContent(node).trim() === label,
  );
}

function findAccessibleActions(renderer: TestRenderer, label: string): TestNode[] {
  return renderer.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.type === TouchableOpacity &&
      node.props.accessibilityLabel === label,
  );
}

function findDescriptionInput(renderer: TestRenderer): TestNode | undefined {
  return renderer.root.findAll(
    (node) =>
      node.props.accessibilityLabel === 'Mô tả sự cố' ||
      node.props.accessibilityLabel === 'Mô tả yêu cầu',
  )[0];
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function switchOwner(renderer: TestRenderer, ownerId: string) {
  mockAuthState.sessionGeneration += 1;
  mockAuthState.user.id = ownerId;
  await act(async () => {
    // Re-render even when the current wizard stage has no visible text input.
    renderer.update(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
}

async function advanceToSchedule(renderer: TestRenderer) {
  if (findActions(renderer, 'Tiếp tục: Chọn địa chỉ').length) {
    await act(async () => {
      (findActions(renderer, 'Tiếp tục: Chọn địa chỉ')[0].props.onPress as () => void)();
      await flushPromises();
    });
  }
  // Nothing is pre-selected: pick this afternoon (the morning has started at the frozen 08:00).
  const slot = renderer.root.findAll((node) => node.props.testID === 'session-slot-afternoon' && typeof node.props.onPress === 'function')[0];
  if (slot) await act(async () => { (slot.props.onPress as () => void)(); await flushPromises(); });
  expect(findActions(renderer, 'Xem lại yêu cầu')).toHaveLength(1);
}

async function renderScreen(): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
  return renderer;
}

beforeEach(() => {
  let raw: string | null = null;
  mockEntryJournal = createEntryAttemptJournal({ getItem: async () => raw, setItem: async (_, value) => { raw = value; } });
  mockGetBooking.mockImplementation(async (id: string) => ({ id, customerId: mockAuthState.user.id }));
  jest.useFakeTimers().setSystemTime(vnWallClockToDate(2026, 9, 27, 8, 0));
  jest.clearAllMocks();
  mockAuthState.user.id = 'customer-a';
  mockAuthState.sessionGeneration = 1;
  mockRoute.key = 'booking-flow-a';
  mockRoute.params.prefill.serviceId = SERVICE_ID;
  mockGetServices.mockResolvedValue({ data: [service], total: 1 });
  mockGetAddresses.mockImplementation(async () =>
    mockAuthState.user.id === 'customer-b' ? [addressB] : [address],
  );
  mockGetCategories.mockResolvedValue([]);
  mockGetMyBookingsPage.mockResolvedValue({ data: [], total: 0 });
  mockRequestMediaLibraryPermissions.mockResolvedValue({ granted: true });
  mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: [] });
  mockUploadBookingPhoto.mockResolvedValue({
    uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
  });
  mockCreateBooking.mockResolvedValue({
    id: 'booking-created',
    customerId: 'customer-a',
  } satisfies Partial<BookingItem>);
});

it('restored unknown create marker blocks a new Booking after runtime snapshot is gone', async () => {
  await mockEntryJournal.restore();
  await mockEntryJournal.begin({ ownerUserId: 'customer-a', intentId: 'prior', kind: 'booking-create', baselineIds: null, createdAt: 1 });
  const tree = await renderScreen();
  expect(textContent(tree.root)).toContain('Không gửi lại');
  expect(textContent(tree.root)).toContain('Mở lịch sử yêu cầu');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

afterEach(() => {
  clearBookingAddressAttempt('customer-a');
  clearBookingAddressAttempt('customer-b');
  clearBookingCreateRuntimeForTest('customer-a');
  clearBookingCreateRuntimeForTest('customer-b');
  jest.useRealTimers();
});

it('shows and focuses the required description error when review is requested blank', async () => {
  const renderer = await renderScreen();
  const continueActions = findActions(renderer, 'Tiếp tục: Chọn địa chỉ');
  expect(continueActions).toHaveLength(1);
  await act(async () => {
    (continueActions[0].props.onPress as () => void)();
    await flushPromises();
  });

  expect(textContent(renderer.root)).toContain(
    'Vui lòng mô tả sự cố để tiếp tục.',
  );
  expect(mockGetMyBookingsPage).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('turns the canonical Other service into a free-description request without inventing a price', async () => {
  mockRoute.params.prefill.serviceId = OTHER_SERVICE_ID;
  mockGetServices.mockResolvedValue({ data: [otherService], total: 1 });

  const renderer = await renderScreen();
  expect(textContent(renderer.root)).toContain('Yêu cầu ngoài danh sách');
  expect(textContent(renderer.root)).toContain('kỹ thuật viên sẽ khảo sát và báo giá');

  const descriptionInput = findDescriptionInput(renderer);
  expect(descriptionInput?.props.accessibilityLabel).toBe('Mô tả yêu cầu');
  expect(descriptionInput?.props.placeholder).toContain('Cửa tủ bếp bung bản lề');

  const continueActions = findActions(renderer, 'Tiếp tục: Chọn địa chỉ');
  await act(async () => {
    (continueActions[0].props.onPress as () => void)();
    await flushPromises();
  });

  expect(textContent(renderer.root)).toContain(
    'Vui lòng mô tả công việc bạn cần hỗ trợ để tiếp tục.',
  );
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('keeps review local, then creates exactly the immutable reviewed request on confirm', async () => {
  const renderer = await renderScreen();
  const descriptionInput = findDescriptionInput(renderer);
  expect(descriptionInput).toBeDefined();
  if (!descriptionInput) return;

  await act(async () => {
    (descriptionInput.props.onChangeText as (value: string) => void)(
      'Máy lạnh chảy nước',
    );
  });

  await advanceToSchedule(renderer);
  const reviewActions = findActions(renderer, 'Xem lại yêu cầu');
  expect(reviewActions).toHaveLength(1);
  if (reviewActions.length !== 1) return;
  await act(async () => {
    (reviewActions[0].props.onPress as () => void)();
    await flushPromises();
  });

  expect(mockGetMyBookingsPage).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(textContent(renderer.root)).toContain('Sửa máy lạnh');
  expect(textContent(renderer.root)).toContain('Nhà riêng');
  expect(textContent(renderer.root)).toContain('Máy lạnh chảy nước');
  expect(textContent(renderer.root)).toContain('Chiều 13:00 - 18:00');
  expect(textContent(renderer.root)).toContain('Số lượng: 1');

  // The wizard hides Intake while reviewing: there is no background editable
  // description control that can silently mutate the immutable submit snapshot.
  expect(findDescriptionInput(renderer)).toBeUndefined();

  const confirmActions = findActions(renderer, 'Xác nhận đặt lịch');
  expect(confirmActions).toHaveLength(1);
  if (confirmActions.length !== 1) return;
  await act(async () => {
    (confirmActions[0].props.onPress as () => void)();
    (confirmActions[0].props.onPress as () => void)();
    await flushPromises();
  });

  expect(mockGetMyBookingsPage).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  expect(mockCreateBooking).toHaveBeenCalledWith({
    serviceId: SERVICE_ID,
    addressId: ADDRESS_ID,
    description: 'Máy lạnh chảy nước',
    mode: 'scheduled',
    date: '2026-09-27',
    slot: 'afternoon',
    preferredStartAt: vnWallClockToDate(2026, 9, 27, 13, 0).toISOString(),
    preferredEndAt: vnWallClockToDate(2026, 9, 27, 18, 0).toISOString(),
    quantity: 1,
    urgency: 'NORMAL',
  });
  expect(textContent(renderer.root)).toContain('Đã gửi yêu cầu');
  const receipt = renderer.root.findByProps({ testID: 'booking-submitted-receipt' });
  expect(textContent(receipt)).toContain('Sửa máy lạnh');
  expect(textContent(receipt)).toContain('Máy lạnh chảy nước');
  expect(textContent(receipt)).toContain('Chiều 13:00 - 18:00');
  expect(textContent(receipt)).toContain('12 Đường Hoa');
  expect(textContent(receipt)).toContain('Giá cố định:');
  expect(textContent(receipt)).toContain('Số lượng: 1');
  expect(textContent(receipt)).toContain('Ảnh đính kèm: 0/5');
  expect(renderer.root.findAll((node) => node.props.testID === 'booking-confirmed-art')).toHaveLength(0);
  expect(textContent(renderer.root)).toContain('Về trang chủ');
  expect(mockUsePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
  await act(async () => (findAccessibleActions(renderer, 'Quay lại')[0].props.onPress as () => void)());
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

const bookingPhoto = {
  assetId: 'booking-photo-a',
  uri: 'file:///issue-a.jpg',
  fileName: 'issue-a.jpg',
  mimeType: 'image/jpeg',
  fileSize: 2048,
  width: 1200,
  height: 900,
  type: 'image',
};

async function selectBookingPhoto(renderer: TestRenderer, asset = bookingPhoto) {
  // Schedule has no intake summary: return through the real Back controls.
  for (let step = 0; step < 2 && !findAccessibleActions(renderer, 'Thêm ảnh sự cố')[0]; step++) {
    const back = findAccessibleActions(renderer, 'Quay lại')[0];
    expect(back).toBeDefined();
    await act(async () => { (back.props.onPress as () => void)(); });
  }
  const addPhoto = findAccessibleActions(renderer, 'Thêm ảnh sự cố')[0];
  expect(addPhoto).toBeDefined();
  if (!addPhoto) return;
  await act(async () => {
    (addPhoto.props.onPress as () => void)();
    await flushPromises();
  });
  return asset;
}

async function openAndConfirmReview(renderer: TestRenderer) {
  await advanceToSchedule(renderer);
  await advanceToSchedule(renderer);
  const review = findActions(renderer, 'Xem lại yêu cầu')[0];
  expect(review).toBeDefined();
  if (!review) return;
  await act(async () => {
    (review.props.onPress as () => void)();
    await flushPromises();
  });
  const confirm = findActions(renderer, 'Xác nhận đặt lịch')[0];
  expect(confirm).toBeDefined();
  if (!confirm) return;
  await act(async () => {
    (confirm.props.onPress as () => void)();
    await flushPromises();
  });
}

it('keeps the immutable Review visible and locked while the POST is pending, including remount', async () => {
  const pending = deferred<Partial<BookingItem>>();
  mockCreateBooking.mockReturnValueOnce(pending.promise);
  let renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Round 2 pending');
    });
    await openAndConfirmReview(renderer);
    expect(findActions(renderer, 'Đang gửi yêu cầu...')).toHaveLength(1);
    expect(findActions(renderer, 'Xem lại yêu cầu')).toHaveLength(0);
    expect(textContent(renderer.root)).toContain('Round 2 pending');
    await act(async () => renderer.unmount());
    renderer = await renderScreen();
    expect(findActions(renderer, 'Đang gửi yêu cầu...')).toHaveLength(1);
    expect(textContent(renderer.root)).toContain('Round 2 pending');
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ id: 'booking-a', customerId: 'customer-a' });
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('Đã gửi yêu cầu');
  } finally {
    await act(async () => renderer.unmount());
  }
});

it.each([SERVICE_ID, OTHER_SERVICE_ID])('starts a fresh %s booking flow with an empty draft after a confirmed request', async (nextServiceId) => {
  mockGetServices.mockResolvedValue({ data: [service, otherService], total: 2 });
  let renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Old request A');
    });
    await openAndConfirmReview(renderer);
    expect(textContent(renderer.root)).toContain('Đã gửi yêu cầu');
    // React Navigation may reuse the mounted screen with new route params.
    mockRoute.key = 'booking-flow-b';
    mockRoute.params.prefill.serviceId = nextServiceId;
    await act(async () => {
      renderer.update(React.createElement(CustomerBookingCreateScreen));
      await flushPromises();
    });
    expect(findDescriptionInput(renderer)?.props.value).toBe('');
    expect(findActions(renderer, 'Tiếp tục: Chọn địa chỉ')).toHaveLength(1);
    expect(textContent(renderer.root)).not.toContain('Old request A');
    expect(textContent(renderer.root)).not.toContain('Đã gửi yêu cầu');
    expect(findDescriptionInput(renderer)?.props.accessibilityLabel).toBe(nextServiceId === OTHER_SERVICE_ID ? 'Mô tả yêu cầu' : 'Mô tả sự cố');
    await act(async () => renderer.unmount());
    renderer = await renderScreen();
    expect(findActions(renderer, 'Tiếp tục: Chọn địa chỉ')).toHaveLength(1);
    expect(textContent(renderer.root)).not.toContain('Old request A');
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('retains each confirmed flow after A and B complete without reopening a confirmed draft for resubmission', async () => {
  mockGetServices.mockResolvedValue({ data: [service, otherService], total: 2 });
  mockCreateBooking.mockResolvedValueOnce({ id: 'booking-a', customerId: 'customer-a' })
    .mockResolvedValueOnce({ id: 'booking-b', customerId: 'customer-a' });
  const renderer = await renderScreen();
  try {
    await act(async () => (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Confirmed A'));
    await openAndConfirmReview(renderer);
    mockRoute.key = 'booking-flow-b';
    mockRoute.params.prefill.serviceId = OTHER_SERVICE_ID;
    await act(async () => { renderer.update(React.createElement(CustomerBookingCreateScreen)); await flushPromises(); });
    await act(async () => (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Confirmed B'));
    await openAndConfirmReview(renderer);
    expect(textContent(renderer.root)).toContain('Confirmed B');
    mockRoute.key = 'booking-flow-a';
    mockRoute.params.prefill.serviceId = SERVICE_ID;
    await act(async () => { renderer.update(React.createElement(CustomerBookingCreateScreen)); await flushPromises(); });
    expect(textContent(renderer.root)).toContain('Confirmed A');
    expect(textContent(renderer.root)).not.toContain('Confirmed B');
    expect(findActions(renderer, 'Xác nhận đặt lịch')).toHaveLength(0);
    expect(findActions(renderer, 'Chọn kỹ thuật viên')).toHaveLength(1);
    expect(mockCreateBooking).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('keeps new-address save outside the scroll body and Back returns to the saved-address stage', async () => {
  const renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Address footer');
    });
    await act(async () => (findActions(renderer, 'Tiếp tục: Chọn địa chỉ')[0].props.onPress as () => void)());
    await act(async () => (findAccessibleActions(renderer, 'Thêm địa chỉ mới')[0].props.onPress as () => void)());
    expect(findAccessibleActions(renderer, 'Lưu địa chỉ mới')).toHaveLength(1);
    for (const scroll of renderer.root.findAll((node) => node.type === ScrollView)) {
      expect(scroll.findAll((node) => node.props.accessibilityLabel === 'Lưu địa chỉ mới')).toHaveLength(0);
    }
    await act(async () => (findAccessibleActions(renderer, 'Quay lại')[0].props.onPress as () => void)());
    expect(findActions(renderer, 'Xem lại yêu cầu')).toHaveLength(1);
    expect(mockCreateBooking).not.toHaveBeenCalled();
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('keeps a rejected POST locked after remount until explicit authoritative readback', async () => {
  const pending = deferred<Partial<BookingItem>>();
  mockCreateBooking.mockReturnValueOnce(pending.promise);
  let renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Retained Review');
    });
    await openAndConfirmReview(renderer);
    await act(async () => renderer.unmount());
    renderer = await renderScreen();
    await act(async () => {
      pending.reject({ response: { status: 400 } });
      await flushPromises();
    });
    expect(findActions(renderer, 'Chờ xác minh yêu cầu')[0]?.props.disabled).toBe(true);
    expect(findActions(renderer, 'Xác nhận đặt lịch')).toHaveLength(0);
    expect(findActions(renderer, 'Kiểm tra lịch sử')).toHaveLength(1);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('keeps late private upload failure from flow A out of the new flow B draft', async () => {
  mockGetServices.mockResolvedValue({ data: [service, otherService], total: 2 });
  const pending = deferred<unknown>();
  mockUploadBookingPhoto.mockReturnValueOnce(pending.promise);
  const renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Upload from A');
    });
    mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
    await selectBookingPhoto(renderer);
    await openAndConfirmReview(renderer);
    expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
    mockRoute.key = 'booking-flow-b';
    mockRoute.params.prefill.serviceId = OTHER_SERVICE_ID;
    await act(async () => {
      renderer.update(React.createElement(CustomerBookingCreateScreen));
      await flushPromises();
      pending.reject(new Error('Network request failed'));
      await flushPromises();
    });
    expect(findDescriptionInput(renderer)?.props.value).toBe('');
    expect(textContent(renderer.root)).not.toContain('Không thể xác nhận ảnh đã tải lên');
    expect(textContent(renderer.root)).not.toContain('Upload from A');
    expect(mockCreateBooking).not.toHaveBeenCalled();
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('merges the owner uncertain URI lock into a cached photo when editing after session rotation', async () => {
  const pending = deferred<unknown>();
  mockUploadBookingPhoto.mockReturnValueOnce(pending.promise);
  const renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Cached owner photo');
    });
    mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
    await selectBookingPhoto(renderer);
    await openAndConfirmReview(renderer);
    mockAuthState.sessionGeneration += 1;
    await act(async () => {
      renderer.update(React.createElement(CustomerBookingCreateScreen));
      pending.reject(new Error('Network request failed'));
      await flushPromises();
    });
    expect(findActions(renderer, 'Xác nhận đặt lịch')[0]?.props.disabled).toBe(true);
    await act(async () => (findActions(renderer, 'Chỉnh sửa')[0].props.onPress as () => void)());
    await act(async () => (findAccessibleActions(renderer, 'Quay lại')[0].props.onPress as () => void)());
    await act(async () => (findAccessibleActions(renderer, 'Quay lại')[0].props.onPress as () => void)());
    expect(textContent(renderer.root)).toContain('Ảnh có lần tải chưa xác định');
    expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect(mockCreateBooking).not.toHaveBeenCalled();
  } finally {
    await act(async () => renderer.unmount());
  }
});

it.each([
  ['definitive', { response: { status: 400 } }],
  ['uncertain', new Error('Network request failed')],
])('keeps %s POST errors locked without resending', async (_kind, error) => {
  mockCreateBooking.mockRejectedValueOnce(error);
  const renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Reviewed error');
    });
    await openAndConfirmReview(renderer);
    expect(findActions(renderer, 'Kiểm tra lịch sử')).toHaveLength(1);
      await act(async () => {
        (findActions(renderer, 'Kiểm tra lịch sử')[0].props.onPress as () => void)();
        await flushPromises();
      });
      expect(findActions(renderer, 'Chờ xác minh yêu cầu')[0]?.props.disabled).toBe(true);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('fences a late ACK from flow A away from a new flow B while keeping the owner POST lock', async () => {
  mockGetServices.mockResolvedValue({ data: [service, otherService], total: 2 });
  const pending = deferred<Partial<BookingItem>>();
  mockCreateBooking.mockReturnValueOnce(pending.promise);
  const renderer = await renderScreen();
  try {
    await act(async () => {
      (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('Request A pending');
    });
    await openAndConfirmReview(renderer);
    mockRoute.key = 'booking-flow-b';
    mockRoute.params.prefill.serviceId = OTHER_SERVICE_ID;
    await act(async () => {
      renderer.update(React.createElement(CustomerBookingCreateScreen));
      await flushPromises();
    });
    expect(textContent(renderer.root)).not.toContain('Request A pending');
    expect(findActions(renderer, 'Tiếp tục: Chọn địa chỉ')[0]?.props.disabled).toBe(true);
    await act(async () => {
      pending.resolve({ id: 'booking-a', customerId: 'customer-a' });
      await flushPromises();
    });
    expect(textContent(renderer.root)).not.toContain('Đã gửi yêu cầu');
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => renderer.unmount());
  }
});

it('uploads selected Booking photos privately only after confirmation and sends only upload IDs', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;

  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);
  expect(textContent(renderer.root)).toContain('1/5');

  await advanceToSchedule(renderer);
  const review = findActions(renderer, 'Xem lại yêu cầu')[0];
  await act(async () => {
    (review.props.onPress as () => void)();
    await flushPromises();
  });
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(renderer.root.findAll((node) => node.type === Image
    && node.props.accessibilityLabel === 'Ảnh đính kèm 1')).toHaveLength(1);

  const confirm = findActions(renderer, 'Xác nhận đặt lịch')[0];
  await act(async () => {
    (confirm.props.onPress as () => void)();
    await flushPromises();
  });

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockUploadBookingPhoto).toHaveBeenCalledWith({
    uri: 'file:///issue-a.jpg',
    name: 'issue-a.jpg',
    type: 'image/jpeg',
  });
  expect(mockUploadPublicImage).not.toHaveBeenCalled();
  expect(mockCreateBooking).toHaveBeenCalledWith(expect.objectContaining({
    description: 'Máy lạnh chảy nước',
    photoUploadIds: ['8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a'],
  }));
  const request = mockCreateBooking.mock.calls[0][0] as Record<string, unknown>;
  expect(request).not.toHaveProperty('mediaUrls');
  expect(request.photoUploadIds).not.toContain('file:///issue-a.jpg');
  expect(request.photoUploadIds).not.toContain('data:image/jpeg;base64,preview');
  await act(async () => renderer.unmount());
});

it('does not create a Booking after an uncertain photo upload and allows recovery by removing that photo', async () => {
  mockUploadBookingPhoto.mockRejectedValueOnce(new Error('Network request failed'));
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);
  await openAndConfirmReview(renderer);

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(textContent(renderer.root)).toMatch(/không thể xác nhận|chưa xác nhận/i);
  // Failed private upload now stays on Review, with the same retry lock.
  expect(findActions(renderer, 'Xác nhận đặt lịch')[0]?.props.disabled).toBe(true);
  const edit = findActions(renderer, 'Chỉnh sửa')[0];
  await act(async () => {
    (edit.props.onPress as () => void)();
  });

  const editPhotos = findAccessibleActions(renderer, 'Sửa ảnh sự cố')[0];
  expect(editPhotos).toBeDefined();
  await act(async () => { (editPhotos.props.onPress as () => void)(); });
  const remove = findAccessibleActions(renderer, 'Xóa ảnh sự cố 1')[0];
  expect(remove).toBeDefined();
  if (!remove) return;
  await act(async () => {
    (remove.props.onPress as () => void)();
  });
  await openAndConfirmReview(renderer);

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking.mock.calls[0][0]).not.toHaveProperty('photoUploadIds');
  await act(async () => renderer.unmount());
});

it('shows a started session inline and allows choosing a later session before review', async () => {
  const tree = await renderScreen();
  await act(async () => {
    (findDescriptionInput(tree)!.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  await advanceToSchedule(tree);
  jest.setSystemTime(vnWallClockToDate(2026, 9, 27, 14, 0));
  await act(async () => { (findActions(tree, 'Xem lại yêu cầu')[0].props.onPress as () => void)(); });
  expect(textContent(tree.root)).toContain('Buổi bạn chọn đã bắt đầu. Vui lòng chọn buổi khác.');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  const press = (id: string) => tree.root.findAll((node) => node.props.testID === id && typeof node.props.onPress === 'function')[0].props.onPress as () => void;
  await act(async () => { press('session-day-2026-09-28')(); });
  await act(async () => { press('session-slot-morning')(); });
  await act(async () => { (findActions(tree, 'Xem lại yêu cầu')[0].props.onPress as () => void)(); });
  expect(textContent(tree.root)).toContain('Sáng 8:00 - 12:00');
  expect(findActions(tree, 'Xác nhận đặt lịch')[0].props.disabled).toBe(false);
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it('sends "tới ngay" and the note for the technician', async () => {
  mockCreateBooking.mockResolvedValue({ id: 'new-booking', customerId: 'customer-a' } as BookingItem);
  const tree = await renderScreen();
  await act(async () => {
    (findDescriptionInput(tree)!.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  await advanceToSchedule(tree);
  const find = (id: string) => tree.root.findAll((node) => node.props.testID === id && typeof node.props.onPress === 'function')[0];
  await act(async () => { (find('mode-urgent').props.onPress as () => void)(); });
  await act(async () => {
    (tree.root.findAll((node) => node.props.testID === 'customer-note')[0].props.onChangeText as (v: string) => void)('  Gọi trước 15 phút ');
  });
  await act(async () => { (findActions(tree, 'Xem lại yêu cầu')[0].props.onPress as () => void)(); });
  expect(textContent(tree.root)).toContain('Tới ngay');
  await act(async () => { (findActions(tree, 'Xác nhận đặt lịch')[0].props.onPress as () => void)(); await flushPromises(); });
  expect(mockCreateBooking).toHaveBeenCalledWith(expect.objectContaining({ mode: 'urgent', customerNote: 'Gọi trước 15 phút' }));
  const sent = mockCreateBooking.mock.calls[0][0] as { date?: string; slot?: string };
  expect(sent.date).toBeUndefined();
  expect(sent.slot).toBeUndefined();
  await act(async () => tree.unmount());
});

it('keeps an uncertain upload retry lock scoped to its Customer across an account switch', async () => {
  mockUploadBookingPhoto.mockRejectedValueOnce(new Error('Network request failed'));
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);
  await openAndConfirmReview(renderer);
  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);

  await switchOwner(renderer, 'customer-b');
  expect(textContent(renderer.root)).not.toContain('Chưa xác nhận lượt tải');
  await switchOwner(renderer, 'customer-a');
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(textContent(renderer.root)).toContain('Ảnh có lần tải chưa xác định');
  await act(async () => renderer.unmount());
});


it('persists an uncertain Booking POST guard when leaving and re-entering the Booking route', async () => {
  mockCreateBooking.mockRejectedValueOnce(new Error('network request timed out'));
  const initial = await renderScreen();
  await act(async () => {
    (findDescriptionInput(initial)?.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  await openAndConfirmReview(initial);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  await act(async () => initial.unmount());

  const next = await renderScreen();
  expect(textContent(next.root)).toContain('Kết quả lần gửi vừa rồi chưa xác định');
  expect(findActions(next, 'Kiểm tra lịch sử')).toHaveLength(1);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  expect(findActions(next, 'Xác nhận đặt lịch')).toHaveLength(0);
  await act(async () => next.unmount());
});

it('updates a newly mounted Booking screen from an old in-flight POST without resending', async () => {
  const pending = deferred<Partial<BookingItem>>();
  mockCreateBooking.mockReturnValueOnce(pending.promise);
  const original = await renderScreen();
  await act(async () => {
    (findDescriptionInput(original)?.props.onChangeText as (value: string) => void)('Bình nóng lạnh bị rò nước');
  });
  await openAndConfirmReview(original);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  await act(async () => original.unmount());

  const replacement = await renderScreen();
  expect(findActions(replacement, 'Xác nhận đặt lịch')).toHaveLength(0);
  await act(async () => {
    pending.resolve({ id: 'booking-created-after-route-remount' });
    await flushPromises();
  });
  expect(textContent(replacement.root)).toContain('Đã gửi yêu cầu');
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  await act(async () => replacement.unmount());
});

it('keeps the first owner photo URI locked when upload fails after switching accounts', async () => {
  const pendingUpload = deferred<{ uploadId: string }>();
  mockUploadBookingPhoto.mockReturnValueOnce(pendingUpload.promise);
  const tree = await renderScreen();
  await act(async () => {
    (findDescriptionInput(tree)?.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(tree);
  await openAndConfirmReview(tree);
  await switchOwner(tree, 'customer-b');
  await act(async () => {
    pendingUpload.reject(new Error('unknown upload outcome'));
    await flushPromises();
  });
  await switchOwner(tree, 'customer-a');
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(tree);
  expect(textContent(tree.root)).toContain('Ảnh có lần tải chưa xác định');
  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});


it('stops an old upload callback when the same Customer signs out and back in before its response', async () => {
  const pendingUpload = deferred<{ uploadId: string; mimeType: string; sizeBytes: number }>();
  mockUploadBookingPhoto.mockReturnValueOnce(pendingUpload.promise);
  const tree = await renderScreen();
  await act(async () => {
    (findDescriptionInput(tree)?.props.onChangeText as (value: string) => void)('Bếp điện không nóng');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(tree);
  await openAndConfirmReview(tree);
  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);

  await switchOwner(tree, 'customer-b');
  await switchOwner(tree, 'customer-a');
  await act(async () => {
    pendingUpload.resolve({
      uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    await flushPromises();
  });
  expect(mockCreateBooking).not.toHaveBeenCalled();
  const editPhotos = findAccessibleActions(tree, 'Sửa ảnh sự cố')[0];
  if (editPhotos) {
    await act(async () => { (editPhotos.props.onPress as () => void)(); });
  }
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(tree);
  expect(textContent(tree.root)).toContain('Ảnh có lần tải chưa xác định');
  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

it('does not create a Booking when the private uploader returns a duplicate upload ID', async () => {
  const duplicateUploadId = '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a';
  mockUploadBookingPhoto
    .mockResolvedValueOnce({ uploadId: duplicateUploadId, mimeType: 'image/jpeg', sizeBytes: 2048 })
    .mockResolvedValueOnce({ uploadId: duplicateUploadId, mimeType: 'image/jpeg', sizeBytes: 2048 });
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  const secondPhoto = { ...bookingPhoto, uri: 'file:///issue-b.jpg', fileName: 'issue-b.jpg' };
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto, secondPhoto] });
  await selectBookingPhoto(renderer);
  await openAndConfirmReview(renderer);

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(2);
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(textContent(renderer.root)).toContain('mã tải lên riêng');
  await act(async () => renderer.unmount());
});

it('does not resend an ambiguous Booking POST or its photo upload during reconciliation', async () => {
  mockCreateBooking.mockRejectedValueOnce(new Error('Network request failed'));
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);
  await openAndConfirmReview(renderer);

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  const reconcile = findActions(renderer, 'Kiểm tra lịch sử')[0];
  expect(reconcile).toBeDefined();
  await act(async () => {
    (reconcile.props.onPress as () => void)();
    await flushPromises();
  });

  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  expect(textContent(renderer.root)).toContain('Không gửi lại');
  await act(async () => renderer.unmount());
});

it('limits Booking photos to five unique selections and updates the remaining picker limit after removal', async () => {
  const renderer = await renderScreen();
  const photos = Array.from({ length: 6 }, (_, index) => ({
    ...bookingPhoto,
    assetId: `booking-photo-${index + 1}`,
    uri: `file:///issue-${index + 1}.jpg`,
    fileName: `issue-${index + 1}.jpg`,
  }));
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: photos.slice(0, 5) });
  await selectBookingPhoto(renderer);
  expect(renderer.root.findAll((node) => node.type === Image
    && Boolean(node.props.accessibilityLabel?.toString().startsWith('Ảnh sự cố '))))
    .toHaveLength(5);

  const removeThird = findAccessibleActions(renderer, 'Xóa ảnh sự cố 3')[0];
  expect(removeThird).toBeDefined();
  if (!removeThird) return;
  expect(removeThird.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  await act(async () => {
    (removeThird.props.onPress as () => void)();
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [photos[0], photos[5]] });
  await selectBookingPhoto(renderer);

  expect(mockLaunchImageLibrary.mock.calls[1][0]).toMatchObject({ selectionLimit: 1 });
  const previews = renderer.root.findAll((node) => node.type === Image
    && Boolean(node.props.accessibilityLabel?.toString().startsWith('Ảnh sự cố ')));
  expect(previews).toHaveLength(5);
  expect(previews.map((node) => (node.props.source as { uri: string }).uri)).toEqual([
    'file:///issue-1.jpg',
    'file:///issue-2.jpg',
    'file:///issue-4.jpg',
    'file:///issue-5.jpg',
    'file:///issue-6.jpg',
  ]);
  await act(async () => renderer.unmount());
});

it('does not add a picker result that resolves after the customer account changes', async () => {
  const renderer = await renderScreen();
  const pendingPick = deferred<{ canceled: false; assets: typeof bookingPhoto[] }>();
  mockLaunchImageLibrary.mockReturnValueOnce(pendingPick.promise);
  const addPhoto = findAccessibleActions(renderer, 'Thêm ảnh sự cố')[0];
  await act(async () => {
    (addPhoto.props.onPress as () => void)();
    await flushPromises();
  });

  await switchOwner(renderer, 'customer-b');
  await act(async () => {
    pendingPick.resolve({ canceled: false, assets: [bookingPhoto] });
    await flushPromises();
  });

  expect(renderer.root.findAll((node) => node.props.accessibilityLabel === 'Ảnh sự cố 1')).toHaveLength(0);
  expect(textContent(renderer.root)).not.toContain('issue-a.jpg');
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('does not create a Booking when account ownership changes during private photo upload', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('private request for customer A');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);
  await advanceToSchedule(renderer);
  await act(async () => {
    const review = findActions(renderer, 'Xem lại yêu cầu')[0];
    (review.props.onPress as () => void)();
    await flushPromises();
  });
  const pendingUpload = deferred<{ uploadId: string; mimeType: string; sizeBytes: number }>();
  mockUploadBookingPhoto.mockReturnValueOnce(pendingUpload.promise);
  const confirm = findActions(renderer, 'Xác nhận đặt lịch')[0];
  await act(async () => {
    (confirm.props.onPress as () => void)();
    await flushPromises();
  });
  expect(mockUploadBookingPhoto).toHaveBeenCalledTimes(1);

  await switchOwner(renderer, 'customer-b');
  await act(async () => {
    pendingUpload.resolve({
      uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    await flushPromises();
  });

  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(textContent(renderer.root)).not.toContain('private request for customer A');
  expect(textContent(renderer.root)).not.toContain('issue-a.jpg');
  await switchOwner(renderer, 'customer-a');
  expect(textContent(renderer.root)).not.toContain('issue-a.jpg');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('does not upload a Booking photo when the review is dismissed for editing', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('Máy lạnh chảy nước');
  });
  mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [bookingPhoto] });
  await selectBookingPhoto(renderer);
  await advanceToSchedule(renderer);
  const review = findActions(renderer, 'Xem lại yêu cầu')[0];
  await act(async () => {
    (review.props.onPress as () => void)();
    await flushPromises();
  });
  const edit = findActions(renderer, 'Chỉnh sửa')[0];
  await act(async () => {
    (edit.props.onPress as () => void)();
  });
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('does not create a Booking when the review is dismissed for editing', async () => {
  const renderer = await renderScreen();
  const descriptionInput = findDescriptionInput(renderer);
  expect(descriptionInput).toBeDefined();
  if (!descriptionInput) return;
  await act(async () => {
    (descriptionInput.props.onChangeText as (value: string) => void)(
      'Máy lạnh chảy nước',
    );
  });
  await advanceToSchedule(renderer);
  const reviewActions = findActions(renderer, 'Xem lại yêu cầu');
  expect(reviewActions).toHaveLength(1);
  if (reviewActions.length !== 1) return;
  await act(async () => {
    (reviewActions[0].props.onPress as () => void)();
    await flushPromises();
  });
  const editActions = findActions(renderer, 'Chỉnh sửa');
  expect(editActions).toHaveLength(1);
  if (editActions.length !== 1) return;
  await act(async () => {
    (editActions[0].props.onPress as () => void)();
  });
  expect(mockGetMyBookingsPage).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('dismisses and clears an open review immediately when the account changes', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;

  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('private request for customer A');
  });
  await advanceToSchedule(renderer);
  const reviewAction = findActions(renderer, 'Xem lại yêu cầu')[0];
  await act(async () => {
    (reviewAction.props.onPress as () => void)();
    await flushPromises();
  });
  expect(textContent(renderer.root)).toContain('private request for customer A');
  expect(textContent(renderer.root)).toContain('Nhà riêng');

  await switchOwner(renderer, 'customer-b');

  expect(renderer.root.findAll((node) => node.props.testID === 'booking-review-full-screen')).toHaveLength(0);
  expect(textContent(renderer.root)).not.toContain('private request for customer A');
  expect(textContent(renderer.root)).not.toContain('Nhà riêng');
  expect(findDescriptionInput(renderer)?.props.value).toBe('');
  expect(textContent(renderer.root)).toContain('Nhà của khách B');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('held durable save followed by session rotation leaves no POST or uncertain UI lock when the original owner returns', async () => {
  const saving = deferred<void>(), release = deferred<void>(); let raw: string | null = null, first = true;
  mockEntryJournal = createEntryAttemptJournal({ getItem: async () => raw, setItem: async (_, value) => {
    if (first) { first = false; saving.resolve(); await release.promise; }
    raw = value;
  } });
  const renderer = await renderScreen();
  try {
    await act(async () => { (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('unsent request'); });
    await advanceToSchedule(renderer);
    await act(async () => { (findActions(renderer, 'Xem lại yêu cầu')[0].props.onPress as () => void)(); await flushPromises(); });
    await act(async () => { (findActions(renderer, 'Xác nhận đặt lịch')[0].props.onPress as () => void)(); await saving.promise; });
    await switchOwner(renderer, 'customer-b');
    await act(async () => { release.resolve(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(mockCreateBooking).not.toHaveBeenCalled();
    await switchOwner(renderer, 'customer-a');
    expect(findActions(renderer, 'Chờ xác minh yêu cầu').length).toBe(0);
    expect(mockEntryJournal.blocked('customer-a', 'booking-create')).toBe(false);
    await act(async () => { (findDescriptionInput(renderer)!.props.onChangeText as (value: string) => void)('fresh request after unsent'); });
    await advanceToSchedule(renderer);
    expect(findActions(renderer, 'Xem lại yêu cầu')[0].props.disabled).toBe(false);
    await act(async () => { (findActions(renderer, 'Xem lại yêu cầu')[0].props.onPress as () => void)(); await flushPromises(); });
    await act(async () => { (findActions(renderer, 'Xác nhận đặt lịch')[0].props.onPress as () => void)(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  } finally { await act(async () => renderer.unmount()); }
});

it('retains a successful in-flight create under its original owner across an account change', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('customer A confirmed request');
  });
  await advanceToSchedule(renderer);
  const reviewAction = findActions(renderer, 'Xem lại yêu cầu')[0];
  await act(async () => {
    (reviewAction.props.onPress as () => void)();
    await flushPromises();
  });
  const pendingCreate = deferred<Partial<BookingItem>>();
  mockCreateBooking.mockReturnValueOnce(pendingCreate.promise);
  const confirm = findActions(renderer, 'Xác nhận đặt lịch')[0];
  await act(async () => {
    (confirm.props.onPress as () => void)();
    await flushPromises();
  });
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);

  await switchOwner(renderer, 'customer-b');
  expect(textContent(renderer.root)).not.toContain('customer A confirmed request');
  expect(textContent(renderer.root)).not.toContain('Nhà riêng');

  await act(async () => {
    pendingCreate.resolve({ id: 'booking-created-for-a' });
    await flushPromises();
  });
  expect(textContent(renderer.root)).not.toContain('customer A confirmed request');

  await switchOwner(renderer, 'customer-a');
  expect(textContent(renderer.root)).not.toContain('Đã gửi yêu cầu');
  await act(async () => {
    (findActions(renderer, 'Kiểm tra lịch sử')[0].props.onPress as () => void)();
    await flushPromises();
  });
  expect(textContent(renderer.root)).toContain('Đã gửi yêu cầu');
  expect(textContent(renderer.root)).toContain('customer A confirmed request');
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('retains an ambiguous in-flight create lock under its original owner across an account change', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('customer A uncertain request');
  });
  await advanceToSchedule(renderer);
  const reviewAction = findActions(renderer, 'Xem lại yêu cầu')[0];
  await act(async () => {
    (reviewAction.props.onPress as () => void)();
    await flushPromises();
  });
  const pendingCreate = deferred<Partial<BookingItem>>();
  mockCreateBooking.mockReturnValueOnce(pendingCreate.promise);
  const confirm = findActions(renderer, 'Xác nhận đặt lịch')[0];
  await act(async () => {
    (confirm.props.onPress as () => void)();
    await flushPromises();
  });
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);

  await switchOwner(renderer, 'customer-b');
  await act(async () => {
    pendingCreate.reject(new Error('Network request failed'));
    await flushPromises();
  });
  expect(textContent(renderer.root)).not.toContain('customer A uncertain request');
  expect(textContent(renderer.root)).not.toContain('Nhà riêng');

  await switchOwner(renderer, 'customer-a');
  expect(findActions(renderer, 'Chờ xác minh yêu cầu')).toHaveLength(1);
  const reconcile = findActions(renderer, 'Kiểm tra lịch sử')[0];
  expect(reconcile).toBeDefined();
  await act(async () => {
    (reconcile.props.onPress as () => void)();
    await flushPromises();
  });
  expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  expect(findActions(renderer, 'Chờ xác minh yêu cầu')).toHaveLength(1);
  await act(async () => renderer.unmount());
});

it('shows two intake stages with a neutral fallback for a codeless service', async () => {
  const renderer = await renderScreen();
  const progress = renderer.root.findAll(
    (node) => node.type === View && node.props.testID === 'booking-intake-progress',
  );
  expect(progress).toHaveLength(1);
  if (progress.length !== 1) return;
  const progressText = textContent(progress[0]);
  expect(progressText).toContain('Tình trạng');
  expect(progressText).toContain('Địa chỉ & thời gian');
  expect(String(progress[0].props.accessibilityLabel)).toContain('bước 1 trên 2');
  expect(
    renderer.root.findAll(
      (node) => node.type === View && node.props.testID === 'booking-service-artwork-fallback',
    ),
  ).toHaveLength(1);
  expect(
    renderer.root.findAll(
      (node) => node.type === Image && node.props.testID === 'booking-service-artwork',
    ),
  ).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('renders real catalog artwork when the selected service carries a known service code', async () => {
  mockGetServices.mockResolvedValue({
    data: [{ ...service, code: 'SUA_DIEU_HOA' }],
    total: 1,
  });
  const renderer = await renderScreen();
  expect(
    renderer.root.findAll(
      (node) => node.type === Image && node.props.testID === 'booking-service-artwork',
    ),
  ).toHaveLength(1);
  expect(
    renderer.root.findAll(
      (node) => node.type === View && node.props.testID === 'booking-service-artwork-fallback',
    ),
  ).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('flags a saved address without a valid pin with an alert and a profile update action', async () => {
  mockGetAddresses.mockResolvedValue([{ ...address, lat: 999, lng: 999 }]);
  const renderer = await renderScreen();
  const descriptionInput = findDescriptionInput(renderer);
  await act(async () => {
    (descriptionInput?.props.onChangeText as (value: string) => void)('Vòi nước trong nhà bị rò');
  });
  await act(async () => {
    (findActions(renderer, 'Tiếp tục: Chọn địa chỉ')[0].props.onPress as () => void)();
    await flushPromises();
  });
  const pinAlerts = renderer.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'alert' &&
      textContent(node).includes('tọa độ'),
  );
  expect(pinAlerts.length).toBeGreaterThan(0);
  expect(findActions(renderer, 'Cập nhật địa chỉ trong Hồ sơ')).toHaveLength(1);
  expect(textContent(renderer.root)).toContain('Cần cập nhật vị trí GPS');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('states the preferred window is only desired time and the review creates nothing yet', async () => {
  const renderer = await renderScreen();
  expect(textContent(renderer.root)).not.toContain('chưa phải giờ kỹ thuật viên đến');

  const descriptionInput = findDescriptionInput(renderer);
  expect(descriptionInput).toBeDefined();
  if (!descriptionInput) return;
  await act(async () => {
    (descriptionInput.props.onChangeText as (value: string) => void)(
      'Máy lạnh chảy nước',
    );
  });
  await advanceToSchedule(renderer);
  const reviewActions = findActions(renderer, 'Xem lại yêu cầu');
  expect(reviewActions).toHaveLength(1);
  if (reviewActions.length !== 1) return;
  await act(async () => {
    (reviewActions[0].props.onPress as () => void)();
    await flushPromises();
  });

  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  expect(findActions(renderer, 'Xác nhận đặt lịch')).toHaveLength(1);
  await act(async () => renderer.unmount());
});
