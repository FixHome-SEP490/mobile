import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import CustomerBookingCreateScreen, { clearBookingCreateRuntimeForTest } from './CustomerBookingCreateScreen';
import { clearBookingAddressAttempt } from './CustomerBookingAddressEditor';
import { vnWallClockToDate } from '../../utils/vn-time';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const ADDRESS_ID = '22222222-2222-4222-8222-222222222222';
const mockAuthState = {
  isAuthenticated: true,
  user: { id: 'customer-a', role: 'customer' },
  sessionGeneration: 1,
};
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockUsePreventRemove = jest.fn();
const mockRoute = { params: { prefill: { serviceId: SERVICE_ID } } };
const mockGetServices = jest.fn();
const mockGetAddresses = jest.fn();
const mockGetCategories = jest.fn();
const mockGetMyBookingsPage = jest.fn();
const mockCreateBooking = jest.fn();
const mockUploadBookingPhoto = jest.fn();

jest.mock('@react-navigation/native', () => {
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
      background: '#F7F5F2',
      surface: '#FFFFFF',
      text: '#1A1714',
      textSecondary: '#5C554C',
      border: '#E2DDD6',
      divider: '#EFECE7',
      error: '#DC2626',
      success: '#059669',
    },
  }),
}));

jest.mock('../../api/bookings.api', () => ({
  bookingsApi: {
    getMyBookingsPage: (...args: unknown[]) => mockGetMyBookingsPage(...args),
    createBooking: (...args: unknown[]) => mockCreateBooking(...args),
  },
}));

