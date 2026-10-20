// T-NATIVE-01BC: render the production screen with an inbox boundary double.
// Controller/transport safety remains covered by the original invitation suites.
// These synthetic API previews are test data, never prototype booking fixtures.
import React from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import type { InvitationItem } from '../../api/bookings.api';
import { initialInboxState, type InboxState } from './invitation-inbox';
import { lightTheme } from '../../constants/theme';

let mockState: InboxState;
let mockWrite: (state: InboxState) => void;
let mockReduceMotion = false;
const mockNavigate = jest.fn();
const mockRespond = jest.fn(async () => undefined);
const mockLoad = jest.fn(async () => mockWrite(mockState));
const mockFocus = jest.fn(async () => mockWrite(mockState));
const mockBlur = jest.fn();
const mockSetBadge = jest.fn();
const mockAvailability = { isAvailable: true as boolean | null, toggling: false, toggle: jest.fn() };

jest.mock('./invitation-inbox', () => ({
  ...jest.requireActual('./invitation-inbox'),
  createInvitationInbox: (_api: unknown, _orders: unknown, write: (state: InboxState) => void) => {
    mockWrite = write;
    return { focus: mockFocus, blur: mockBlur, load: mockLoad, respond: mockRespond };
  },
}));
jest.mock('../../hooks/useReduceMotion', () => ({ useReduceMotion: () => mockReduceMotion }));
jest.mock('../../hooks/useTechnicianAvailability', () => ({ useTechnicianAvailability: () => mockAvailability }));
jest.mock('../../store/badge.store', () => ({
  useBadgeStore: (select: (state: unknown) => unknown) => select({ setPendingInvitations: mockSetBadge }),
}));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { id: 'tech-fixture', role: 'technician' } }), subscribe: () => () => undefined },
}));
jest.mock('../../api/bookings.api', () => ({ bookingsApi: { getMyInvitations: jest.fn(), respondInvitation: jest.fn() } }));
jest.mock('../../api/orders.api', () => ({ ordersApi: { getMyOrdersPage: jest.fn(), getOrder: jest.fn() } }));
jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' } }));
jest.mock('lucide-react-native', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const NativeView = jest.requireActual<typeof import('react-native')>('react-native').View;
  return new Proxy({}, { get: () => () => R.createElement(NativeView) });
});
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return { useNavigation: () => ({ navigate: mockNavigate }), useFocusEffect: (callback: () => void | (() => void)) => R.useEffect(callback, [callback]) };
});
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const NativeView = jest.requireActual<typeof import('react-native')>('react-native').View;
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => R.createElement(NativeView, props, children),
    useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }),
  };
});

const Screen = jest.requireActual('./TechnicianInvitationsScreen').default as React.ComponentType;
type Renderer = ReturnType<typeof create>;
let renderer: Renderer;

