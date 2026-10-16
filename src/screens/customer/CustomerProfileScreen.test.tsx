import React from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { UserRole, type UserInfo } from '../../types';
import { customerProfileAddressWrites } from './customer-address-write';

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return { LogOut: () => ReactModule.createElement(Native.Text, null, 'LogOut') };
});

const mockCustomer: UserInfo = {
  id: 'customer-exact-pin-1',
  email: 'customer.exact-pin@example.test',
  fullName: 'Customer Exact Pin',
  role: UserRole.CUSTOMER,
};
const mockNavigate = jest.fn();
const mockResetNavigation = jest.fn();
const mockGetProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockGetAddresses = jest.fn();
const mockCreateAddress = jest.fn();
const mockUpdateAddress = jest.fn();
const mockDeleteAddress = jest.fn();
const mockAutocomplete = jest.fn();
const mockReverse = jest.fn();
const mockLogout = jest.fn();
const mockLogoutStore = jest.fn();
const mockSetAuth = jest.fn();
let mockAuthState = {
  user: mockCustomer as UserInfo | null,
  token: 'test-token' as string | null,
  isAuthenticated: true,
  sessionGeneration: 1,
  setAuth: mockSetAuth,
  logout: mockLogoutStore,
};
const mountedTrees: ReactTestRenderer[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, reset: mockResetNavigation }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) };
});

jest.mock('@gorhom/bottom-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const BottomSheetModal = ReactModule.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: React.ForwardedRef<{ present: () => void; dismiss: () => void }>) => {
      ReactModule.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactModule.createElement(Native.View, null, children);
    },
  );
  return {
    BottomSheetModal,
    BottomSheetBackdrop: () => null,
    BottomSheetView: Native.View,
    BottomSheetScrollView: Native.ScrollView,
    BottomSheetTextInput: Native.TextInput,
  };
});

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../../components/AddressMap', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    __esModule: true,
    default: ({ children, onPress }: { children?: React.ReactNode; onPress?: (event: unknown) => void }) =>
      ReactModule.createElement(Native.View, { testID: 'address-map', onPress }, children),
    Marker: ({ title }: { title?: string }) => ReactModule.createElement(Native.Text, { testID: 'map-marker' }, title),
  };
});

jest.mock('../../store', () => ({
  useAuthStore: Object.assign(() => mockAuthState, { getState: () => mockAuthState }),
}));

jest.mock('../../api/auth.api', () => ({ authApi: { logout: (...args: unknown[]) => mockLogout(...args) } }));

jest.mock('../../api/users.api', () => ({
  usersApi: {
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    getAddresses: (...args: unknown[]) => mockGetAddresses(...args),
    createAddress: (...args: unknown[]) => mockCreateAddress(...args),
    updateAddress: (...args: unknown[]) => mockUpdateAddress(...args),
    deleteAddress: (...args: unknown[]) => mockDeleteAddress(...args),
  },
}));

jest.mock('../../api/media.api', () => ({ mediaApi: { uploadPublicImage: jest.fn() } }));

jest.mock('../../api/geo.api', () => ({
  geoApi: {
    autocomplete: (...args: unknown[]) => mockAutocomplete(...args),
    reverse: (...args: unknown[]) => mockReverse(...args),
  },
}));

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563EB',
      primaryStrong: '#1D4ED8',
      primaryTint: '#EFF6FF',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#64748B',
      muted: '#94A3B8',
      border: '#E2E8F0',
      error: '#DC2626',
    },
  }),
}));

jest.mock('../../hooks/useScrollHideTabBar', () => ({ useScrollHideTabBar: () => jest.fn() }));
jest.mock('./customer-avatar-upload', () => ({ persistCustomerAvatar: jest.fn() }));
jest.mock('../../services/avatar-upload', () => ({
  avatarErrorMessage: jest.fn(() => 'Không thể cập nhật ảnh đại diện.'),
  withPersistedAvatar: jest.fn((_user, persisted) => persisted),
}));

const { default: CustomerProfileScreen } = jest.requireActual('./CustomerProfileScreen') as {
  default: React.ComponentType;
};

function screenElement() {
  return React.createElement(CustomerProfileScreen);
}

async function mountScreen(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(screenElement());
    await flushPromises();
    await flushPromises();
  });
  mountedTrees.push(tree);
  return tree;
}