jest.mock('../../api/media.api', () => ({
  mediaApi: {
    uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const BottomSheetModal = ReactModule.forwardRef(
    (props: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({ present: () => undefined, dismiss: () => undefined }));
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});

jest.mock('@expo/ui/community/datetime-picker', () => ({
  DateTimePicker: () => null,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('lucide-react-native', () => {
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
};
type TestRenderer = { root: TestNode; unmount: () => void };
const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => TestRenderer;
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

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function bookingAction(renderer: TestRenderer, label: string): TestNode | undefined {
  return renderer.root.findAll(
    (node) => node.type === TouchableOpacity &&
      typeof node.props.onPress === 'function' &&
      textContent(node).trim() === label,
  )[0];
}

async function goToAddress(renderer: TestRenderer) {
  const description = renderer.root.findAll(
    (node) => node.props.accessibilityLabel === 'Mô tả sự cố',
  )[0];
  expect(description).toBeDefined();
  await act(async () => {
    (description.props.onChangeText as (value: string) => void)('Máy lạnh không mát');
  });
  const next = bookingAction(renderer, 'Tiếp tục: Chọn địa chỉ');
  expect(next).toBeDefined();
  await act(async () => {
    (next?.props.onPress as () => void)();
    await flushPromises();
  });
}

async function goToSchedule(renderer: TestRenderer) {
  await goToAddress(renderer);
  const next = bookingAction(renderer, 'Tiếp tục: Chọn ngày và giờ');
  expect(next).toBeDefined();
  await act(async () => {
    (next?.props.onPress as () => void)();
    await flushPromises();
  });
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(vnWallClockToDate(2026, 9, 27, 8, 0));
  jest.clearAllMocks();
  mockGetServices.mockResolvedValue({
    data: [
      {
        id: SERVICE_ID,
        name: 'Sửa máy lạnh',
        categoryId: '33333333-3333-4333-8333-333333333333',
        pricingMode: 'fixed_price',
        basePrice: 250000,
        fixedPrice: 250000,
        isActive: true,
        sortOrder: 1,
      },
    ],
    total: 1,
  });
  mockGetAddresses.mockResolvedValue([
    {
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
    },
  ]);
  mockGetCategories.mockResolvedValue([]);
  mockGetMyBookingsPage.mockResolvedValue({ data: [], total: 0 });
});

afterEach(() => {
  clearBookingAddressAttempt('customer-a');
  clearBookingAddressAttempt('customer-b');
  clearBookingCreateRuntimeForTest('customer-a');
  clearBookingCreateRuntimeForTest('customer-b');
  jest.useRealTimers();
});

it('never submits a real booking on render and presents the 3-stage flow with clear form sections', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });

  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();

  const body = textContent(renderer.root);
  for (const label of [
    'Tình trạng',
    'Địa chỉ',
    'Khung giờ',
    'DỊCH VỤ',
    'Mô tả sự cố (bắt buộc)',
    'Ảnh sự cố (không bắt buộc)',
  ]) {
    expect(body).toContain(label);
  }
  expect(body).not.toContain('ĐỊA CHỈ SỬA CHỮA');
  expect(body).not.toContain('Chọn ngày và giờ');
  expect(body).toContain('Tình trạng cần sửa');

  await goToAddress(renderer);
  expect(textContent(renderer.root)).toContain('Chọn địa chỉ');
  expect(textContent(renderer.root)).not.toContain('LỊCH HẸN TẠI NHÀ');
  expect(textContent(renderer.root)).not.toContain('MÔ TẢ SỰ CỐ');
  const toSchedule = bookingAction(renderer, 'Tiếp tục: Chọn ngày và giờ');
  await act(async () => {
    (toSchedule?.props.onPress as () => void)();
    await flushPromises();
  });
  expect(textContent(renderer.root)).toContain('Chọn ngày và giờ');
  expect(textContent(renderer.root)).not.toContain('ĐỊA CHỈ SỬA CHỮA');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  for (let number = 1; number <= 5; number++) {
    expect(body).not.toContain(`Bước ${number} trên 5`);
  }
  expect(body).not.toContain('ĐẶT DỊCH VỤ / 01');
  await act(async () => renderer.unmount());
});
it('navigates back across stages without losing the draft or sending a Booking', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
  await goToSchedule(renderer);
  // Schedule omits the summary; draft remains when returning to intake.
  expect(textContent(renderer.root)).not.toContain('Máy lạnh không mát');
  expect(renderer.root.findAll((node) => node.props.testID === 'booking-review-full-screen')).toHaveLength(0);

  const back = () => renderer.root.findAll(
    (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Quay lại',
  )[0];
  await act(async () => { (back().props.onPress as () => void)(); });
  expect(textContent(renderer.root)).toContain('Chọn địa chỉ');
  expect(textContent(renderer.root)).toContain('Chọn địa chỉ');
  await act(async () => { (back().props.onPress as () => void)(); });
  expect(textContent(renderer.root)).toContain('Tình trạng cần sửa');
  expect(renderer.root.findAll((node) => node.props.accessibilityLabel === 'Mô tả sự cố')[0].props.value)
    .toBe('Máy lạnh không mát');
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();

  await act(async () => renderer.unmount());
});



it('opens C05 inline new-address editor and retains ambiguous-create lock after closing and reopening', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
  await goToAddress(renderer);
  expect(textContent(renderer.root)).toContain('Chọn địa chỉ');
  const openEditor = () => renderer.root.findAll((node) =>
    node.type === TouchableOpacity && node.props.accessibilityLabel === 'Thêm địa chỉ mới',
  )[0];
  expect(openEditor()).toBeDefined();
  await act(async () => {
    (openEditor().props.onPress as () => void)();
  });
  const editor = () => renderer.root.findAll((node) => node.props.testID === 'booking-new-address-editor')[0];
  expect(editor()).toBeDefined();
  expect(textContent(renderer.root)).toContain('Thêm địa chỉ tại nơi cần sửa');
  expect(mockCreateBooking).not.toHaveBeenCalled();

  // Simulate only the editor's reported one-shot write attempt; no network is
  // invoked. The parent must carry its lock across panel unmount/remount.
  const editorComponent = renderer.root.findAll((node) =>
    typeof node.type === 'function' && node.type.name === 'CustomerBookingAddressEditor',
  )[0];
  expect(editorComponent).toBeDefined();
  const payload = {
    label: 'Nhà mới', line1: '50 Đường Mẫu', ward: 'Phường 2',
    district: 'Quận 3', province: 'TP. HCM', lat: 10.78, lng: 106.69,
    isDefault: false,
  };
  await act(async () => {
    (editorComponent.props.onAttemptStart as (value: unknown) => void)({
      payload, baselineIds: [ADDRESS_ID], knownId: null,
    });
  });
  await act(async () => {
    (editorComponent.props.onCancel as () => void)();
  });
  expect(editor()).toBeUndefined();
  await act(async () => {
    (openEditor().props.onPress as () => void)();
  });
  const restored = renderer.root.findAll((node) =>
    typeof node.type === 'function' && node.type.name === 'CustomerBookingAddressEditor',
  )[0];
  expect(restored.props.lockedAttempt).toEqual({
    payload, baselineIds: [ADDRESS_ID], knownId: null,
  });
  expect(textContent(renderer.root)).toContain('Chỉ kiểm tra danh sách, không gửi lại');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});


it('keeps an unresolved address POST lock when leaving Booking and opening a new Booking screen in the same app process', async () => {
  const make = async (): Promise<TestRenderer> => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(React.createElement(CustomerBookingCreateScreen));
      await flushPromises();
    });
    return tree;
  };
  const first = await make();
  await goToAddress(first);
  const open = (tree: TestRenderer) => tree.root.findAll((node) =>
    node.type === TouchableOpacity && node.props.accessibilityLabel === 'Thêm địa chỉ mới',
  )[0];
  await act(async () => { (open(first).props.onPress as () => void)(); });
  const editor = first.root.findAll((node) =>
    typeof node.type === 'function' && node.type.name === 'CustomerBookingAddressEditor',
  )[0];
  const payload = {
    label: 'Nhà mới', line1: '50 Đường Mẫu', ward: 'Phường 2',
    district: 'Quận 3', province: 'TP. HCM', lat: 10.78, lng: 106.69,
    isDefault: false,
  };
  await act(async () => {
    (editor.props.onAttemptStart as (value: unknown) => void)({
      payload, baselineIds: [ADDRESS_ID], knownId: null,
    });
  });
  await act(async () => first.unmount());

  const later = await make();
  await goToAddress(later);
  await act(async () => { (open(later).props.onPress as () => void)(); });
  const restored = later.root.findAll((node) =>
    typeof node.type === 'function' && node.type.name === 'CustomerBookingAddressEditor',
  )[0];
  expect(restored.props.lockedAttempt).toEqual({
    payload, baselineIds: [ADDRESS_ID], knownId: null,
  });
  expect(textContent(later.root)).toContain('Chỉ kiểm tra danh sách, không gửi lại');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => later.unmount());
});


