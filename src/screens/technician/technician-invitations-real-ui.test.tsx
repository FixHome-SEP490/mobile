// Technician T-RUI3: real production Invitations presentation tests.
// The inbox controller, API transport and business guards are covered by
// TechnicianInvitationsScreen.test.tsx and invitation-view.test.ts; this file
// only asserts what the screen renders: hierarchy, countdown, badges,
// allowlisted preview fields (no private customer data), the review gate,
// touch/text floors and reduced-motion-safe feedback. No network, no device.
import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import type { InvitationItem } from '../../api/bookings.api';
import { isActionable, initialInboxState, type InboxState } from './invitation-inbox';
import {
  invitationClosedLabel,
  invitationCountdown,
  sortInvitationsForDisplay,
} from './invitation-view';
import { urgencyView } from './technician-status';

let mockReduceMotion = false;
let mockInboxState: InboxState = initialInboxState;
let capturedWrite: ((state: InboxState) => void) | undefined;
const mockSetPendingInvitations = jest.fn();
const mockNavigate = jest.fn();
const mockAvailabilityToggle = jest.fn();
const mockAvailability: { isAvailable: boolean | null; toggling: boolean; toggle: () => void } = {
  isAvailable: true,
  toggling: false,
  toggle: mockAvailabilityToggle,
};
const mockFocus = jest.fn(async () => {
  capturedWrite?.(mockInboxState);
});
const mockBlur = jest.fn();
const mockLoad = jest.fn(async () => {
  capturedWrite?.(mockInboxState);
});
const mockRespond = jest.fn(async () => undefined);

jest.mock('./invitation-inbox', () => {
  const actual = jest.requireActual('./invitation-inbox');
  return {
    ...actual,
    createInvitationInbox: (
      _api: unknown,
      _orderApi: unknown,
      write: (state: InboxState) => void,
    ) => {
      capturedWrite = write;
      return { focus: mockFocus, blur: mockBlur, load: mockLoad, respond: mockRespond };
    },
  };
});

jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

jest.mock('../../hooks/useTechnicianAvailability', () => ({
  useTechnicianAvailability: () => mockAvailability,
}));

jest.mock('../../store/badge.store', () => ({
  useBadgeStore: (selector: (state: unknown) => unknown) =>
    selector({ setPendingInvitations: mockSetPendingInvitations }),
}));

jest.mock('../../store/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'tech-1', role: 'technician' } };
  const hook = Object.assign(
    (selector?: (s: unknown) => unknown) => (typeof selector === 'function' ? selector(state) : state),
    { getState: () => state, subscribe: () => () => undefined },
  );
  return { useAuthStore: hook };
});

jest.mock('../../api/bookings.api', () => ({
  bookingsApi: { getMyInvitations: jest.fn(), respondInvitation: jest.fn() },
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: { getMyOrdersPage: jest.fn(), getOrder: jest.fn() },
}));