function invitation(id: string, name: string, minutes: number): InvitationItem {
  return {
    id, bookingId: `booking-${id}`, status: 'PENDING', priorityOrder: 1,
    invitedAt: '2031-02-03T01:00:00Z',
    expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
    booking: {
      id: `booking-${id}`, serviceName: name, province: 'Tỉnh kiểm thử', district: 'Huyện kiểm thử',
      quantity: 3, urgency: 'HIGH', preferredStartAt: '2031-02-04T01:00:00Z', preferredEndAt: '2031-02-04T04:00:00Z',
    },
  };
}
const text = () => renderer.root.findAllByType(Text).map(node =>
  Array.isArray(node.props.children) ? node.props.children.filter((c: unknown) => typeof c === 'string').join('') : node.props.children,
).join('\n');
const buttons = (label: string) => renderer.root.findAll(node => node.type === TouchableOpacity && (
  node.props.accessibilityLabel === label ||
  (label.startsWith('Nhận việc ') && node.props.testID === 'invitation-accept') ||
  (label.startsWith('Từ chối lời mời ') && node.props.testID === 'invitation-decline')
));
async function render(invitations: InvitationItem[] = []) {
  mockState = { ...mockState, invitations };
  await act(async () => { renderer = create(<Screen />); });
}
function review(name = 'Kiểm tra bơm (fixture)') {
  act(() => buttons(`Xem và quyết định lời mời ${name}`)[0].props.onPress());
}
function expectNoPrivateOrPrototypeData() {
  expect(text()).not.toMatch(/PRIVATE_|BK-DEMO|SO-DEMO|Quận 3|Ngày mẫu|fixture đủ kỹ năng|₫|ETA/i);
  expect(text()).not.toContain('Nhắn tin');
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2031-02-03T02:00:00Z'));
  jest.clearAllMocks();
  mockState = { ...initialInboxState, loading: false };
  mockReduceMotion = false;
  mockAvailability.isAvailable = true;
  mockAvailability.toggling = false;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('presents every API preview in deadline order with a separate decision footer and safe art', async () => {
  const later = invitation('later', 'Kiểm tra bơm (fixture)', 45);
  const sooner = invitation('sooner', 'Kiểm tra quạt (fixture)', 5);
  await render([later, sooner]);
  const title = renderer.root.findAll(node => node.type === Text && node.props.accessibilityRole === 'header' && node.props.children === 'Lời mời');
  expect(title).toHaveLength(1);
  expect(text()).not.toContain('Lời mời nhận việc');
  expect(text()).not.toContain('Lời mời dành cho bạn');
  expect(text()).not.toContain('Đọc phạm vi và khung giờ trước khi quyết định.');
  expect(text().indexOf(sooner.booking!.serviceName!)).toBeLessThan(text().indexOf(later.booking!.serviceName!));
  expect(text()).toContain('2 lời mời chờ xác nhận');
  expect(text()).toContain('Huyện kiểm thử, Tỉnh kiểm thử');
  expect(text()).toContain('08:00');
  expect(text()).toContain('11:00');
  expect(text()).toContain('04/02/2031');
  expect(text()).toContain('Đang chờ quyết định');
  for (const name of [sooner.booking!.serviceName!, later.booking!.serviceName!]) {
    expect(buttons(`Xem và quyết định lời mời ${name}`)).toHaveLength(1);
  }
  const art = renderer.root.findAll(node => node.type === View && node.props.testID === 'invitation-service-art');
  expect(art).toHaveLength(2);
  expect(StyleSheet.flatten(art[0].props.style)).toMatchObject({ minHeight: 180, backgroundColor: lightTheme.primarySoft });
  const footer = buttons(`Xem và quyết định lời mời ${sooner.booking!.serviceName!}`)[0];
  expect(StyleSheet.flatten(footer.props.style).borderTopWidth).toBe(1);
  expect(text()).toContain('Địa chỉ đầy đủ');
  expectNoPrivateOrPrototypeData();
  expect(mockRespond).not.toHaveBeenCalled();
});

it('opens spacious T03 inside the same screen with only preview metadata and no automatic response', async () => {
  const inv = invitation('one', 'Kiểm tra bơm (fixture)', 20);
  Object.assign(inv.booking!, { addressSummary: 'PRIVATE_ADDRESS', customerPhone: 'PRIVATE_PHONE', description: 'Vòi nước bị rò', customerName: 'PRIVATE_NAME', mediaUrls: ['PRIVATE_IMAGE'] });
  await render([inv]);
  expectNoPrivateOrPrototypeData();
  review();
  expect(text()).toContain('Xem kỹ, rồi nhận việc');
  expect(text()).toContain('Khu vực được phép xem');
  expect(text()).toContain('Khung giờ mong muốn');
  expect(text()).toContain('Số lượng');
  expect(text()).toContain('SL 3');
  expect(text()).toContain('Mức độ khẩn');
  expect(buttons('Nhận việc Kiểm tra bơm (fixture)')).toHaveLength(1);
  expect(buttons('Từ chối lời mời Kiểm tra bơm (fixture)')).toHaveLength(1);
  expect(buttons('Xem và quyết định lời mời Kiểm tra bơm (fixture)')).toHaveLength(0);
  expectNoPrivateOrPrototypeData();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockRespond).not.toHaveBeenCalled();
});

it('accepts through the existing controller and respects Reduce Motion', async () => {
  mockReduceMotion = true;
  await render([invitation('accept-id', 'Kiểm tra bơm (fixture)', 20)]);
  review();
  await act(async () => buttons('Nhận việc Kiểm tra bơm (fixture)')[0].props.onPress());
  expect(mockRespond.mock.calls).toEqual([['accept-id', 'ACCEPT']]);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(text()).not.toContain('Đã xác minh đơn vừa nhận');
});

it('declines only after the protected confirmation, using the same invitation ID', async () => {
  await render([invitation('decline-id', 'Kiểm tra bơm (fixture)', 20)]);
  review();
  act(() => buttons('Từ chối lời mời Kiểm tra bơm (fixture)')[0].props.onPress());
  expect(mockRespond).not.toHaveBeenCalled();
  // Inline confirmation must be explicit before the controller receives DECLINE.
  expect(buttons('Xác nhận từ chối lời mời')).toHaveLength(1);
  expect(buttons('Giữ lại lời mời')).toHaveLength(1);
  await act(async () => buttons('Xác nhận từ chối lời mời')[0].props.onPress());
  expect(mockRespond.mock.calls).toEqual([['decline-id', 'DECLINE']]);
});

