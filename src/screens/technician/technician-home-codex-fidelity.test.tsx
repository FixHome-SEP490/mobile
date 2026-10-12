// T-NATIVE-01A Codex Technician Home native visual fidelity (isolated mocked render).
// Layout-only: Codex hierarchy (shift heading, white availability, navy hero,
// shortcuts, agenda) with real hooks/data. No real API, no demo fixtures.
import React from 'react';
import { AccessibilityInfo, Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';

let mockJobs: ServiceOrderItem[] | Error = [];
let mockJobsGate: { promise: Promise<void>; resolve: () => void } | null = null;
let mockOnboarding: unknown = null;
let mockInvitationCount = 0;
let mockChatUnread = 0;
let mockNotificationUnread = 0;
let mockAvailability: { isAvailable: boolean | null; toggling: boolean; toggle: () => void } = {
  isAvailable: true,
  toggling: false,
  toggle: jest.fn(),
};
const mockNavigate = jest.fn();

jest.mock('../../store', () => {
  const state = {
    user: { id: 'tech-1', fullName: 'An Test', role: 'technician', avatarUrl: undefined },
  };
  const hook = Object.assign(
    (selector?: (s: unknown) => unknown) => (typeof selector === 'function' ? selector(state) : state),
    { getState: () => state, subscribe: () => () => undefined },
  );
  return { useAuthStore: hook };
});

jest.mock('../../store/badge.store', () => ({
  useBadgeStore: (selector: (s: { unreadNotifications: number }) => unknown) =>
    selector({ unreadNotifications: mockNotificationUnread }),
}));

jest.mock('../../hooks/useChatUnreadCount', () => ({
  useChatUnreadCount: () => mockChatUnread,
}));

jest.mock('../../hooks/useInvitationCount', () => ({
  useInvitationCount: () => mockInvitationCount,
}));

jest.mock('../../hooks/useTechnicianAvailability', () => ({
  useTechnicianAvailability: () => mockAvailability,
}));

jest.mock('../../hooks/useScrollHideTabBar', () => ({
  useScrollHideTabBar: () => undefined,
}));

jest.mock('../../api/orders.api', () => ({
  isHistoricalOrder: (row: { historical?: boolean } | null) => row?.historical === true,
  ordersApi: {
    getTechnicianJobs: jest.fn(async () => {
      if (mockJobs instanceof Error) throw mockJobs;
      if (mockJobsGate) await mockJobsGate.promise;
      return mockJobs;
    }),
  },
}));

jest.mock('../../api/technician-onboarding.api', () => ({
  technicianOnboardingApi: {
    getStatus: jest.fn(async () => {
      if (mockOnboarding instanceof Error) throw mockOnboarding;
      return mockOnboarding;
    }),
  },
}));

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

jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));

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

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(NativeView, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('../../components/customer/CustomerSkeleton', () => ({
  __esModule: true,
  default: () => null,
}));

// Root-stack navigation for ChatList/TechnicianNotifications/TechnicianOnboarding/
// TechnicianOrderDetail lives on a separate hook call; reuse the same mock target.
jest.mock('@react-navigation/native-stack', () => ({}));

// Import after all mocks so the screen binds to stubs.
const TechnicianHomeScreen =
  jest.requireActual('./TechnicianHomeScreen').default as React.ComponentType;

function visibleText(renderer: ReturnType<typeof create>): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      if (typeof children === 'string') return children;
      if (typeof children === 'number') return String(children);
      if (Array.isArray(children))
        return children
          .filter((c) => typeof c === 'string' || typeof c === 'number')
          .join('');
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

async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TechnicianHomeScreen />);
  });
  // Flush focus-effect GETs (onboarding + jobs) bound in useEffect/useFocusEffect.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
  return renderer;
}

const job = (over: Partial<ServiceOrderItem> = {}): ServiceOrderItem =>
  ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    code: 'SO-REAL-1',
    bookingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    serviceName: 'Sửa điều hòa',
    status: 'ACCEPTED',
    customerName: 'Khach That',
    customerPhone: '0900000001',
    addressSummary: 'Phường Bến Nghé, Quận 1',
    scheduledAt: '2030-10-21T03:00:00.000Z',
    laborTotal: 300000,
    partsTotal: 0,
    grandTotal: 300000,
    paymentStatus: 'UNPAID',
    createdAt: '2030-10-20T00:00:00.000Z',
    ...over,
  }) as ServiceOrderItem;

