import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import CustomerBookingAddressEditor, {
  clearBookingAddressAttempt, getBookingAddressAttempt, rememberBookingAddressAttempt,
} from './CustomerBookingAddressEditor';

const mockAutocomplete = jest.fn();
const mockReverse = jest.fn();
const mockCreateAddress = jest.fn();
const mockGetAddresses = jest.fn();
const mockGetLocation = jest.fn();
const mockPermission = jest.fn();

jest.mock('../../api/geo.api', () => ({
  geoApi: {
    autocomplete: (...args: unknown[]) => mockAutocomplete(...args),
    reverse: (...args: unknown[]) => mockReverse(...args),
  },
}));
jest.mock('../../api/users.api', () => ({
  usersApi: {
    createAddress: (...args: unknown[]) => mockCreateAddress(...args),
    getAddresses: (...args: unknown[]) => mockGetAddresses(...args),
  },
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetLocation(...args),
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
    Marker: ({ title }: { title?: string }) => ReactModule.createElement(Native.Text, null, title),
  };
});
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({ colors: {
    surface: '#FFF', background: '#F8F9FB', text: '#142331',
    textSecondary: '#64748B', primary: '#2563EB', border: '#CDD5E0',
    success: '#16A34A',
  } }),
}));

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string | number)[];
  findAll: (predicate: (node: Node) => boolean) => Node[];
};
type Renderer = { root: Node; unmount: () => void };
const { create, act } = jest.requireActual('react-test-renderer') as {
  create: (view: React.ReactElement) => Renderer;
  act: (callback: () => Promise<void> | void) => Promise<void>;
};
const onCancel = jest.fn();
const onSaved = jest.fn();
const checkOwner = jest.fn().mockReturnValue(true);
const ownerId = 'customer-test-only';
const existing = { id: 'old-address', userId: ownerId, label: 'Old',
  line1: 'Old st', ward: '', district: 'Old District', province: 'Old City',
  lat: 10.11, lng: 106.11, isDefault: true };
const newAddress = { id: 'address-created', userId: ownerId, label: 'Nhà mới',
  line1: '50 Phố Mới', ward: 'Phường 2', district: 'Quận 3',
  province: 'TP. HCM', lat: 10.78, lng: 106.69, isDefault: false };