it('shows a dedicated full-screen confirmation scene, preserves the snapshot and returns without Booking POST', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
  await goToSchedule(renderer);
  expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'booking-review-full-screen')).toHaveLength(0);
  const review = bookingAction(renderer, 'Xem lại yêu cầu');
  expect(review).toBeDefined();
  await act(async () => {
    (review?.props.onPress as () => void)();
    await flushPromises();
  });
  expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'booking-review-full-screen')).toHaveLength(1);
  const body = textContent(renderer.root);
  expect(body).toContain('Kiểm tra lần cuối');
  expect(body).not.toContain('Yêu cầu chưa được tạo');
  expect(body).toContain('Máy lạnh không mát');
  expect(body).toContain('Nhà riêng');
  expect(body).toContain('Giá dịch vụ');
  expect(body).not.toContain('Chọn ngày và giờ');
  expect(bookingAction(renderer, 'Xác nhận đặt lịch')).toBeDefined();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
  const back = renderer.root.findAll((node) =>
    node.type === TouchableOpacity && node.props.accessibilityLabel === 'Quay lại')[0];
  await act(async () => {
    (back.props.onPress as () => void)();
  });
  expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'booking-review-full-screen')).toHaveLength(0);
  expect(textContent(renderer.root)).toContain('Chọn ngày và giờ');
  expect(textContent(renderer.root)).not.toContain('Máy lạnh không mát');
  await act(async () => { (bookingAction(renderer, 'Xem lại yêu cầu')!.props.onPress as () => void)(); });
  expect(textContent(renderer.root)).toContain('Máy lạnh không mát');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});


