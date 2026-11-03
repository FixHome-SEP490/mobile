// A visit of several devices: each device is folded in the invitation detail and opens on its own.
import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { InvitationItem } from '../../api/bookings.api';
import { initialInboxState, type InboxState } from './invitation-inbox';

let mockState: InboxState;
let mockWrite: (state: InboxState) => void;
const mockLoad = jest.fn(async () => mockWrite(mockState));
const mockFocus = jest.fn(async () => mockWrite(mockState));
const mockAvailability = { isAvailable: true as boolean | null, toggling: false, toggle: jest.fn() };

jest.mock('./invitation-inbox', () => ({
  ...jest.requireActual('./invitation-inbox'),
  createInvitationInbox: (_api: unknown, _orders: unknown, write: (state: InboxState) => void) => {
    mockWrite = write;
    return { focus: mockFocus, blur: jest.fn(), load: mockLoad, respond: jest.fn(async () => undefined) };
  },
}));
jest.mock('../../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('../../hooks/useTechnicianAvailability', () => ({ useTechnicianAvailability: () => mockAvailability }));
jest.mock('../../store/badge.store', () => ({ useBadgeStore: (select: (state: unknown) => unknown) => select({ setPendingInvitations: jest.fn() }) }));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { id: 'tech-1', role: 'technician' } }), subscribe: () => () => undefined },
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
  return { useNavigation: () => ({ navigate: jest.fn() }), useFocusEffect: (callback: () => void | (() => void)) => R.useEffect(callback, [callback]) };
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
let renderer: ReturnType<typeof create>;

const preview = (id: string, serviceName: string, description: string) => ({
  id, serviceName, description, province: 'Tỉnh kiểm thử', district: 'Huyện kiểm thử', quantity: 1, urgency: 'MEDIUM',
  preferredStartAt: '2031-02-04T01:00:00Z', preferredEndAt: '2031-02-04T04:00:00Z',
});
const visit = (): InvitationItem => ({
  id: 'inv-visit', bookingId: 'b-lead', status: 'PENDING', priorityOrder: 1, invitedAt: '2031-02-03T01:00:00Z',
  expiresAt: new Date(Date.now() + 20 * 60000).toISOString(),
  booking: preview('b-lead', 'Vệ sinh điều hòa', 'Mô tả của máy một'),
  visitDevices: [
    { sequence: 1, deviceLabel: null, booking: preview('b1', 'Vệ sinh điều hòa', 'Mô tả của máy một') },
    { sequence: 2, deviceLabel: null, booking: preview('b2', 'Sửa máy giặt', 'Mô tả của máy hai') },
  ],
});
const texts = () => renderer.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((x: unknown) => typeof x === 'string').join('')).join('\n');
const byTestId = (id: string) => renderer.root.findAll((n) => n.props.testID === id);
const pressTestId = (id: string) => act(() => { renderer.root.findAll((n) => n.type === TouchableOpacity && n.props.testID === id)[0].props.onPress(); });

beforeEach(async () => {
  jest.useFakeTimers().setSystemTime(new Date('2031-02-03T02:00:00Z'));
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockState = { ...initialInboxState, loading: false, invitations: [visit()] };
  await act(async () => { renderer = create(<Screen />); });
  act(() => {
    renderer.root.findAll((n) => n.type === TouchableOpacity && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Xem và quyết định'))[0].props.onPress();
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('lists every device of the visit folded: the names show, the details do not', () => {
  expect(texts()).toContain('Máy 1: Vệ sinh điều hòa');
  expect(texts()).toContain('Máy 2: Sửa máy giặt');
  expect(texts()).not.toContain('Mô tả của máy một');
  expect(texts()).not.toContain('Mô tả của máy hai');
  expect(byTestId('invitation-device-body-1')).toHaveLength(0);
  expect(byTestId('invitation-device-body-2')).toHaveLength(0);
});

it('opens one device on tap and leaves the other folded, and folds it again on a second tap', () => {
  pressTestId('invitation-device-toggle-2');
  expect(texts()).toContain('Mô tả của máy hai');
  expect(texts()).not.toContain('Mô tả của máy một');
  const toggle = renderer.root.findAll((n) => n.type === TouchableOpacity && n.props.testID === 'invitation-device-toggle-2')[0];
  expect(toggle.props.accessibilityState).toEqual({ expanded: true });
  pressTestId('invitation-device-toggle-2');
  expect(texts()).not.toContain('Mô tả của máy hai');
});

it('each toggle is a button with the device name, announcing whether it is open', () => {
  const toggle = renderer.root.findAll((n) => n.type === TouchableOpacity && n.props.testID === 'invitation-device-toggle-1')[0];
  expect(toggle.props.accessibilityRole).toBe('button');
  expect(toggle.props.accessibilityLabel).toBe('Máy 1: Vệ sinh điều hòa');
  expect(toggle.props.accessibilityState).toEqual({ expanded: false });
});

it('keeps the visit-wide privacy note and the accept and decline buttons whatever is open', () => {
  expect(texts()).toContain('Địa chỉ cụ thể, số điện thoại và ghi chú riêng của khách hiện sau khi bạn nhận đơn.');
  expect(byTestId('invitation-accept').length).toBeGreaterThan(0);
});