function action(tree: Renderer, label: string): Node {
  const node = tree.root.findAll((item) =>
    item.type === TouchableOpacity && item.props.accessibilityLabel === label)[0];
  expect(node).toBeDefined();
  return node;
}
function field(tree: Renderer, label: string): Node {
  const node = tree.root.findAll((item) =>
    item.type === TextInput && item.props.accessibilityLabel === label)[0];
  expect(node).toBeDefined();
  return node;
}
function textOf(node: Node): string {
  return node.children.map((item) =>
    typeof item === 'string' || typeof item === 'number' ? String(item) : textOf(item)).join('');
}
async function render(): Promise<Renderer> {
  let tree!: Renderer;
  await act(async () => {
    tree = create(<CustomerBookingAddressEditor
      ownerUserId={ownerId}
      existingAddressIds={[existing.id]}
      isOwnerCurrent={checkOwner}
      onSaved={onSaved}
      onCancel={onCancel}
    />);
  });
  return tree;
}
async function fillAndPick(tree: Renderer) {
  await act(async () => {
    (field(tree, 'Tên địa chỉ mới').props.onChangeText as (next: string) => void)('Nhà mới');
    (field(tree, 'Tìm địa chỉ mới').props.onChangeText as (next: string) => void)('50 Phố Mới');
  });
  await act(async () => {
    jest.advanceTimersByTime(350);
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => {
    (action(tree, 'Chọn gợi ý địa chỉ: 50 Phố Mới').props.onPress as () => void)();
  });
}
async function placeAndConfirm(tree: Renderer) {
  await act(async () => {
    const map = tree.root.findAll((item) => item.props.testID === 'address-map')[0];
    (map.props.onPress as (e: unknown) => void)({
      nativeEvent: { coordinate: { latitude: 10.78, longitude: 106.69 } },
    });
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => {
    (action(tree, 'Xác nhận ghim mới').props.onPress as () => void)();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  checkOwner.mockReturnValue(true);
  mockAutocomplete.mockResolvedValue([{ placeId: 'place-a', description: '50 Phố Mới',
    lat: 10.78, lng: 106.69, district: 'Quận 3', province: 'TP. HCM' }]);
  mockReverse.mockResolvedValue({ formattedAddress: newAddress.line1,
    ward: newAddress.ward, district: newAddress.district, province: newAddress.province });
  mockCreateAddress.mockResolvedValue(newAddress);
  mockGetAddresses.mockResolvedValue([existing, newAddress]);
});
afterEach(() => {
  clearBookingAddressAttempt(ownerId);
  jest.useRealTimers();
});

it('starts with no confirmed pin and never calls write endpoints on mount or search', async () => {
  const tree = await render();
  expect(action(tree, 'Lưu địa chỉ mới').props.disabled).toBe(true);
  await fillAndPick(tree);
  // A returned geocoder position is merely a suggestion.
  expect(action(tree, 'Lưu địa chỉ mới').props.disabled).toBe(true);
  expect(mockCreateAddress).not.toHaveBeenCalled();
  expect(mockGetAddresses).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it('requires an explicit native map pin and confirmation, then verifies owner and coordinates before selecting', async () => {
  const tree = await render();
  await fillAndPick(tree);
  await act(async () => {
    const map = tree.root.findAll((item) => item.props.testID === 'address-map')[0];
    (map.props.onPress as (e: unknown) => void)({
      nativeEvent: { coordinate: { latitude: 10.78, longitude: 106.69 } },
    });
    await Promise.resolve(); await Promise.resolve();
  });
  expect(action(tree, 'Lưu địa chỉ mới').props.disabled).toBe(true);
  await act(async () => { (action(tree, 'Xác nhận ghim mới').props.onPress as () => void)(); });
  expect(action(tree, 'Lưu địa chỉ mới').props.disabled).toBe(false);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(mockCreateAddress).toHaveBeenCalledWith(expect.objectContaining({
    label: 'Nhà mới', line1: '50 Phố Mới', lat: 10.78, lng: 106.69, isDefault: false,
  }));
  expect(mockGetAddresses).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith(newAddress, [existing, newAddress]);
  await act(async () => tree.unmount());
});

it('holds a failed or ambiguous address POST without resending and reconciles only via GET', async () => {
  mockCreateAddress.mockRejectedValueOnce(new Error('Network request failed'));
  mockGetAddresses.mockResolvedValueOnce([existing, newAddress]);
  const tree = await render();
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(action(tree, 'Kiểm tra địa chỉ vừa tạo').props.disabled).toBe(false);
  await act(async () => {
    (action(tree, 'Kiểm tra địa chỉ vừa tạo').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith(newAddress, [existing, newAddress]);
  await act(async () => tree.unmount());
});

it('does not accept a different owner response, invalid address, or unverified search candidate', async () => {
  mockGetAddresses.mockResolvedValue([existing, { ...newAddress, userId: 'someone-else' }]);
  const tree = await render();
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(action(tree, 'Kiểm tra địa chỉ vừa tạo')).toBeDefined();
  await act(async () => tree.unmount());
});


it('matches the Backend decimal(10,7) readback for an exact high-precision pin', async () => {
  mockGetAddresses.mockResolvedValue([existing, newAddress]);
  const tree = await render();
  await fillAndPick(tree);
  await act(async () => {
    const map = tree.root.findAll((item) => item.props.testID === 'address-map')[0];
    (map.props.onPress as (e: unknown) => void)({
      nativeEvent: { coordinate: { latitude: 10.780000049, longitude: 106.690000049 } },
    });
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => { (action(tree, 'Xác nhận ghim mới').props.onPress as () => void)(); });
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledWith(expect.objectContaining({
    lat: 10.78, lng: 106.69,
  }));
  expect(onSaved).toHaveBeenCalledWith(newAddress, [existing, newAddress]);
  await act(async () => tree.unmount());
});

it('never reconciles a lookalike different id once Backend has returned a definite created id', async () => {
  mockCreateAddress.mockResolvedValueOnce({ ...newAddress, id: 'created-A' });
  mockGetAddresses.mockResolvedValue([existing, { ...newAddress, id: 'created-B' }]);
  const tree = await render();
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  expect(action(tree, 'Kiểm tra địa chỉ vừa tạo')).toBeDefined();
  await act(async () => tree.unmount());
});

it('returns to editable draft on a definite Backend validation 400 without claiming ambiguous success', async () => {
  mockCreateAddress.mockRejectedValueOnce({ response: { status: 400 } });
  const onCleared = jest.fn();
  let tree!: Renderer;
  await act(async () => {
    tree = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onSaved={onSaved} onCancel={onCancel} onAttemptCleared={onCleared} />);
  });
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(onCleared).toHaveBeenCalledTimes(1);
  expect(action(tree, 'Lưu địa chỉ mới').props.disabled).toBe(false);
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(mockGetAddresses).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it('keeps the one-shot POST lock when creation succeeds but owner GET readback returns 403', async () => {
  mockGetAddresses.mockRejectedValueOnce({ response: { status: 403 } });
  const onCleared = jest.fn();
  let tree!: Renderer;
  await act(async () => {
    tree = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onSaved={onSaved} onCancel={onCancel} onAttemptCleared={onCleared} />);
  });
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(mockGetAddresses).toHaveBeenCalledTimes(1);
  expect(onCleared).not.toHaveBeenCalled();
  expect(action(tree, 'Kiểm tra địa chỉ vừa tạo')).toBeDefined();
  expect(tree.root.findAll((node) => node.type === TouchableOpacity
    && node.props.accessibilityLabel === 'Lưu địa chỉ mới')).toHaveLength(0);
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it('cancels a stale reverse spinner when current-location permission is denied', async () => {
  let resolveReverse!: (value: unknown) => void;
  mockReverse.mockReturnValueOnce(new Promise((resolve) => { resolveReverse = resolve; }));
  mockPermission.mockResolvedValue({ status: 'denied' });
  const tree = await render();
  await fillAndPick(tree);
  await act(async () => {
    const map = tree.root.findAll((item) => item.props.testID === 'address-map')[0];
    (map.props.onPress as (e: unknown) => void)({
      nativeEvent: { coordinate: { latitude: 10.78, longitude: 106.69 } },
    });
  });
  expect(textOf(tree.root)).toContain('Đang xác định địa chỉ');
  await act(async () => {
    (action(tree, 'Dùng vị trí hiện tại để ghim').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(textOf(tree.root)).not.toContain('Đang xác định địa chỉ');
  expect(textOf(tree.root)).toContain('Chưa được cấp quyền vị trí');
  expect(action(tree, 'Tra cứu lại địa chỉ')).toBeDefined();
  await act(async () => {
    resolveReverse({ formattedAddress: 'Stale', district: 'Wrong', province: 'Wrong' });
    await Promise.resolve();
  });
  expect(textOf(tree.root)).not.toContain('Stale');
  await act(async () => tree.unmount());
});

it('does not submit overlong fields even when state is changed programmatically', async () => {
  const tree = await render();
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (field(tree, 'Tên địa chỉ mới').props.onChangeText as (v: string) => void)('N'.repeat(101));
  });
  expect(action(tree, 'Lưu địa chỉ mới').props.disabled).toBe(true);
  expect(mockCreateAddress).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});


it('keeps the POST-confirmed ID in the owner ledger when the editor closes before the response', async () => {
  let completePost!: (value: typeof newAddress) => void;
  mockCreateAddress.mockReturnValueOnce(new Promise((resolve) => {
    completePost = resolve as (value: typeof newAddress) => void;
  }));
  let tree!: Renderer;
  await act(async () => {
    tree = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onSaved={onSaved} onCancel={onCancel}
      onAttemptStart={(attempt) => rememberBookingAddressAttempt(ownerId, attempt)} />);
  });
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)?.knownId).toBeNull();
  await act(async () => tree.unmount());
  await act(async () => {
    completePost(newAddress);
    await Promise.resolve(); await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)?.knownId).toBe(newAddress.id);
  expect(mockGetAddresses).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});


it('never adopts a matching lookalike when an old editor POST ACK arrives after a replacement editor mounted', async () => {
  let finishPost!: (value: typeof newAddress) => void;
  mockCreateAddress.mockReturnValueOnce(new Promise((resolve) => {
    finishPost = resolve as (value: typeof newAddress) => void;
  }));
  let old!: Renderer;
  await act(async () => {
    old = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onCancel={onCancel} onSaved={onSaved}
      onAttemptStart={(attempt) => rememberBookingAddressAttempt(ownerId, attempt)} />);
  });
  await fillAndPick(old);
  await placeAndConfirm(old);
  await act(async () => {
    (action(old, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)?.posting).toBe(true);
  await act(async () => old.unmount());

  let replacement!: Renderer;
  await act(async () => {
    replacement = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onCancel={onCancel} onSaved={onSaved}
      lockedAttempt={getBookingAddressAttempt(ownerId)} />);
  });
  mockGetAddresses.mockResolvedValueOnce([existing, { ...newAddress, id: 'lookalike-B' }]);
  await act(async () => {
    (action(replacement, 'Kiểm tra địa chỉ vừa tạo').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(onSaved).not.toHaveBeenCalled();

  await act(async () => {
    finishPost(newAddress);
    await Promise.resolve(); await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)?.knownId).toBe(newAddress.id);
  expect(getBookingAddressAttempt(ownerId)?.posting).toBe(false);
  mockGetAddresses.mockResolvedValueOnce([existing, { ...newAddress, id: 'lookalike-B' }]);
  await act(async () => {
    (action(replacement, 'Kiểm tra địa chỉ vừa tạo').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);

  mockGetAddresses.mockResolvedValueOnce([existing, { ...newAddress, id: 'lookalike-B' }, newAddress]);
  await act(async () => {
    (action(replacement, 'Kiểm tra địa chỉ vừa tạo').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(onSaved).toHaveBeenCalledWith(newAddress, expect.any(Array));
  await act(async () => replacement.unmount());
});

it('does not let an old GPS permission result hide a newer GPS request spinner', async () => {
  let finishA!: (value: { status: string }) => void;
  mockPermission
    .mockReturnValueOnce(new Promise((resolve) => { finishA = resolve; }))
    .mockResolvedValueOnce({ status: 'granted' });
  let finishPosition!: (value: { coords: { latitude: number; longitude: number } }) => void;
  mockGetLocation.mockReturnValueOnce(new Promise((resolve) => { finishPosition = resolve; }));
  const tree = await render();
  const gps = action(tree, 'Dùng vị trí hiện tại để ghim');
  await act(async () => {
    // Simulate two quick user gestures before the disabled state is committed.
    (gps.props.onPress as () => void)();
    (gps.props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(textOf(tree.root)).toContain('Đang xác định GPS');
  await act(async () => {
    finishA({ status: 'denied' });
    await Promise.resolve(); await Promise.resolve();
  });
  expect(textOf(tree.root)).toContain('Đang xác định GPS');
  await act(async () => {
    finishPosition({ coords: { latitude: 10.78, longitude: 106.69 } });
    await Promise.resolve(); await Promise.resolve();
  });
  expect(textOf(tree.root)).not.toContain('Đang xác định GPS');
  await act(async () => tree.unmount());
});

it('releases only the rejected original POST after unmount, so a new editor may correct the address', async () => {
  let rejectOld!: (error: unknown) => void;
  mockCreateAddress.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }));
  let old!: Renderer;
  await act(async () => {
    old = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onCancel={onCancel} onSaved={onSaved}
      onAttemptStart={(attempt) => rememberBookingAddressAttempt(ownerId, attempt)} />);
  });
  await fillAndPick(old);
  await placeAndConfirm(old);
  await act(async () => {
    (action(old, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)?.posting).toBe(true);
  await act(async () => old.unmount());
  await act(async () => {
    rejectOld({ response: { status: 400 } });
    await Promise.resolve(); await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)).toBeNull();
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  expect(mockGetAddresses).not.toHaveBeenCalled();

  const fresh = await render();
  expect(action(fresh, 'Lưu địa chỉ mới').props.disabled).toBe(true);
  await fillAndPick(fresh);
  await placeAndConfirm(fresh);
  await act(async () => {
    (action(fresh, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve(); await Promise.resolve();
  });
  expect(mockCreateAddress).toHaveBeenCalledTimes(2);
  expect(onSaved).toHaveBeenCalledWith(newAddress, [existing, newAddress]);
  await act(async () => fresh.unmount());
});

it('preserves unknown old POST after unmount and never opens a second POST', async () => {
  let rejectOld!: (error: unknown) => void;
  mockCreateAddress.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }));
  let old!: Renderer;
  await act(async () => {
    old = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onCancel={onCancel} onSaved={onSaved}
      onAttemptStart={(attempt) => rememberBookingAddressAttempt(ownerId, attempt)} />);
  });
  await fillAndPick(old);
  await placeAndConfirm(old);
  await act(async () => {
    (action(old, 'Lưu địa chỉ mới').props.onPress as () => void)();
    await Promise.resolve();
  });
  await act(async () => old.unmount());
  await act(async () => {
    rejectOld(new Error('network timeout'));
    await Promise.resolve(); await Promise.resolve();
  });
  expect(getBookingAddressAttempt(ownerId)?.posting).toBe(false);
  const next = getBookingAddressAttempt(ownerId);
  let replacement!: Renderer;
  await act(async () => {
    replacement = create(<CustomerBookingAddressEditor ownerUserId={ownerId}
      existingAddressIds={[existing.id]} isOwnerCurrent={checkOwner}
      onCancel={onCancel} onSaved={onSaved} lockedAttempt={next} />);
  });
  expect(action(replacement, 'Kiểm tra địa chỉ vừa tạo')).toBeDefined();
  expect(replacement.root.findAll((node) => node.type === TouchableOpacity
    && node.props.accessibilityLabel === 'Lưu địa chỉ mới')).toHaveLength(0);
  expect(mockCreateAddress).toHaveBeenCalledTimes(1);
  await act(async () => replacement.unmount());
});

it('does not allow a forbidden-owner save and never requests location permission automatically', async () => {
  const tree = await render();
  await fillAndPick(tree);
  await placeAndConfirm(tree);
  checkOwner.mockReturnValue(false);
  await act(async () => {
    (action(tree, 'Lưu địa chỉ mới').props.onPress as () => void)();
  });
  expect(mockCreateAddress).not.toHaveBeenCalled();
  expect(mockPermission).not.toHaveBeenCalled();
  expect(mockGetLocation).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(textOf(tree.root)).toContain('Thêm địa chỉ tại nơi cần sửa');
  await act(async () => tree.unmount());
});