function findButton(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find(
    (node) => node.props.accessibilityLabel === label,
  );
}

function findTextInput(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TextInput).find(
    (node) => node.props.accessibilityLabel === label,
  );
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

beforeEach(() => {
  customerProfileAddressWrites.clear();
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuthState = { user: mockCustomer, token: 'test-token', isAuthenticated: true,
    sessionGeneration: 1, setAuth: mockSetAuth, logout: mockLogoutStore };
  mockGetProfile.mockResolvedValue(mockCustomer);
  mockGetAddresses.mockResolvedValue([]);
  mockCreateAddress.mockResolvedValue({ id: 'new-address' });
  mockUpdateAddress.mockResolvedValue({ id: 'saved-address' });
  mockDeleteAddress.mockResolvedValue(undefined);
  mockAutocomplete.mockResolvedValue([]);
  mockReverse.mockResolvedValue({
    formattedAddress: '123 Đường Mới, Phường An Bình',
    ward: 'Phường Bến Thành',
    district: 'Phường Bến Thành',
    province: 'Thành phố Hồ Chí Minh',
    provinceCode: '79',
    districtCode: '26743',
  });
});

afterEach(() => {
  act(() => {
    while (mountedTrees.length) mountedTrees.pop()?.unmount();
  });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CustomerProfileScreen exact pin flow', () => {
  it('renders a readable account hub with accessible actions and no write on mount', async () => {
    const tree = await mountScreen();
    const textValues = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(textValues).toContain('Tài khoản');
    expect(textValues).toContain('Quản lý tài khoản');
    expect(textValues).toContain('Dịch vụ của tôi');
    const personal = findButton(tree, 'Mở thông tin cá nhân');
    const address = findButton(tree, 'Quản lý địa chỉ sửa chữa');
    const logout = findButton(tree, 'Đăng xuất khỏi FixHome');
    expect(personal).toBeDefined();
    expect(address).toBeDefined();
    expect(logout).toBeDefined();
    expect(personal?.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(address?.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(logout?.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(logout?.props.style).width).toBe('100%');
    expect(StyleSheet.flatten(logout?.props.style).position).not.toBe('absolute');
    const allButtons = tree.root.findAllByType(TouchableOpacity);
    expect(allButtons.indexOf(logout!)).toBeGreaterThan(allButtons.indexOf(findButton(tree, 'Mở lịch sử sửa chữa')!));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockCreateAddress).not.toHaveBeenCalled();
    expect(mockUpdateAddress).not.toHaveBeenCalled();
    expect(mockDeleteAddress).not.toHaveBeenCalled();
  });

  it('saves a new address only after the user chooses and confirms a map point', async () => {
    const tree = await mountScreen();
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    const candidate = {
      placeId: 'candidate-1',
      description: 'Đường Ứng Viên, Phường Mới',
      lat: 10,
      lng: 106,
      ward: 'Phường Mới',
      district: 'Quận Mới',
      province: 'Tỉnh Mới',
    };
    mockAutocomplete.mockResolvedValueOnce([candidate]);

    act(() => addressMenu?.props.onPress());
    act(() => findTextInput(tree, 'Tên gợi nhớ')?.props.onChangeText('Nhà riêng'));
    act(() => findTextInput(tree, 'Địa chỉ chi tiết')?.props.onChangeText('Đường Ứng Viên'));
    await act(async () => {
      jest.advanceTimersByTime(350);
      await flushPromises();
    });

    const suggestion = findButton(tree, `Chọn gợi ý địa chỉ: ${candidate.description}`);
    expect(suggestion).toBeDefined();
    act(() => suggestion?.props.onPress());
    expect(findButton(tree, 'Thêm địa chỉ')?.props.disabled).toBe(true);

    const map = tree.root.findByProps({ testID: 'address-map' });
    await act(async () => {
      map.props.onPress({ nativeEvent: { coordinate: { latitude: 0, longitude: 0 } } });
      await flushPromises();
    });
    expect(mockReverse).toHaveBeenCalledWith(0, 0);
    expect(findButton(tree, 'Xác nhận ghim đã chọn')).toBeDefined();

    act(() => findButton(tree, 'Xác nhận ghim đã chọn')?.props.onPress());
    expect(findButton(tree, 'Thêm địa chỉ')?.props.disabled).toBe(false);
    await act(async () => {
      findButton(tree, 'Thêm địa chỉ')?.props.onPress();
      await flushPromises();
    });

    expect(mockCreateAddress).toHaveBeenCalledWith(expect.objectContaining({
      line1: '123 Đường Mới, Phường An Bình',
      province: 'Thành phố Hồ Chí Minh',
      district: 'Phường Bến Thành',
      lat: 0,
      lng: 0,
    }));
  });

  it('preserves a valid saved pin when editing only the legacy address label', async () => {
    const savedAddress = {
      id: 'address-1',
      userId: mockCustomer.id,
      label: 'Nhà',
      line1: 'Địa chỉ đã lưu',
      ward: 'Phường An Bình',
      district: 'Quận Bình An',
      province: 'Tỉnh Bình Dương',
      provinceCode: '74',
      districtCode: '741',
      lat: 10,
      lng: 106,
      isDefault: true,
    };
    mockGetAddresses.mockResolvedValue([savedAddress]);
    const tree = await mountScreen();
    await act(async () => { await flushPromises(); });
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());
    act(() => findButton(tree, 'Sửa địa chỉ Nhà')?.props.onPress());
    act(() => findTextInput(tree, 'Tên gợi nhớ')?.props.onChangeText('Căn hộ'));

    await act(async () => {
      findButton(tree, 'Cập nhật địa chỉ')?.props.onPress();
      await flushPromises();
    });

    expect(mockUpdateAddress).toHaveBeenCalledWith('address-1', expect.objectContaining({
      line1: 'Địa chỉ đã lưu',
      lat: 10,
      lng: 106,
      isDefault: true,
    }));
  });

  it.each([
    { label: 'missing', lat: null, lng: null },
    { label: 'invalid', lat: 91, lng: 106 },
  ])('shows honest no-pin guidance for saved addresses with $label coordinates', async ({ lat, lng }) => {
    mockGetAddresses.mockResolvedValue([{
      id: 'address-without-valid-pin',
      userId: mockCustomer.id,
      label: 'Nhà',
      line1: 'Địa chỉ đã lưu',
      ward: 'Phường An Bình',
      district: 'Quận Bình An',
      province: 'Tỉnh Bình Dương',
      lat,
      lng,
      isDefault: false,
    }]);
    const tree = await mountScreen();
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());
    act(() => findButton(tree, 'Sửa địa chỉ Nhà')?.props.onPress());

    expect(tree.root.findAllByType(Text).some((node) =>
      node.props.children === 'Địa chỉ này chưa có ghim hợp lệ. Chưa có vị trí nào được chọn.',
    )).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) =>
      node.props.children === 'Ghim đã lưu được giữ nguyên khi địa chỉ không đổi.',
    )).toBe(false);
  });

  it('allows a manual legacy address text edit but clears the unconfirmed old pin', async () => {
    const savedAddress = {
      id: 'address-manual-edit',
      userId: mockCustomer.id,
      label: 'Nhà',
      line1: 'Địa chỉ cũ',
      ward: 'Phường An Bình',
      district: 'Quận Bình An',
      province: 'Tỉnh Bình Dương',
      provinceCode: '74',
      districtCode: '741',
      lat: 10,
      lng: 106,
      isDefault: false,
    };
    mockGetAddresses.mockResolvedValue([savedAddress]);
    const tree = await mountScreen();
    await act(async () => { await flushPromises(); });
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());
    act(() => findButton(tree, 'Sửa địa chỉ Nhà')?.props.onPress());
    act(() => findTextInput(tree, 'Địa chỉ chi tiết')?.props.onChangeText('Địa chỉ mới nhập tay'));

    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(false);
    await act(async () => {
      findButton(tree, 'Cập nhật địa chỉ')?.props.onPress();
      await flushPromises();
    });

    expect(mockUpdateAddress).toHaveBeenCalledWith('address-manual-edit', expect.objectContaining({
      line1: 'Địa chỉ mới nhập tay',
      lat: null,
      lng: null,
    }));
  });

  it('keeps a chosen pin after reverse lookup fails and offers a retry without stale labels', async () => {
    const savedAddress = {
      id: 'address-2',
      userId: mockCustomer.id,
      label: 'Nhà cũ',
      line1: 'Địa chỉ cũ',
      ward: 'Phường Cũ',
      district: 'Quận Cũ',
      province: 'Tỉnh Cũ',
      provinceCode: '01',
      districtCode: '011',
      lat: 10,
      lng: 106,
      isDefault: false,
    };
    mockGetAddresses.mockResolvedValue([savedAddress]);
    mockReverse.mockRejectedValueOnce(new Error('offline'));
    const tree = await mountScreen();
    await act(async () => { await flushPromises(); });
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());
    act(() => findButton(tree, 'Sửa địa chỉ Nhà cũ')?.props.onPress());

    await act(async () => {
      tree.root.findByProps({ testID: 'address-map' }).props.onPress({
        nativeEvent: { coordinate: { latitude: 0, longitude: 0 } },
      });
      await flushPromises();
    });

    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Tỉnh Cũ')).toBe(false);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Vị trí bạn đã chọn')).toBe(true);
    expect(findButton(tree, 'Thử lại tra cứu địa chỉ')).toBeDefined();
    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(true);

    await act(async () => {
      findButton(tree, 'Thử lại tra cứu địa chỉ')?.props.onPress();
      await flushPromises();
    });
    expect(mockReverse).toHaveBeenCalledTimes(2);
    expect(findButton(tree, 'Xác nhận ghim đã chọn')).toBeDefined();
  });

  it('keeps retry available when reverse lookup omits administrative data, even after pin confirmation', async () => {
    mockReverse.mockResolvedValueOnce({ formattedAddress: 'Đường Mới' });
    const tree = await mountScreen();
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());

    await act(async () => {
      tree.root.findByProps({ testID: 'address-map' }).props.onPress({
        nativeEvent: { coordinate: { latitude: 10, longitude: 106 } },
      });
      await flushPromises();
    });

    expect(findButton(tree, 'Thử lại tra cứu địa chỉ')).toBeDefined();
    act(() => findButton(tree, 'Xác nhận ghim đã chọn')?.props.onPress());
    expect(findButton(tree, 'Thử lại tra cứu địa chỉ')).toBeDefined();
    expect(findButton(tree, 'Thêm địa chỉ')?.props.disabled).toBe(true);
  });
});

