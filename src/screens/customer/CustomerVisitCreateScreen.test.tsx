import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerVisitCreateScreen from './CustomerVisitCreateScreen';

const mockReplace = jest.fn();
const mockVisit = { contact: jest.fn(), create: jest.fn(), consultation: jest.fn() };
const mockServices = jest.fn();
const mockAddresses = jest.fn();
let mockParams: unknown;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: (...a: unknown[]) => mockReplace(...a), goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});
jest.mock('expo-image-picker', () => ({}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('../../components/BackButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/BookingSessionPicker', () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (v: unknown) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text: T, TouchableOpacity: B } = require('react-native');
    return <B testID="pick-session" onPress={() => onChange({ mode: 'scheduled', date: '2026-10-27', slot: 'morning' })}><T>chọn buổi</T></B>;
  },
}));
jest.mock('../../constants/theme', () => {
  const tone = { bg: '#eee', fg: '#111', text: '#222' };
  return { iconSize: { sm: 16, md: 20, lg: 24 }, iconStroke: 1.75, useAppTheme: () => ({ colors: { primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF', background: '#fff', surface: '#fff', text: '#000', textSecondary: '#666', muted: '#999', border: '#ddd', tone: { danger: tone, success: tone, warning: tone } } }) };
});
jest.mock('../../api/visit-groups.api', () => ({
  VISIT_DEVICE_LIMIT: 3,
  visitGroupsApi: new Proxy({}, { get: (_t, n: string) => (...a: unknown[]) => (mockVisit as Record<string, (...x: unknown[]) => unknown>)[n](...a) }),
}));
jest.mock('../../api/services.api', () => ({ servicesApi: { getServices: (...a: unknown[]) => mockServices(...a) } }));
jest.mock('../../api/users.api', () => ({ usersApi: { getAddresses: (...a: unknown[]) => mockAddresses(...a) } }));
jest.mock('../../api/media.api', () => ({ mediaApi: { uploadBookingPhoto: jest.fn() } }));

const svc = (id: string, name: string) => ({ id, name, isActive: true, categoryId: 'c', pricingMode: 'inspection_required' });
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
const byId = (t: ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
async function mount() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<CustomerVisitCreateScreen />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}
async function addDevice(tree: ReactTestRenderer, serviceId: string, description: string) {
  await act(async () => { byId(tree, 'visit-add-device').props.onPress(); });
  await act(async () => { byId(tree, `visit-service-${serviceId}`).props.onPress(); });
  await act(async () => { tree.root.findByProps({ accessibilityLabel: 'Mô tả tình trạng' }).props.onChangeText(description); });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockParams = undefined;
  mockVisit.contact.mockResolvedValue({ enabled: true, deviceLimit: 3, hotline: '1900' });
  mockServices.mockResolvedValue({ data: [svc('s1', 'Điều hòa'), svc('s2', 'Tủ lạnh')], total: 2 });
  mockAddresses.mockResolvedValue([{ id: 'a1', userId: 'u', label: 'Nhà', line1: '1', ward: '', district: 'Q1', province: 'HCM', lat: 10, lng: 106, isDefault: true }]);
});

it('says so when several devices cannot be booked now', async () => {
  mockVisit.contact.mockResolvedValue({ enabled: false, deviceLimit: 3, hotline: null });
  expect(texts(await mount()).some((t) => t.startsWith('Hiện chưa đặt được nhiều thiết bị'))).toBe(true);
});

it('needs two devices before it can continue, then sends one request with the idempotency key', async () => {
  mockVisit.create.mockResolvedValue({ id: 'v9' });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const tree = await mount();
  await addDevice(tree, 's1', 'không lạnh');
  expect(byId(tree, 'visit-submit').props.disabled).toBe(true);
  expect(texts(tree).some((t) => t.startsWith('Hiện có 1 thiết bị'))).toBe(true);
  await addDevice(tree, 's2', 'đóng tuyết');
  await act(async () => { byId(tree, 'pick-session').props.onPress(); });
  expect(byId(tree, 'visit-submit').props.disabled).toBe(false);
  await act(async () => { byId(tree, 'visit-submit').props.onPress(); });
  const send = alert.mock.calls[0][2]!.find((b) => b.text === 'Gửi yêu cầu')!;
  await act(async () => { send.onPress!(); });
  expect(mockVisit.create).toHaveBeenCalledTimes(1);
  expect(mockVisit.create.mock.calls[0][0]).toMatchObject({ addressId: 'a1', idempotencyKey: expect.stringMatching(/^visit-/), items: [{ serviceId: 's1' }, { serviceId: 's2' }] });
  expect(mockReplace).toHaveBeenCalledWith('CustomerVisit', { visitGroupId: 'v9' });
  alert.mockRestore();
});

it('locks the add button at the limit and keeps the send locked when the outcome is unknown', async () => {
  mockVisit.contact.mockResolvedValue({ enabled: true, deviceLimit: 2, hotline: '1900' });
  mockVisit.create.mockRejectedValue(new Error('network'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const tree = await mount();
  await addDevice(tree, 's1', 'a');
  await addDevice(tree, 's2', 'b');
  expect(byId(tree, 'visit-add-device')).toBeUndefined();
  expect(texts(tree)).toContain('Đã đủ 2/2 thiết bị');
  await act(async () => { byId(tree, 'pick-session').props.onPress(); });
  await act(async () => { byId(tree, 'visit-submit').props.onPress(); });
  await act(async () => { alert.mock.calls[0][2]!.find((b) => b.text === 'Gửi yêu cầu')!.onPress!(); });
  expect(texts(tree).some((t) => t.startsWith('Chưa xác nhận được kết quả'))).toBe(true);
  expect(byId(tree, 'visit-submit').props.disabled).toBe(true);
  alert.mockRestore();
});

it('loads every device the assistant suggested as a chip that must be confirmed before sending', async () => {
  mockParams = { prefill: { aiSessionId: 'ai1', devices: [{ serviceId: 's2', description: 'tủ lạnh không mát' }, { serviceId: 's1', description: 'máy lạnh chảy nước' }] } };
  const tree = await mount();
  expect(tree.root.findAllByType(TextInput).some((i) => i.props.value === 'tủ lạnh không mát')).toBe(true);
  expect(byId(tree, 'visit-chip-2')).toBeDefined();
  await act(async () => { byId(tree, 'pick-session').props.onPress(); });
  expect(byId(tree, 'visit-submit').props.disabled).toBe(true);
  expect(texts(tree).some((t) => t.includes('xác nhận'))).toBe(true);
  await act(async () => { byId(tree, 'visit-device-confirm').props.onPress(); });
  await act(async () => { byId(tree, 'visit-chip-2').props.onPress(); });
  await act(async () => { byId(tree, 'visit-device-confirm').props.onPress(); });
  expect(byId(tree, 'visit-submit').props.disabled).toBe(false);
});

it('switches the form between devices with the chips and drops a device with its remove button', async () => {
  const tree = await mount();
  await addDevice(tree, 's1', 'không lạnh');
  await addDevice(tree, 's2', 'đóng tuyết');
  const description = () => tree.root.findByProps({ accessibilityLabel: 'Mô tả tình trạng' }).props.value;
  expect(description()).toBe('đóng tuyết');
  await act(async () => { byId(tree, 'visit-chip-1').props.onPress(); });
  expect(description()).toBe('không lạnh');
  expect(byId(tree, 'visit-chip-1').props.accessibilityState.selected).toBe(true);
  await act(async () => { byId(tree, 'visit-device-remove').props.onPress(); });
  expect(byId(tree, 'visit-chip-2')).toBeUndefined();
  expect(description()).toBe('đóng tuyết');
});
