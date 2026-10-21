import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import { serviceOrderStatusView } from './technician-status';
import { resolveJobsView, techOrderDetailTarget } from './technician-order-detail';

const activeJob = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'SO-1',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Sua dieu hoa',
  status: 'ACCEPTED',
  customerName: 'Khach A',
  customerPhone: '0900000001',
  addressSummary: 'Quan 1',
  scheduledAt: '2030-10-21T10:00:00Z',
  grandTotal: 1500000,
};

let mockedJobsState: Record<string, unknown> = {
  jobs: [],
  jobsTotal: 0,
  jobsPage: 0,
  loading: true,
  refreshing: false,
  loadingMoreJobs: false,
  error: null,
  actionLoading: null,
  blockedOrderIds: [],
};

const mockLoader = {
  focus: jest.fn(async () => undefined),
  blur: jest.fn(),
  refresh: jest.fn(async () => undefined),
  loadMoreJobs: jest.fn(async () => undefined),
  captureFocus: jest.fn(() => () => true),
  handleEnRoute: jest.fn(),
};

jest.mock('./technician-jobs-loader', () => ({
  createJobsLoader: () => mockLoader,
  getCachedJobsState: () => mockedJobsState,
  technicianJobsUserId: () => 'tech-1',
  JOBS_PAGE_SIZE: 20,
}));

jest.mock('./technician-check-in', () => ({
  createCheckInController: () => ({ checkIn: jest.fn(), reconcile: jest.fn() }),
  checkInAttemptState: () => 'clear',
}));

jest.mock('./technician-chat-shortcut', () => ({
  findChatForBooking: jest.fn(async () => null),
}));

jest.mock('../../components/customer/CustomerSkeleton', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/ContactActions', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-location', () => ({
  hasServicesEnabledAsync: jest.fn(async () => true),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Highest: 1 },
}));

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(NativeView, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), isFocused: () => true, addListener: () => () => undefined }),
  useFocusEffect: () => undefined,
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

jest.mock('../../store/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'tech-1', role: 'technician' } };
  const hook = Object.assign(
    (selector?: (s: unknown) => unknown) => (typeof selector === 'function' ? selector(state) : state),
    { getState: () => state, subscribe: () => () => undefined },
  );
  return { useAuthStore: hook };
});

jest.mock('../../api/orders.api', () => ({
  isHistoricalOrder: (row: { historical?: boolean } | null) => row?.historical === true,
  ordersApi: {
    getMyOrders: jest.fn(),
    getMyOrdersPage: jest.fn(),
    getTechnicianJobs: jest.fn(),
    getTechnicianJobsPage: jest.fn(),
    getTechnicianOrder: jest.fn(),
    enRoute: jest.fn(),
    checkIn: jest.fn(),
    getOrder: jest.fn(),
    overrunReleaseStatus: jest.fn(async () => ({ eligible: true, block: null, currentOrderCode: 'SO-CUR', windowMinutes: 180 })),
    releaseForOverrun: jest.fn(async () => ({})),
  },
}));

jest.mock('../../api/messaging.api', () => ({
  messagingApi: { listConversations: jest.fn(async () => []) },
}));

jest.mock('../../utils/external-links', () => ({
  mapsUrl: () => null,
  telUrl: () => null,
  openExternal: jest.fn(),
}));

// Import after all mocks so the screen binds to the stubbed loader.
const TechnicianJobsScreen =
  jest.requireActual('./TechnicianJobsScreen').default as React.ComponentType;

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

function loadedState() {
  return {
    jobs: [activeJob],
    jobsTotal: 1,
    jobsPage: 1,
    loading: false,
    refreshing: false,
    loadingMoreJobs: false,
    error: null,
    actionLoading: null,
    blockedOrderIds: [],
  };
}

