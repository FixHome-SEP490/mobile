import React from 'react';
import { TouchableOpacity } from 'react-native';
import CustomerBookingCreateScreen from './CustomerBookingCreateScreen';
import type { BookingItem } from '../../api/bookings.api';
import type { ServiceItem } from '../../api/services.api';
import type { AddressData } from '../../api/users.api';
import { vnWallClockToDate } from '../../utils/vn-time';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const ADDRESS_ID = '22222222-2222-4222-8222-222222222222';
const ADDRESS_B_ID = '44444444-4444-4444-8444-444444444444';
const mockAuthState = {
  isAuthenticated: true,
  user: { id: 'customer-a', role: 'customer' },
};
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockRoute = { params: { prefill: { serviceId: SERVICE_ID } } };
const mockGetServices = jest.fn();
const mockGetAddresses = jest.fn();
const mockGetCategories = jest.fn();
const mockGetMyBookingsPage = jest.fn();
const mockCreateBooking = jest.fn();
const mockReviewSheetDismiss = jest.fn();

jest.mock('@react-navigation/native', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) =>
      ReactModule.useEffect(callback, [callback]),
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
  },
}));

jest.mock('../../api/services.api', () => ({
  servicesApi: {
    getServices: (...args: unknown[]) => mockGetServices(...args),
    getCategories: (...args: unknown[]) => mockGetCategories(...args),
    getServiceById: jest.fn(),
  },
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
};
type TestRenderer = { root: TestNode; unmount: () => void };
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
  mockAuthState.user.id = ownerId;
  const input = findDescriptionInput(renderer);
  await act(async () => {
    (input?.props.onChangeText as ((value: string) => void) | undefined)?.(
      `draft for ${ownerId}`,
    );
    await flushPromises();
  });
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
  jest.useFakeTimers().setSystemTime(vnWallClockToDate(2026, 9, 27, 8, 0));
  jest.clearAllMocks();
  mockAuthState.user.id = 'customer-a';
  mockRoute.params.prefill.serviceId = SERVICE_ID;
  mockGetServices.mockResolvedValue({ data: [service], total: 1 });
  mockGetAddresses.mockImplementation(async () =>
    mockAuthState.user.id === 'customer-b' ? [addressB] : [address],
  );
  mockGetCategories.mockResolvedValue([]);
  mockGetMyBookingsPage.mockResolvedValue({ data: [], total: 0 });
  mockCreateBooking.mockResolvedValue({
    id: 'booking-created',
    customerId: 'customer-a',
  } satisfies Partial<BookingItem>);
});

afterEach(() => {
  jest.useRealTimers();
});

it('shows and focuses the required description error when review is requested blank', async () => {
  const renderer = await renderScreen();
  const reviewActions = findActions(renderer, 'Xem lại yêu cầu');
  expect(reviewActions).toHaveLength(1);
  if (reviewActions.length !== 1) return;

  await act(async () => {
    (reviewActions[0].props.onPress as () => void)();
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

  const reviewActions = findActions(renderer, 'Xem lại yêu cầu');
  await act(async () => {
    (reviewActions[0].props.onPress as () => void)();
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
  expect(textContent(renderer.root)).toContain('09:00–11:00');
  expect(textContent(renderer.root)).toContain('Số lượng: 1');

  const reviewInput = findDescriptionInput(renderer);
  await act(async () => {
    (reviewInput?.props.onChangeText as ((value: string) => void) | undefined)?.(
      'Nội dung đã đổi sau khi xem lại',
    );
  });

  const confirmActions = findActions(renderer, 'Xác nhận đặt lịch');
  expect(confirmActions).toHaveLength(1);
  if (confirmActions.length !== 1) return;
  await act(async () => {
    (confirmActions[0].props.onPress as () => void)();
    await flushPromises();
  });

  expect(mockGetMyBookingsPage).toHaveBeenCalledTimes(1);
  expect(mockCreateBooking).toHaveBeenCalledWith({
    serviceId: SERVICE_ID,
    addressId: ADDRESS_ID,
    description: 'Máy lạnh chảy nước',
    preferredStartAt: vnWallClockToDate(2026, 9, 27, 9, 0).toISOString(),
    preferredEndAt: vnWallClockToDate(2026, 9, 27, 11, 0).toISOString(),
    quantity: 1,
    urgency: 'NORMAL',
  });
  expect(textContent(renderer.root)).toContain('Yêu cầu đặt lịch đã được xác nhận');
  expect(textContent(renderer.root)).toContain('Về trang chủ');
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
  const reviewAction = findActions(renderer, 'Xem lại yêu cầu')[0];
  await act(async () => {
    (reviewAction.props.onPress as () => void)();
    await flushPromises();
  });
  expect(textContent(renderer.root)).toContain('private request for customer A');
  expect(textContent(renderer.root)).toContain('Nhà riêng');

  await switchOwner(renderer, 'customer-b');

  expect(mockReviewSheetDismiss).toHaveBeenCalled();
  expect(textContent(renderer.root)).not.toContain('private request for customer A');
  expect(textContent(renderer.root)).not.toContain('Nhà riêng');
  expect(findDescriptionInput(renderer)?.props.value).toBe('');
  expect(textContent(renderer.root)).toContain('Nhà của khách B');
  expect(mockCreateBooking).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('retains a successful in-flight create under its original owner across an account change', async () => {
  const renderer = await renderScreen();
  const input = findDescriptionInput(renderer);
  expect(input).toBeDefined();
  if (!input) return;
  await act(async () => {
    (input.props.onChangeText as (value: string) => void)('customer A confirmed request');
  });
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
  expect(textContent(renderer.root)).toContain('Yêu cầu đặt lịch đã được xác nhận');
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