jest.mock('../../components/customer/CustomerSkeleton', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(NativeView, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [callback]);
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) =>
    ReactModule.createElement(NativeView, props, children);
  return {
    SafeAreaProvider: Passthrough,
    SafeAreaView: Passthrough,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Import after all mocks so the screen binds to the stubbed inbox.
const TechnicianInvitationsScreen =
  jest.requireActual('./TechnicianInvitationsScreen').default as React.ComponentType;

const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function liveInvitation(): InvitationItem {
  const now = Date.now();
  return {
    id: 'inv-live-1',
    bookingId: BOOKING_ID,
    priorityOrder: 1,
    status: 'PENDING',
    invitedAt: new Date(now - 5 * 60000).toISOString(),
    expiresAt: new Date(now + 9 * 60000 + 30000).toISOString(),
    booking: {
      id: BOOKING_ID,
      province: 'TP. Hồ Chí Minh',
      district: 'Quận 1',
      serviceName: 'Sửa điều hòa',
      quantity: 2,
      urgency: 'EMERGENCY',
      preferredStartAt: '2030-10-21T02:00:00.000Z',
      preferredEndAt: '2030-10-21T04:00:00.000Z',
    },
  };
}

function loadedState(invitation: InvitationItem): InboxState {
  return {
    ...initialInboxState,
    invitations: [invitation],
    loading: false,
    refreshing: false,
    error: null,
  };
}

function visibleText(renderer: ReturnType<typeof create>) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      if (typeof children === 'string') return children;
      if (Array.isArray(children)) return children.filter((c) => typeof c === 'string').join('');
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

function pressReview(renderer: ReturnType<typeof create>) {
  const review = renderer.root.findAll(
    (node) =>
      node.type === TouchableOpacity &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Xem và quyết định'),
  );
  expect(review).toHaveLength(1);
  act(() => {
    review[0].props.onPress();
  });
}

async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TechnicianInvitationsScreen />);
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedWrite = undefined;
  mockReduceMotion = false;
  mockAvailability.isAvailable = true;
  mockAvailability.toggling = false;
  mockInboxState = { ...initialInboxState, loading: true };
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TechnicianInvitationsScreen real-UI presentation (T-RUI3)', () => {
  it('shows the Vietnamese title and loading copy while fetching', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Lời mời');
    expect(text).not.toContain('Lời mời nhận việc');
    expect(text).not.toContain('Lời mời dành cho bạn');
    expect(text).not.toContain('Đọc phạm vi và khung giờ trước khi quyết định.');
    expect(text).toContain('Đang tải…');
    expect(text).not.toContain('Xem & quyết định');
    await act(async () => renderer.unmount());
  });

  it('renders only the allowlisted preview with urgency and countdown badges', async () => {
    const invitation = liveInvitation();
    mockInboxState = loadedState(invitation);
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Lời mời');
    expect(text).not.toContain('Lời mời nhận việc');
    expect(text).not.toContain('Lời mời dành cho bạn');
    expect(text).not.toContain('Đọc phạm vi và khung giờ trước khi quyết định.');
    expect(text).toContain('1 lời mời chờ xác nhận');
    expect(text).toContain('Sửa điều hòa');
    expect(text).toContain('SL 2');
    expect(text).toContain('Quận 1, TP. Hồ Chí Minh');
    expect(text).toContain('Khẩn cấp');
    expect(text).toMatch(/Còn \d+/);
    expect(text).toContain('Xem & quyết định');
    // No full address, phone number or private customer contact before accept.
    expect(text).not.toMatch(/\d{9,}/);
    expect(text).not.toMatch(/số nhà|đường |địa chỉ chi tiết|liên hệ|điện thoại/i);
    expect(text).not.toContain('Nhắn tin');
    await act(async () => renderer.unmount());
  });

  it('keeps Accept/Decline behind the review step and confirms decline', async () => {
    mockInboxState = loadedState(liveInvitation());
    const renderer = await renderScreen();
    expect(visibleText(renderer)).not.toContain('Nhận việc Sửa điều hòa');
    pressReview(renderer);
    const text = visibleText(renderer);
    expect(text).toContain('Trước khi nhận việc');
    expect(text).toContain('Địa chỉ chi tiết');
    const decline = renderer.root.findAll(
      (node) =>
        node.type === TouchableOpacity &&
        node.props.testID === 'invitation-decline',
    );
    expect(decline).toHaveLength(1);
    act(() => {
      decline[0].props.onPress();
    });
    // Inline confirmation is required; the first press never posts.
    const confirm = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.testID === 'invitation-decline-confirm',
    );
    expect(confirm).toHaveLength(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('sends ACCEPT through the controller with haptic feedback when motion is allowed', async () => {
    mockInboxState = loadedState(liveInvitation());
    const renderer = await renderScreen();
    pressReview(renderer);
    const accept = renderer.root.findAll(
      (node) =>
        node.type === TouchableOpacity &&
        node.props.accessibilityLabel === 'Nhận việc Sửa điều hòa',
    );
    expect(accept).toHaveLength(1);
    await act(async () => {
      accept[0].props.onPress();
    });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(mockRespond).toHaveBeenCalledWith('inv-live-1', 'ACCEPT');
    await act(async () => renderer.unmount());
  });

  it('skips haptic feedback when Reduce Motion is on but still responds', async () => {
    mockReduceMotion = true;
    mockInboxState = loadedState(liveInvitation());
    const renderer = await renderScreen();
    pressReview(renderer);
    const accept = renderer.root.findAll(
      (node) =>
        node.type === TouchableOpacity &&
        node.props.accessibilityLabel === 'Nhận việc Sửa điều hòa',
    );
    await act(async () => {
      accept[0].props.onPress();
    });
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(mockRespond).toHaveBeenCalledWith('inv-live-1', 'ACCEPT');
    await act(async () => renderer.unmount());
  });

  it('surfaces the availability gate, the verified order and the reconcile lock', async () => {
    mockAvailability.isAvailable = false;
    mockInboxState = {
      ...loadedState(liveInvitation()),
      acceptedOrderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      recoveryPending: true,
    };
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Bạn đang tạm dừng nhận đơn mới.');
    expect(text).toContain('Bật lại');
    expect(text).toContain('Đã xác minh đơn vừa nhận');
    expect(text).toContain('Xem đơn vừa nhận');
    expect(text).toMatch(/chưa xác định|Không gửi lại/);
    const toggle = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Bật lại nhận đơn mới',
    );
    expect(toggle).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it('keeps every touch target at 44pt or more and every text size at 12 or more', async () => {
    mockInboxState = loadedState(liveInvitation());
    const renderer = await renderScreen();
    pressReview(renderer);
    const touchables = renderer.root.findAllByType(TouchableOpacity);
    expect(touchables.length).toBeGreaterThan(0);
    for (const node of touchables) {
      const minHeight = Math.max(
        0,
        ...stylesOf(node.props.style).map((style) =>
          typeof style.minHeight === 'number' ? style.minHeight : typeof style.height === 'number' ? style.height : 0,
        ),
      );
      expect(minHeight).toBeGreaterThanOrEqual(44);
    }
    const texts = renderer.root.findAllByType(Text);
    for (const node of texts) {
      for (const style of stylesOf(node.props.style)) {
        if (typeof style.fontSize === 'number') {
          expect(style.fontSize).toBeGreaterThanOrEqual(12);
        }
      }
    }
    await act(async () => renderer.unmount());
  });

  it('keeps the real inbox helpers truthful about ordering, countdown and labels', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T07:00:00Z'));
    try {
    const now = Date.parse('2026-09-30T07:00:00Z');
    const at = (minutes: number) => new Date(now + minutes * 60000).toISOString();
    const inv = (id: string, expiresAt: string | null, priorityOrder = 1) =>
      ({ id, bookingId: `b-${id}`, priorityOrder, status: 'PENDING', invitedAt: at(-5), expiresAt }) as InvitationItem;
    const soon = inv('soon', at(5));
    expect(isActionable(soon)).toBe(true);
    expect(isActionable({ ...soon, status: 'ACCEPTED' })).toBe(false);
    expect(isActionable({ ...soon, expiresAt: null })).toBe(false);
    expect(sortInvitationsForDisplay([inv('late', at(50)), soon]).map((i) => i.id)).toEqual([
      'soon',
      'late',
    ]);
    expect(invitationCountdown(at(9), now)).toEqual({ label: 'Còn 9 phút', urgent: true });
    expect(invitationCountdown(at(60), now)).toEqual({ label: 'Còn 1 giờ', urgent: false });
    expect(invitationCountdown(null, now)).toBeNull();
    expect(invitationClosedLabel('ACCEPTED')).toBe('Đã nhận việc');
    expect(invitationClosedLabel('DECLINED')).toBe('Đã từ chối');
    expect(invitationClosedLabel('EXPIRED')).toBe('Đã hết hạn');
    expect(urgencyView('EMERGENCY').label).toBe('Khẩn cấp');
    expect(urgencyView('LOW').label).toBe('Thấp');
    } finally {
      jest.useRealTimers();
    }
  });
});