describe('TechnicianJobsScreen real-UI presentation (T-RUI2B)', () => {
  it('shows the Vietnamese title, filter group and loading copy while fetching', async () => {
    mockedJobsState = {
      jobs: [], jobsTotal: 0, jobsPage: 0, loading: true, refreshing: false,
      loadingMoreJobs: false, error: null, actionLoading: null, blockedOrderIds: [],
    };
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });
    expect(visibleText(renderer)).toContain('Công việc');
    expect(visibleText(renderer)).toContain('Đang tải…');
    expect(
      renderer.root.findAll((n) => n.props?.accessibilityLabel === 'Bộ lọc công việc').length,
    ).toBeGreaterThan(0);
    await act(async () => renderer.unmount());
  });

  it('renders the real assigned job with status badge, chat shortcut and truthful coverage', async () => {
    mockedJobsState = loadedState();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });
    const text = visibleText(renderer);
    expect(text).toContain('Công việc');
    expect(text).not.toContain('Danh sách công việc');
    expect(text).toContain('Đã nhận đơn');
    expect(text).toContain('SO-1');
    expect(text).toContain('Bắt đầu di chuyển');
    expect(text).toContain('Nhắn tin với khách');
    expect(text).toContain('Đang hiển thị 1/1 việc');
    expect(text).not.toMatch(/5\.0|★|km|ETA|đã thanh toán|đã xác minh/i);
    await act(async () => renderer.unmount());
  });

  it('reserves a non-shrinking filter row above the independently scrolling job list', async () => {
    mockedJobsState = loadedState();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });

    const scrollViews = renderer.root.findAllByType(ScrollView);
    const filters = scrollViews.find((node) => node.props.horizontal);
    const jobs = scrollViews.find((node) => !node.props.horizontal && node.props.refreshControl);
    expect(filters).toBeDefined();
    expect(jobs).toBeDefined();
    expect(filters!.parent).toBe(jobs!.parent);
    expect(StyleSheet.flatten(filters!.props.style)).toMatchObject({
      flexGrow: 0,
      flexShrink: 0,
      minHeight: 68,
    });
    expect(StyleSheet.flatten(jobs!.props.style)).toMatchObject({ flex: 1, minHeight: 0 });

    const chips = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityRole === 'radio',
    );
    expect(chips).toHaveLength(5);
    for (const chip of chips) {
      expect(StyleSheet.flatten(chip.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(visibleText(renderer)).not.toContain('Danh sách công việc');
    await act(async () => renderer.unmount());
  });

  it('shows honest retry copy on load failure instead of an empty-list claim', async () => {
    mockedJobsState = {
      jobs: [], jobsTotal: 0, jobsPage: 0, loading: false, refreshing: false,
      loadingMoreJobs: false, error: 'Không thể tải công việc. Vui lòng thử lại.',
      actionLoading: null, blockedOrderIds: [],
    };
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });
    expect(visibleText(renderer)).toContain('Không thể tải công việc');
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Thử tải lại danh sách công việc' }).length,
    ).toBeGreaterThanOrEqual(1);
    await act(async () => renderer.unmount());
  });

  it('keeps status labels, owner-locked detail targets and truthful tab filtering', () => {
    expect(serviceOrderStatusView('ACCEPTED').label).toBe('Đã nhận đơn');
    expect(serviceOrderStatusView('EN_ROUTE').label).toBe('Đang di chuyển');
    expect(serviceOrderStatusView('UNDER_REPAIR').label).toBe('Đang sửa chữa');
    expect(serviceOrderStatusView('COMPLETED').label).toBe('Hoàn thành');
    expect(serviceOrderStatusView('CANCELLED').label).toBe('Đã hủy');
    expect(techOrderDetailTarget({ id: activeJob.id })).toBe(activeJob.id);
    expect(techOrderDetailTarget({ id: activeJob.id, historical: true })).toBeNull();
    const view = resolveJobsView(
      { jobs: [{ ...activeJob, status: 'UNDER_REPAIR' }], jobsTotal: 40, loading: false, error: null } as never,
      'pending',
    );
    expect(view.filtered).toHaveLength(0);
    expect(view.showLoadMoreJobs).toBe(true);
    expect(view.emptyNote).toBe('more-pages');
  });

  it('exposes accessible headings and labelled primary actions', async () => {
    mockedJobsState = loadedState();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });
    expect(
      renderer.root.findAllByProps({ accessibilityRole: 'header' }).some((node) => node.props.children === 'Công việc của tôi'),
    ).toBe(true);
    expect(
      renderer.root.findAll(
        (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Bắt đầu di chuyển',
      ).length,
    ).toBe(1);
    expect(
      renderer.root.findAll(
        (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Nhắn tin với khách hàng',
      ).length,
    ).toBe(1);
    await act(async () => renderer.unmount());
  });

  it('lists releasable orders in the Không kịp tới tab and releases after confirmation', async () => {
    mockedJobsState = loadedState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { ordersApi } = jest.requireMock('../../api/orders.api') as { ordersApi: { releaseForOverrun: jest.Mock } };
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });
    const chip = renderer.root.find(
      (node) => node.type === TouchableOpacity && node.props.accessibilityRole === 'radio'
        && node.props.accessibilityLabel === 'Không kịp tới',
    );
    await act(async () => chip.props.onPress());
    expect(visibleText(renderer)).toContain('Bạn đang làm đơn #SO-CUR.');
    const release = renderer.root.find(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Không kịp tới đơn SO-1',
    );
    await act(async () => release.props.onPress());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(ordersApi.releaseForOverrun).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Nhả đơn')!.onPress!());
    expect(ordersApi.releaseForOverrun).toHaveBeenCalledWith(activeJob.id);
    expect(mockLoader.refresh).toHaveBeenCalledWith(true);
    alertSpy.mockRestore();
    await act(async () => renderer.unmount());
  });

  it('shows the explained empty state when no order may be released', async () => {
    mockedJobsState = loadedState();
    const { ordersApi } = jest.requireMock('../../api/orders.api') as { ordersApi: { overrunReleaseStatus: jest.Mock } };
    ordersApi.overrunReleaseStatus.mockResolvedValueOnce({ eligible: false, block: 'NO_CURRENT_JOB', currentOrderCode: null, windowMinutes: 180 });
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TechnicianJobsScreen />);
    });
    const chip = renderer.root.find(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Không kịp tới',
    );
    await act(async () => chip.props.onPress());
    expect(visibleText(renderer)).toContain('Chưa có đơn nào cần nhả');
    expect(visibleText(renderer)).toContain('không bị trừ điểm uy tín');
    await act(async () => renderer.unmount());
  });
});