it('keeps the selected review locked during pending or uncertain reconciliation', async () => {
  const inv = invitation('locked', 'Kiểm tra bơm (fixture)', 20);
  await render([inv]);
  review();
  await act(async () => mockWrite({ ...mockState, actionInFlight: { locked: 'ACCEPT' }, recoveryPending: true }));
  for (const label of ['Nhận việc Kiểm tra bơm (fixture)', 'Từ chối lời mời Kiểm tra bơm (fixture)']) {
    expect(buttons(label)[0].props.disabled).toBe(true);
    expect(buttons(label)[0].props.accessibilityState).toMatchObject({ disabled: true });
  }
  expect(text()).toMatch(/chưa xác định|chưa xác nhận/);
  expect(text()).toContain('tránh gửi trùng');
  expect(text()).not.toContain('Đã xác minh đơn vừa nhận');
  expect(mockRespond).not.toHaveBeenCalled();
});

it('retains the review metadata after server expiry and disables both decisions', async () => {
  await render([invitation('expiring', 'Kiểm tra bơm (fixture)', 1)]);
  review();
  await act(async () => { jest.advanceTimersByTime(90000); });
  expect(text()).toContain('Đã hết hạn');
  expect(text()).toContain('Khung giờ mong muốn');
  // No active action is mounted after the server deadline expires.
  expect(buttons('Nhận việc Kiểm tra bơm (fixture)')).toHaveLength(0);
  expect(buttons('Từ chối lời mời Kiểm tra bơm (fixture)')).toHaveLength(0);
  expect(mockRespond).not.toHaveBeenCalled();
});

it('shows missing preview and unknown deadline truthfully without inventing eligibility or metadata', async () => {
  const inv = invitation('unknown', 'Kiểm tra bơm (fixture)', 20);
  inv.booking = undefined;
  inv.expiresAt = null;
  await render([inv]);
  expect(text()).toContain('Chưa xác định');
  expect(text()).not.toContain('Đang chờ quyết định');
  expect(text()).not.toContain('Đã hết hạn');
  expect(text()).not.toContain('Xem & quyết định');
  expectNoPrivateOrPrototypeData();
});

it('shows load, empty and error with a real retry instead of sample invitations', async () => {
  mockState = { ...initialInboxState };
  await render();
  expect(text()).toContain('Đang tải…');
  expect(text()).not.toContain('Chưa có lời mời nào');
  await act(async () => mockWrite({ ...initialInboxState, loading: false, error: 'Không thể tải danh sách lời mời. Vui lòng thử lại.' }));
  expect(text()).toContain('Không thể tải danh sách lời mời');
  expect(text()).not.toContain('Chưa có lời mời nào');
  await act(async () => buttons('Thử tải lại danh sách lời mời')[0].props.onPress());
  expect(mockLoad).toHaveBeenCalledTimes(1);
  await act(async () => mockWrite({ ...initialInboxState, loading: false }));
  expect(text()).toContain('Chưa có lời mời nào');
  expect(text()).not.toContain('Khi khách hàng gửi lời mời, bạn sẽ thấy ở đây. Kéo xuống để làm mới.');
  expect(buttons('Làm mới danh sách lời mời')).toHaveLength(1);
  expectNoPrivateOrPrototypeData();
});

it('uses native touch/text floors and leaves content clear of the existing tab bar and safe area', async () => {
  await render([invitation('a11y', 'Kiểm tra bơm (fixture)', 20)]);
  review();
  for (const node of renderer.root.findAllByType(TouchableOpacity)) {
    expect(StyleSheet.flatten(node.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(node.props.accessibilityRole).toBe('button');
  }
  for (const node of renderer.root.findAllByType(Text)) {
    const fontSize = StyleSheet.flatten(node.props.style)?.fontSize;
    if (fontSize !== undefined) expect(fontSize).toBeGreaterThanOrEqual(12);
    expect(node.props.allowFontScaling).not.toBe(false);
  }
  expect(StyleSheet.flatten(renderer.root.findByType(FlatList).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(114);
});

it('keeps heading and banners in the scrollable list so large text cannot trap the review below fixed content', async () => {
  mockAvailability.isAvailable = false;
  mockState = { ...initialInboxState, loading: false, recoveryPending: true };
  await render([invitation('scroll', 'Kiểm tra bơm (fixture)', 20)]);
  const list = renderer.root.findByType(FlatList);
  expect(list.findAll(node => node.type === Text && node.props.children === 'Lời mời')).toHaveLength(1);
  expect(list.findAll(node => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Bật lại nhận đơn mới')).toHaveLength(1);
});
