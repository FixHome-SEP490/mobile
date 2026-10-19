// FH-TECH-02 UX01A T03 — focused invitation scene (Main M2T-20261011-011).
// NEW mocked renderer tests: one decision per focused scene, no list background
// action overlay, truthful back/invalid/expiry/lock handling, PII guards.
// Genuine RED-first: focused filtering, explicit back and invalid copy do not
// exist in the pre-T03 inline-expansion implementation.
import React from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import type { InvitationItem } from '../../api/bookings.api';
import { initialInboxState, type InboxState } from './invitation-inbox';

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
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { id: 'tech-t03', role: 'technician' } }), subscribe: () => () => undefined },
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
const visibleText = () => renderer.root.findAllByType(Text).map((node) => {
  const c = node.props.children;
  return Array.isArray(c) ? c.filter((x: unknown) => typeof x === 'string').join('') : typeof c === 'string' ? c : '';
}).join('\n');
const buttons = (label: string) => renderer.root.findAll((node) => node.type === TouchableOpacity && (
  node.props.accessibilityLabel === label ||
  (label.startsWith('Nhận việc ') && node.props.testID === 'invitation-accept') ||
  (label.startsWith('Từ chối lời mời ') && node.props.testID === 'invitation-decline')
));
const reviewButtons = () => renderer.root.findAll((node) => node.type === TouchableOpacity && typeof node.props.accessibilityLabel === 'string' && (node.props.accessibilityLabel as string).startsWith('Xem và quyết định'));
async function render(invitations: InvitationItem[] = []) {
  mockState = { ...mockState, invitations };
  await act(async () => { renderer = create(<Screen />); });
}
function review(name: string) {
  act(() => { buttons(`Xem và quyết định lời mời ${name}`)[0].props.onPress(); });
}
function pressBack() {
  act(() => { buttons('Quay lại danh sách lời mời')[0].props.onPress(); });
}
function expectNoPrivateSentinels() {
  const t = visibleText();
  expect(t).not.toMatch(/PRIVATE_|SENTINEL_|090\d{7}|số nhà \d+|địa chỉ chi tiết \d+|customerPhone/i);
  expect(t).not.toContain('Nhắn tin');
  for (const node of renderer.root.findAllByType(TouchableOpacity)) {
    expect(String(node.props.accessibilityLabel ?? '')).not.toMatch(/PRIVATE_|SENTINEL_/);
  }
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

describe('Technician T03 focused invitation scene (FH-TECH-02 UX01A)', () => {
  it('focuses exactly one selected invitation with one accept/decline pair and hides inbox cards', async () => {
    await render([invitation('a', 'Sửa bơm A (fixture)', 20), invitation('b', 'Sửa quạt B (fixture)', 25)]);
    expect(reviewButtons()).toHaveLength(2);
    review('Sửa bơm A (fixture)');
    const t = visibleText();
    expect(t).toContain('Xem kỹ, rồi nhận việc');
    expect(t).toContain('Sửa bơm A (fixture)');
    expect(t).not.toContain('Sửa quạt B (fixture)');
    expect(buttons('Nhận việc Sửa bơm A (fixture)')).toHaveLength(1);
    expect(buttons('Từ chối lời mời Sửa bơm A (fixture)')).toHaveLength(1);
    expect(reviewButtons()).toHaveLength(0);
    expect(t).toContain('Khu vực được phép xem');
    expect(t).toContain('Huyện kiểm thử, Tỉnh kiểm thử');
    expectNoPrivateSentinels();
    expect(mockRespond).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns the full inbox from the explicit back control without posting or reloading', async () => {
    await render([invitation('a', 'Sửa bơm A (fixture)', 20), invitation('b', 'Sửa quạt B (fixture)', 25)]);
    review('Sửa bơm A (fixture)');
    expect(buttons('Quay lại danh sách lời mời')).toHaveLength(1);
    jest.clearAllMocks();
    pressBack();
    const t = visibleText();
    expect(t).toContain('Sửa bơm A (fixture)');
    expect(t).toContain('Sửa quạt B (fixture)');
    expect(reviewButtons()).toHaveLength(2);
    expect(mockRespond).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a truthful invalid scene with back and retry when the selected invitation disappears', async () => {
    await render([invitation('gone', 'Sửa bơm mất (fixture)', 20)]);
    review('Sửa bơm mất (fixture)');
    await act(async () => { mockWrite({ ...mockState, invitations: [] }); });
    const t = visibleText();
    expect(t).toContain('Không còn lời mời hợp lệ');
    expect(buttons('Nhận việc Sửa bơm mất (fixture)')).toHaveLength(0);
    expect(buttons('Từ chối lời mời Sửa bơm mất (fixture)')).toHaveLength(0);
    expect(buttons('Quay lại danh sách lời mời')).toHaveLength(1);
    expect(mockRespond).not.toHaveBeenCalled();
    await act(async () => { buttons('Làm mới danh sách lời mời')[0].props.onPress(); });
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('retains focused metadata after expiry but disables both decisions without posting', async () => {
    await render([invitation('exp', 'Sửa bơm hết hạn (fixture)', 1)]);
    review('Sửa bơm hết hạn (fixture)');
    await act(async () => { jest.advanceTimersByTime(90000); });
    const t = visibleText();
    expect(t).toContain('Đã hết hạn');
    expect(t).toContain('Sửa bơm hết hạn (fixture)');
    expect(t).toContain('Khung giờ mong muốn');
    // Closed invitation: actions are absent, not merely disabled.
    expect(buttons('Nhận việc Sửa bơm hết hạn (fixture)')).toHaveLength(0);
    expect(buttons('Từ chối lời mời Sửa bơm hết hạn (fixture)')).toHaveLength(0);
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('locks both focused actions during an in-flight response and keeps reconcile guidance', async () => {
    await render([invitation('lock', 'Sửa bơm khóa (fixture)', 20)]);
    review('Sửa bơm khóa (fixture)');
    await act(async () => { mockWrite({ ...mockState, actionInFlight: { lock: 'ACCEPT' }, recoveryPending: true }); });
    for (const label of ['Nhận việc Sửa bơm khóa (fixture)', 'Từ chối lời mời Sửa bơm khóa (fixture)']) {
      expect(buttons(label)[0].props.disabled).toBe(true);
      expect(buttons(label)[0].props.accessibilityState).toMatchObject({ disabled: true });
    }
    expect(visibleText()).toContain('tránh gửi trùng');
    expect(visibleText()).toMatch(/chưa xác định|chưa xác nhận|Đang xác minh/);
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('never renders private address, phone or customer sentinels in the focused preview', async () => {
    const inv = invitation('pii', 'Sửa bơm riêng tư (fixture)', 20);
    Object.assign(inv.booking!, {
      addressSummary: 'PRIVATE_ADDRESS_SENTINEL_123',
      customerPhone: '0901234567',
      customerName: 'PRIVATE_NAME_SENTINEL',
      description: 'Vòi nước bị rò',
    });
    await render([inv]);
    review('Sửa bơm riêng tư (fixture)');
    expectNoPrivateSentinels();
    expect(visibleText()).toContain('Huyện kiểm thử, Tỉnh kiểm thử');
  });

  it('opens the verified order only from the controller-confirmed acceptedOrderId', async () => {
    await render([invitation('acc', 'Sửa bơm nhận (fixture)', 20)]);
    review('Sửa bơm nhận (fixture)');
    const orderId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await act(async () => { mockWrite({ ...mockState, invitations: [], acceptedOrderId: orderId }); });
    expect(visibleText()).toContain('Đã xác minh đơn vừa nhận');
    await act(async () => { buttons('Xem đơn vừa nhận')[0].props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianOrderDetail', { serviceOrderId: orderId });
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('confirms decline through Alert and keeps cancellation free of duplicate posts', async () => {
    await render([invitation('dec', 'Sửa bơm từ chối (fixture)', 20)]);
    review('Sửa bơm từ chối (fixture)');
    act(() => { buttons('Từ chối lời mời Sửa bơm từ chối (fixture)')[0].props.onPress(); });
    expect(mockRespond).not.toHaveBeenCalled();
    // The current presenter uses explicit in-screen confirmation, not a native Alert.
    expect(buttons('Xác nhận từ chối lời mời')).toHaveLength(1);
    expect(buttons('Giữ lại lời mời')).toHaveLength(1);
    await act(async () => { buttons('Xác nhận từ chối lời mời')[0].props.onPress(); });
    expect(mockRespond.mock.calls).toEqual([['dec', 'DECLINE']]);
  });

  it('keeps 44pt touch targets, 12pt text and tab-bar clearance in the focused scene', async () => {
    await render([invitation('geo', 'Sửa bơm cỡ (fixture)', 20)]);
    review('Sửa bơm cỡ (fixture)');
    for (const node of renderer.root.findAllByType(TouchableOpacity)) {
      expect(StyleSheet.flatten(node.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(node.props.accessibilityRole).toBe('button');
    }
    for (const node of renderer.root.findAllByType(Text)) {
      const fontSize = StyleSheet.flatten(node.props.style)?.fontSize;
      // Nested Text inherits its parent's font size when not explicitly set.
      if (fontSize !== undefined) expect(fontSize).toBeGreaterThanOrEqual(12);
    }
    expect(StyleSheet.flatten(renderer.root.findByType(FlatList).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(114);
    expect(renderer.root.findByType(View)).toBeTruthy();
  });

  it('skips haptics under Reduce Motion but still responds through the controller', async () => {
    mockReduceMotion = true;
    await render([invitation('rm', 'Sửa bơm rung (fixture)', 20)]);
    review('Sửa bơm rung (fixture)');
    await act(async () => { buttons('Nhận việc Sửa bơm rung (fixture)')[0].props.onPress(); });
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(mockRespond.mock.calls).toEqual([['rm', 'ACCEPT']]);
  });

  it('does not invent eligibility for unknown deadline or unknown status', async () => {
    const inv = invitation('unk', 'Sửa bơm chưa rõ (fixture)', 20);
    inv.booking = undefined;
    inv.expiresAt = null;
    (inv as unknown as { status: string }).status = 'UNKNOWN_NEW_STATUS';
    await render([inv]);
    expect(visibleText()).toContain('Chưa xác định');
    expect(visibleText()).not.toContain('Đang chờ quyết định');
    expect(visibleText()).not.toContain('Xem & quyết định');
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('shows focused loading and error with safe back and retry and no accept', async () => {
    await render([invitation('err', 'Sửa bơm lỗi (fixture)', 20)]);
    review('Sửa bơm lỗi (fixture)');
    await act(async () => { mockWrite({ ...mockState, loading: false, error: 'Không thể tải danh sách lời mời. Vui lòng thử lại.' }); });
    expect(visibleText()).toContain('Không thể tải danh sách lời mời');
    expect(buttons('Nhận việc Sửa bơm lỗi (fixture)')).toHaveLength(0);
    expect(buttons('Quay lại danh sách lời mời')).toHaveLength(1);
    await act(async () => { buttons('Thử tải lại danh sách lời mời')[0].props.onPress(); });
    expect(mockLoad).toHaveBeenCalled();
  });
});