describe('CustomerProfileScreen C16 account presentation', () => {
  const saved = { id: 'saved-address', userId: mockCustomer.id, label: 'Nhà', line1: 'Old street', province: 'Old province', district: 'Old district', lat: 10, lng: 106, isDefault: false };
  const canonical = { ...saved, line1: 'New street', province: 'Thành phố Hồ Chí Minh', provinceCode: '79', ward: 'Phường Bến Thành', district: 'Phường Bến Thành', districtCode: '26743', lat: 10.78, lng: 106.69 };
  async function movePin(tree: ReactTestRenderer) {
    const menu = tree.root.findAllByType(TouchableOpacity).find(node => node.findAllByType(Text).some(text => text.props.children === 'Địa chỉ sửa chữa'));
    act(() => menu?.props.onPress());
    act(() => findButton(tree, 'Sửa địa chỉ Nhà')?.props.onPress());
    await act(async () => {
      tree.root.findByProps({ testID: 'address-map' }).props.onPress({ nativeEvent: { coordinate: { latitude: canonical.lat, longitude: canonical.lng } } });
      await flushPromises();
    });
  }
  async function pickCanonical(tree: ReactTestRenderer) {
    act(() => findButton(tree, 'Chọn tỉnh/thành')?.props.onPress());
    act(() => findTextInput(tree, 'Tìm khu vực')?.props.onChangeText('Hồ Chí Minh'));
    act(() => findButton(tree, 'Chọn khu vực: Thành phố Hồ Chí Minh')?.props.onPress());
    act(() => findButton(tree, 'Chọn phường/xã')?.props.onPress());
    act(() => findTextInput(tree, 'Tìm khu vực')?.props.onChangeText('Bến Thành'));
    act(() => findButton(tree, 'Chọn khu vực: Phường Bến Thành')?.props.onPress());
    act(() => findButton(tree, 'Xác nhận ghim đã chọn')?.props.onPress());
  }
  it('updates a moved pin with explicitly chosen canonical codes and prevents duplicate submission', async () => {
    mockGetAddresses.mockResolvedValue([saved]); mockReverse.mockResolvedValue({ formattedAddress: 'New street' });
    const tree = await mountScreen(); await movePin(tree); await pickCanonical(tree);
    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(false);
    act(() => findTextInput(tree, 'Địa chỉ chi tiết')?.props.onChangeText('Corrected street'));
    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(false);
    mockGetAddresses.mockResolvedValue([{ ...canonical, line1: 'Corrected street' }]);
    mockUpdateAddress.mockResolvedValue({ ...canonical, line1: 'Corrected street' });
    const submit = findButton(tree, 'Cập nhật địa chỉ')!;
    await act(async () => { submit.props.onPress(); submit.props.onPress(); await flushPromises(); });
    expect(mockUpdateAddress).toHaveBeenCalledTimes(1);
    expect(mockUpdateAddress).toHaveBeenCalledWith(saved.id, expect.objectContaining({ lat: canonical.lat, lng: canonical.lng, provinceCode: '79', districtCode: '26743', district: 'Phường Bến Thành', line1: 'Corrected street' }));
    expect(customerProfileAddressWrites.size).toBe(0);
  });
  it('retains the edit and exposes a definitive update error', async () => {
    mockGetAddresses.mockResolvedValue([saved]); mockReverse.mockResolvedValue({ formattedAddress: 'New street' });
    mockUpdateAddress.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Địa chỉ không hợp lệ.' } } });
    const tree = await mountScreen(); await movePin(tree); await pickCanonical(tree);
    await act(async () => { findButton(tree, 'Cập nhật địa chỉ')?.props.onPress(); await flushPromises(); });
    expect(findTextInput(tree, 'Địa chỉ chi tiết')?.props.value).toBe('New street');
    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(false);
    expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Địa chỉ không hợp lệ.')).toBe(true);
  });
  it('rejects a late reverse response after the owner selected administrative fields', async () => {
    let resolve!: (value: unknown) => void;
    mockGetAddresses.mockResolvedValue([saved]); mockReverse.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const tree = await mountScreen(); await movePin(tree); await pickCanonical(tree);
    act(() => findTextInput(tree, 'Địa chỉ chi tiết')?.props.onChangeText('Manually entered street'));
    await act(async () => { resolve({ formattedAddress: 'Stale street', province: 'Wrong', district: 'Wrong' }); await flushPromises(); });
    expect(findTextInput(tree, 'Địa chỉ chi tiết')?.props.value).not.toBe('Stale street');
    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(false);
  });
  it('does not write for another role even through a previously enabled handler', async () => {
    mockGetAddresses.mockResolvedValue([saved]); mockReverse.mockResolvedValue({ formattedAddress: 'New street' });
    const tree = await mountScreen(); await movePin(tree); await pickCanonical(tree);
    const submit = findButton(tree, 'Cập nhật địa chỉ')!;
    mockAuthState = { ...mockAuthState, user: { ...mockCustomer, role: UserRole.TECHNICIAN } };
    await act(async () => { submit.props.onPress(); await flushPromises(); });
    expect(mockUpdateAddress).not.toHaveBeenCalled();
  });
  it('locks an ambiguous update and reconciles with GET instead of sending it again', async () => {
    mockGetAddresses.mockResolvedValue([saved]); mockReverse.mockResolvedValue({ formattedAddress: 'New street' });
    mockUpdateAddress.mockRejectedValueOnce(new Error('timeout'));
    const tree = await mountScreen(); await movePin(tree); await pickCanonical(tree);
    await act(async () => { findButton(tree, 'Cập nhật địa chỉ')?.props.onPress(); await flushPromises(); });
    expect(findButton(tree, 'Cập nhật địa chỉ')?.props.disabled).toBe(true);
    mockGetAddresses.mockResolvedValue([canonical]);
    await act(async () => { findButton(tree, 'Kiểm tra địa chỉ đã lưu')?.props.onPress(); await flushPromises(); });
    expect(mockUpdateAddress).toHaveBeenCalledTimes(1);
    expect(customerProfileAddressWrites.size).toBe(0);
  });
  it('shows one account title and a hero edit action without writes on mount', async () => {
    const tree = await mountScreen();
    const textValues = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(textValues).toContain('Tài khoản');
    expect(textValues).not.toContain('TÀI KHOẢN');
    const heroEdit = findButton(tree, 'Chỉnh sửa hồ sơ');
    expect(heroEdit).toBeDefined();
    expect(heroEdit?.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockCreateAddress).not.toHaveBeenCalled();
    expect(mockUpdateAddress).not.toHaveBeenCalled();
    expect(mockDeleteAddress).not.toHaveBeenCalled();
  });

  it('shows an honest address load error with retry inside the address sheet', async () => {
    mockGetAddresses.mockRejectedValue(new Error('offline'));
    const tree = await mountScreen();
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());
    expect(tree.root.findAllByType(Text).some((node) =>
      node.props.children === 'Không thể tải địa chỉ đã lưu. Vui lòng thử lại.',
    )).toBe(true);
    const retry = findButton(tree, 'Thử tải lại địa chỉ đã lưu');
    expect(retry).toBeDefined();
    expect(retry?.props.style.minHeight).toBeGreaterThanOrEqual(44);
    const callsBefore = mockGetAddresses.mock.calls.length;
    mockGetAddresses.mockResolvedValue([]);
    await act(async () => {
      retry?.props.onPress();
      await flushPromises();
    });
    expect(mockGetAddresses.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('labels saved address rows with pin status and named edit/delete actions', async () => {
    mockGetAddresses.mockResolvedValue([
      {
        id: 'address-valid-pin',
        userId: mockCustomer.id,
        label: 'Nhà',
        line1: 'Địa chỉ có ghim',
        ward: 'Phường An Bình',
        district: 'Quận Bình An',
        province: 'Tỉnh Bình Dương',
        lat: 10,
        lng: 106,
        isDefault: true,
      },
      {
        id: 'address-no-pin',
        userId: mockCustomer.id,
        label: 'Quê',
        line1: 'Địa chỉ thiếu ghim',
        ward: 'Phường Cũ',
        district: 'Quận Cũ',
        province: 'Tỉnh Cũ',
        lat: null,
        lng: null,
        isDefault: false,
      },
    ]);
    const tree = await mountScreen();
    await act(async () => { await flushPromises(); });
    const addressMenu = tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Địa chỉ sửa chữa'),
    );
    act(() => addressMenu?.props.onPress());
    const textValues = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(textValues).toContain('Đã có ghim chính xác');
    expect(textValues).toContain('Chưa có ghim hợp lệ');
    expect(findButton(tree, 'Sửa địa chỉ Nhà')).toBeDefined();
    expect(findButton(tree, 'Xoá địa chỉ Nhà')).toBeDefined();
    expect(findButton(tree, 'Sửa địa chỉ Quê')).toBeDefined();
    expect(findButton(tree, 'Xoá địa chỉ Quê')).toBeDefined();
  });
});

describe('Customer logout', () => {
  it('does not patch another session after an avatar upload finishes late', async () => {
    const avatar = jest.requireMock('./customer-avatar-upload') as { persistCustomerAvatar: jest.Mock };
    avatar.persistCustomerAvatar.mockImplementationOnce(
      jest.requireActual('../../services/avatar-upload').persistAvatar,
    );
    const picker = jest.requireMock('expo-image-picker') as { launchImageLibraryAsync: jest.Mock };
    const media = jest.requireMock('../../api/media.api') as { mediaApi: { uploadPublicImage: jest.Mock } };
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false,
      assets: [{ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', fileName: 'avatar.jpg' }] });
    let finish!: (result: { url: string }) => void;
    media.mediaApi.uploadPublicImage.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const tree = await mountScreen();
    mockSetAuth.mockClear();
    await act(async () => { findButton(tree, 'Đổi ảnh đại diện')!.props.onPress(); await flushPromises(); });
    expect(media.mediaApi.uploadPublicImage).toHaveBeenCalledTimes(1);
    mockAuthState = { ...mockAuthState, sessionGeneration: 2, user: { ...mockCustomer, id: 'customer-b' } };
    await act(async () => { tree.update(screenElement()); await flushPromises(); });
    expect(findButton(tree, 'Đổi ảnh đại diện')?.props.disabled).toBe(false);
    await act(async () => { finish({ url: 'https://example.test/avatar.jpg' }); await flushPromises(); });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it('clears old profile busy state on session change without applying a late save', async () => {
    let finish!: (profile: UserInfo) => void;
    mockUpdateProfile.mockReturnValueOnce(new Promise<UserInfo>((resolve) => { finish = resolve; }));
    const tree = await mountScreen();
    await act(async () => { findButton(tree, 'Chỉnh sửa hồ sơ')!.props.onPress(); });
    await act(async () => { findTextInput(tree, 'Họ và tên')!.props.onChangeText('Updated name'); });
    const save = () => tree.root.findAllByType(TouchableOpacity).find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Lưu thay đổi'));
    await act(async () => { save()!.props.onPress(); await flushPromises(); });
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    mockSetAuth.mockClear();
    mockAuthState = { ...mockAuthState, sessionGeneration: 2 };
    await act(async () => { tree.update(screenElement()); });
    expect(save()?.props.accessibilityState.busy).toBe(false);
    await act(async () => { finish({ ...mockCustomer, fullName: 'Updated name' }); await flushPromises(); });
    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it('does not clear a newer session when an earlier logout finishes late', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    let finish!: () => void;
    mockLogout.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const tree = await mountScreen();
    await act(async () => { findButton(tree, 'Đăng xuất khỏi FixHome')!.props.onPress(); });
    mockAuthState = { ...mockAuthState, sessionGeneration: 2, user: { ...mockCustomer, id: 'customer-b' } };
    await act(async () => { finish(); await flushPromises(); });
    expect(mockLogoutStore).not.toHaveBeenCalled();
  });

  it.each(['logout', 'switch-account', 'same-account-new-session', 'unmount'])
    ('ignores a late profile response after %s', async (transition) => {
      let finish!: (profile: UserInfo) => void;
      mockGetProfile.mockReturnValueOnce(new Promise<UserInfo>((resolve) => { finish = resolve; }));
      const tree = await mountScreen();
      if (transition === 'unmount') {
        await act(async () => tree.unmount());
      } else {
        mockAuthState = { ...mockAuthState, sessionGeneration: 2,
          user: transition === 'logout' ? null
            : transition === 'switch-account' ? { ...mockCustomer, id: 'customer-b' } : mockCustomer,
          isAuthenticated: transition !== 'logout',
          token: transition === 'logout' ? null : 'new-session-token' };
      }
      await act(async () => { finish(mockCustomer); await flushPromises(); });
      expect(mockSetAuth).not.toHaveBeenCalled();
      expect(mockGetAddresses).not.toHaveBeenCalled();
    });

  it('logs out on web without Alert and prevents duplicate requests while pending', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const alert = jest.spyOn(Alert, 'alert');
    let finish!: () => void;
    mockLogout.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const tree = await mountScreen();
    const button = findButton(tree, 'Đăng xuất khỏi FixHome')!;
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockLogoutStore).not.toHaveBeenCalled();
    expect(button.props.disabled).toBe(true);
    expect(alert).not.toHaveBeenCalled();
    await act(async () => { finish(); await flushPromises(); });
    expect(mockLogoutStore).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error and keeps the session when secure logout fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockLogout.mockRejectedValueOnce(new Error('SecureStore removal failed'));
    const tree = await mountScreen();
    await act(async () => { findButton(tree, 'Đăng xuất khỏi FixHome')!.props.onPress(); await flushPromises(); });
    expect(mockLogoutStore).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(Text).map((node) => node.props.children))
      .toContain('Không thể hoàn tất đăng xuất. Vui lòng thử lại.');
    expect(findButton(tree, 'Đăng xuất khỏi FixHome')!.props.disabled).toBe(false);
  });

  it('requires native confirmation before logout and lets Cancel keep the session', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mountScreen();
    await act(async () => { findButton(tree, 'Đăng xuất khỏi FixHome')!.props.onPress(); });
    expect(mockLogout).not.toHaveBeenCalled();
    const choices = alert.mock.calls[0][2]!;
    expect(choices[0].style).toBe('cancel');
    await act(async () => { choices[0].onPress?.(); await flushPromises(); });
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockLogoutStore).not.toHaveBeenCalled();
    await act(async () => { choices[1].onPress?.(); await flushPromises(); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockLogoutStore).toHaveBeenCalledTimes(1);
  });

  it('wallet menu row navigates to the Customer-only wallet route without fetching', async () => {
    const tree = await mountScreen();
    const button = findButton(tree, 'Mở ví FixHome');
    expect(button).toBeTruthy();
    await act(async () => { button!.props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerWallet');
  });
});