it('intercepts a native-stack back removal while the standalone review scene is open', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
  await goToSchedule(renderer);
  await act(async () => {
    (bookingAction(renderer, 'Xem lại yêu cầu')?.props.onPress as () => void)();
    await flushPromises();
  });
  const guarded = mockUsePreventRemove.mock.calls.filter((args) => args[0] === true);
  expect(guarded.length).toBeGreaterThan(0);
  await act(async () => {
    (guarded[guarded.length - 1][1] as () => void)();
  });
  expect(renderer.root.findAll((node) =>
    node.type === View && node.props.testID === 'booking-review-full-screen')).toHaveLength(0);
  expect(textContent(renderer.root)).toContain('Chọn ngày và giờ');
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('does not resurrect a definitive rejected address write after its owner ledger was cleared', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });
  await goToAddress(renderer);
  const open = () => renderer.root.findAll((node) =>
    node.type === TouchableOpacity && node.props.accessibilityLabel === 'Thêm địa chỉ mới')[0];
  await act(async () => { (open().props.onPress as () => void)(); });
  const editor = () => renderer.root.findAll((node) =>
    typeof node.type === 'function' && node.type.name === 'CustomerBookingAddressEditor')[0];
  const payload = {
    label: 'Nhà mới', line1: '50 Đường Mẫu', ward: 'Phường 2',
    district: 'Quận 3', province: 'TP. HCM',
    lat: 10.78, lng: 106.69, isDefault: false,
  };
  await act(async () => {
    (editor().props.onAttemptStart as (value: unknown) => void)({
      payload, baselineIds: [ADDRESS_ID], knownId: null, posting: true, attemptToken: 234,
    });
  });
  await act(async () => { (editor().props.onCancel as () => void)(); });
  // Simulates the editor's definitive POST 400 after its UI is gone.
  clearBookingAddressAttempt('customer-a');
  await act(async () => { (open().props.onPress as () => void)(); });
  expect(editor().props.lockedAttempt).toBeUndefined();
  expect(textContent(renderer.root)).not.toContain('Chỉ kiểm tra danh sách, không gửi lại');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('keeps accessible touch targets and honest disabled state on the review CTA', async () => {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(React.createElement(CustomerBookingCreateScreen));
    await flushPromises();
  });

  const backBtn = renderer.root.findAll(
    (node) =>
      node.type === TouchableOpacity && node.props.accessibilityLabel === 'Quay lại',
  )[0];
  expect(backBtn).toBeDefined();
  const backStyle = StyleSheet.flatten(backBtn.props.style as never) as {
    width: number;
    height: number;
  };
  expect(backStyle.width).toBeGreaterThanOrEqual(44);
  expect(backStyle.height).toBeGreaterThanOrEqual(44);

  await goToSchedule(renderer);
  const reviewCta = renderer.root.findAll(
    (node) =>
      node.type === TouchableOpacity &&
      typeof node.props.onPress === 'function' &&
      textContent(node).includes('Xem lại yêu cầu'),
  )[0];
  expect(reviewCta).toBeDefined();
  const ctaStyle = StyleSheet.flatten(reviewCta.props.style as never) as {
    minHeight?: number;
  };
  expect(ctaStyle.minHeight ?? 0).toBeGreaterThanOrEqual(48);
  expect(reviewCta.props.accessibilityState).toEqual({
    disabled: reviewCta.props.disabled,
  });

  await act(async () => renderer.unmount());
});