const approvedOnboarding = () => {
  mockOnboarding = {
    onboardingStatus: 'approved',
    verificationStatus: 'verified',
    currentStep: 5,
    personalInfoCompleted: true,
    kycSubmitted: true,
    skillsSelected: true,
    addressSet: true,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockJobs = [];
  mockJobsGate = null;
  mockInvitationCount = 0;
  mockChatUnread = 0;
  mockNotificationUnread = 0;
  mockAvailability = { isAvailable: true, toggling: false, toggle: jest.fn() };
  approvedOnboarding();
  (AccessibilityInfo.isReduceMotionEnabled as unknown as jest.Mock | undefined) ??
    ((AccessibilityInfo as unknown as Record<string, unknown>).isReduceMotionEnabled = jest.fn(
      async () => false,
    ));
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
});

afterEach(async () => {
  await act(async () => {
    mockJobsGate?.resolve();
    await mockJobsGate?.promise;
  });
  mockJobsGate = null;
});

describe('TechnicianHome Codex fidelity T-NATIVE-01A (mocked layout)', () => {
  it('shows the Codex shift hierarchy with the real technician name and white availability control', async () => {
    mockJobs = [];
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Tổng quan');
    expect(text).toContain('Xin chào,');
    expect(text).toContain('An Test');
    expect(text).not.toContain('GÓC LÀM VIỆC');
    expect(text).not.toContain('Ngày làm việc');
    expect(text).not.toContain('Cùng chăm tốt từng nhà.');
    expect(text).not.toContain('Chào An Test');
    expect(text).not.toContain('Công việc mới sẽ xuất hiện ở đây.');
    expect(text).not.toContain('Việc đang làm & lịch sử');
    expect(text).not.toContain('Tuần này & chi tiết');
    expect(text).not.toContain('Minh mẫu');
    // White availability switch keeps the real hook state, not a demo patch event.
    expect(text).toMatch(/Sẵn sàng nhận việc|Đang nhận đơn mới/);
    expect(
      renderer.root.findAll(
        (n) => n.props?.accessibilityRole === 'switch' && n.props?.accessibilityLabel === 'Nhận đơn mới',
      ).length,
    ).toBeGreaterThanOrEqual(1);
    await act(async () => renderer.unmount());
  });

  it('renders the dark navy one-job hero with real service data and a large white CTA', async () => {
    mockJobs = [job({ status: 'ACCEPTED' })];
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('MỘT CÔNG VIỆC ĐANG MỞ');
    expect(text).toContain('Sửa điều hòa');
    expect(text).toContain('SO-REAL-1');
    expect(text).toMatch(/Tiếp tục công việc|Xử lý công việc/);
    // No demo fixture leaking into production copy.
    expect(text).not.toMatch(/SO-DEMO|Minh mẫu|Quận 3|Ngày mẫu|hư cấu|1 lời mời mẫu/i);
    await act(async () => renderer.unmount());
  });

  it('renders the navy invitation hero from the real count with Xem lời mời and no hard-coded 1', async () => {
    mockJobs = [];
    mockInvitationCount = 2;
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('2 lời mời nhận việc mới');
    expect(text).toContain('Xem lời mời');
    expect(text).not.toContain('1 lời mời mẫu');
    expect(text).not.toMatch(/Quận 3|Ngày mẫu|200.?000|hư cấu/i);
    await act(async () => renderer.unmount());
  });

  it('keeps real loading, empty, error and onboarding eligibility without demo wallet gates', async () => {
    // Loading first paint.
    let resolveJobs!: () => void;
    mockJobsGate = {
      promise: new Promise<void>((resolve) => { resolveJobs = resolve; }),
      resolve: () => resolveJobs(),
    };
    mockJobs = [];
    let loadingRenderer!: ReturnType<typeof create>;
    try {
      await act(async () => {
        loadingRenderer = create(<TechnicianHomeScreen />);
      });
      expect(ordersApi.getTechnicianJobs).toHaveBeenCalledTimes(1);
      const jobsPromise = (ordersApi.getTechnicianJobs as jest.Mock).mock.results[0].value as
        Promise<ServiceOrderItem[]>;
      const jobsSettled = jest.fn();
      void jobsPromise.then(jobsSettled);
      await act(async () => { await Promise.resolve(); });
      expect(jobsSettled).not.toHaveBeenCalled();
      const loadingText = visibleText(loadingRenderer);
      expect(loadingText).toContain('Đang tải…');
      expect(loadingText).not.toContain('Chưa có việc cần xử lý');
      expect(loadingText).not.toContain('Tuần này');
      expect(loadingText).not.toContain('0 ₫');
    } finally {
      await act(async () => {
        loadingRenderer?.unmount();
        mockJobsGate?.resolve();
        await mockJobsGate?.promise;
      });
      mockJobsGate = null;
    }

    // Empty keeps truthful copy, no invented agenda or earnings.
    mockJobs = [];
    mockInvitationCount = 0;
    const emptyRenderer = await renderScreen();
    const emptyText = visibleText(emptyRenderer);
    expect(emptyText).toContain('Chưa có việc cần xử lý');
    expect(emptyText).not.toMatch(/SO-DEMO|Quận 3|Ngày mẫu|Minh mẫu|200.?000/i);
    await act(async () => emptyRenderer.unmount());

    // Error must not simultaneously claim 'no jobs' or show unverified zero income.
    mockJobs = new Error('boom');
    const errorRenderer = await renderScreen();
    const errorText = visibleText(errorRenderer);
    expect(errorText).toContain('Không thể tải danh sách công việc');
    expect(errorText).not.toContain('Chưa có việc cần xử lý');
    expect(errorText).not.toContain('Tuần này');
    expect(errorText).not.toContain('0 ₫');
    expect(
      errorRenderer.root.findAllByProps({ accessibilityLabel: 'Thử tải lại danh sách công việc' }).length,
    ).toBeGreaterThanOrEqual(1);
    await act(async () => errorRenderer.unmount());
    mockJobs = [];

    // Submitted onboarding stays blocked via the real status resolver.
    mockOnboarding = {
      onboardingStatus: 'submitted',
      verificationStatus: 'pending',
      currentStep: 5,
      personalInfoCompleted: true,
      kycSubmitted: true,
      skillsSelected: true,
      addressSet: true,
    };
    const blockedRenderer = await renderScreen();
    expect(visibleText(blockedRenderer)).toContain('Hồ sơ đang chờ xét duyệt');
    // Demo wallet/KYC patch fiction must never appear.
    expect(visibleText(blockedRenderer)).not.toMatch(/200.?000|Demo:|kết quả hồ sơ đủ điều kiện/i);
    await act(async () => blockedRenderer.unmount());
  });

  it('keeps two shortcut cards with correct tab links, agenda and real weekly income', async () => {
    mockJobs = [];
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(
      renderer.root.findAll(
        (n) => n.type === TouchableOpacity && n.props.accessibilityLabel === 'Mở danh sách công việc',
      ).length,
    ).toBe(1);
    expect(
      renderer.root.findAll(
        (n) => n.type === TouchableOpacity && n.props.accessibilityLabel === 'Mở chi tiết thu nhập',
      ).length,
    ).toBe(1);
    expect(text).toContain('Hôm nay');
    expect(text).toContain('Thu nhập');
    expect(text).not.toMatch(/Ngày mẫu|Quận 3|SO-DEMO|Minh mẫu/i);
    await act(async () => renderer.unmount());
  });

  it('keeps 44pt touch targets and 12pt minimum text', async () => {
    mockJobs = [job({ status: 'ACCEPTED' })];
    mockInvitationCount = 2;
    const renderer = await renderScreen();
    const touchables = renderer.root.findAllByType(TouchableOpacity);
    expect(touchables.length).toBeGreaterThan(0);
    for (const node of touchables) {
      const minHeight = Math.max(
        0,
        ...stylesOf(node.props.style).map((style) =>
          typeof style.minHeight === 'number' ? style.minHeight : 0,
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
});
