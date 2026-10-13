// T-NATIVE-09A — Technician Jobs (Công việc của tôi) Codex → REAL React Native.
// Presentation-only fidelity over the real screen: Codex hierarchy (eyebrow
// "ĐANG LÀM & LỊCH SỬ", title "Công việc của tôi"), local code-only search
// ("Tìm theo mã"), the four production tabs, truthful loaded-only coverage and
// the sanitized-history privacy notice. Search filters loaded job codes only —
// never service/customer/address/phone, never a server query, never a demo
// fixture. No real API, no mutations, no navigation, no GPS/camera/OTP.
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ordersApi, type TechnicianOrderItem } from '../../api/orders.api';
import { findChatForBooking } from './technician-chat-shortcut';

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
  ImpactFeedbackStyle: { Medium: 'medium' },
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

const mockedOrdersApi = ordersApi as unknown as Record<string, jest.Mock>;
const mockedFindChatForBooking = findChatForBooking as unknown as jest.Mock;

const ACTIVE_ACCEPTED = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'SO-1001',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Sửa điều hòa',
  status: 'ACCEPTED',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0900000001',
  addressSummary: '123 Đường Lê Lợi, Quận 1',
  scheduledAt: '2030-10-21T03:00:00Z',
  grandTotal: 300000,
} as TechnicianOrderItem;

const ACTIVE_REPAIR = {
  id: '44444444-4444-4444-8444-444444444444',
  code: 'SO-1002',
  serviceName: 'Sửa máy giặt',
  status: 'UNDER_REPAIR',
  scheduledAt: '2030-10-22T03:00:00Z',
} as TechnicianOrderItem;

const EN_ROUTE_JOB = {
  id: '55555555-5555-4555-8555-555555555555',
  code: 'SO-1003',
  bookingId: '66666666-6666-4666-8666-666666666666',
  serviceName: 'Kiểm tra đường ống',
  status: 'EN_ROUTE',
  customerName: 'Trần Văn B',
  customerPhone: '0900000002',
  addressSummary: '456 Đường Nguyễn Huệ, Quận 3',
} as TechnicianOrderItem;

// Sanitized historical row with poisoned private fields that must NEVER render.
const HISTORICAL_POISONED = {
  id: '33333333-3333-4333-8333-333333333333',
  code: 'SO-0999',
  status: 'COMPLETED',
  createdAt: '2030-10-01T00:00:00Z',
  completedAt: '2030-10-02T12:00:00Z',
  historical: true,
  customerName: 'LEAK_CUSTOMER',
  customerPhone: 'LEAK_PHONE',
  addressSummary: 'LEAK_ADDRESS',
  serviceName: 'LEAK_SERVICE',
  bookingId: 'LEAK_BOOKING',
  grandTotal: 999000,
} as TechnicianOrderItem;

function jobsState(jobs: TechnicianOrderItem[], jobsTotal = jobs.length) {
  return {
    jobs,
    jobsTotal,
    jobsPage: 1,
    loading: false,
    refreshing: false,
    loadingMoreJobs: false,
    error: null,
    actionLoading: null,
    blockedOrderIds: [],
  };
}

function visibleText(renderer: ReturnType<typeof create>) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      if (typeof children === 'string') return children;
      if (typeof children === 'number') return String(children);
      if (Array.isArray(children)) {
        return children
          .filter((child) => typeof child === 'string' || typeof child === 'number')
          .join('');
      }
      return '';
    })
    .join('\n');
}

function buttonsByLabel(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.findAll(
    (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === label,
  );
}

function styleValues(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
  );
}

async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TechnicianJobsScreen />);
  });
  return renderer;
}

async function typeQuery(renderer: ReturnType<typeof create>, query: string) {
  const inputs = renderer.root.findAllByType(TextInput);
  expect(inputs.length).toBeGreaterThan(0);
  await act(async () => {
    inputs[0].props.onChangeText(query);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedJobsState = {
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
});

describe('TechnicianJobsScreen Codex fidelity (T-NATIVE-09A)', () => {
  it('shows the Codex Jobs hierarchy: eyebrow, title and the four production tabs', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('ĐANG LÀM & LỊCH SỬ');
    expect(text).toContain('Công việc của tôi');
    for (const label of ['Tất cả', 'Chờ thực hiện', 'Đang sửa chữa', 'Hoàn thành']) {
      expect(text).toContain(label);
    }
    // The production tab semantics are all/pending/in_progress/completed —
    // never a fictitious "Đã hủy" demo tab.
    expect(text).not.toContain('Đã hủy');
    await act(async () => renderer.unmount());
  });

  it('renders one accessible local code search field at 48pt with 14pt text', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED]);
    const renderer = await renderScreen();
    const inputs = renderer.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(1);
    const input = inputs[0];
    expect(input.props.placeholder).toBe('Tìm theo mã');
    expect(input.props.accessibilityLabel).toBe('Tìm theo mã');
    expect(input.props.allowFontScaling).not.toBe(false);
    const inputStyle = StyleSheet.flatten(input.props.style);
    expect(inputStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(inputStyle.fontSize).toBe(14);
    // The wrapping search surface keeps the same minimum touch height.
    const boxStyle = StyleSheet.flatten(input.parent?.props.style);
    expect(boxStyle.minHeight).toBeGreaterThanOrEqual(48);
    await act(async () => renderer.unmount());
  });

  it('filters loaded jobs by code only, trimmed and case-insensitive', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, ACTIVE_REPAIR, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    const initial = visibleText(renderer);
    expect(initial).toContain('#SO-1001');
    expect(initial).toContain('#SO-1002');
    expect(initial).toContain('#SO-0999');

    await typeQuery(renderer, '  so-1001 ');
    const filtered = visibleText(renderer);
    expect(filtered).toContain('#SO-1001');
    expect(filtered).not.toContain('#SO-1002');
    expect(filtered).not.toContain('#SO-0999');

    // Clearing the query restores the full loaded list.
    await typeQuery(renderer, '');
    const restored = visibleText(renderer);
    expect(restored).toContain('#SO-1001');
    expect(restored).toContain('#SO-1002');
    expect(restored).toContain('#SO-0999');
    await act(async () => renderer.unmount());
  });

  it.each([
    ['service name', 'Sửa điều hòa'],
    ['customer name', 'Nguyễn Văn A'],
    ['address', 'Đường Lê Lợi'],
    ['phone', '0900000001'],
    ['sanitized private field', 'LEAK_CUSTOMER'],
  ])('searching by %s never matches and honestly reports a loaded-only no-match', async (_label, query) => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    await typeQuery(renderer, query);
    const text = visibleText(renderer);
    expect(text).toContain('Không tìm thấy mã phù hợp trong phần đã tải');
    expect(text).not.toContain('#SO-1001');
    expect(text).not.toContain('#SO-0999');
    expect(text).not.toContain('LEAK_');
    await act(async () => renderer.unmount());
  });

  it('matches sanitized historical rows by code without leaking poisoned fields', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    await typeQuery(renderer, 'so-0999');
    const text = visibleText(renderer);
    expect(text).toContain('#SO-0999');
    expect(text).not.toContain('#SO-1001');
    expect(text).not.toMatch(/LEAK_|Khách:|Địa chỉ|Sửa điều hòa|0900000001/);
    await act(async () => renderer.unmount());
  });

  it('keeps the four production tabs with truthful loaded-only counts', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, EN_ROUTE_JOB, ACTIVE_REPAIR, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Tất cả 4');
    expect(text).toContain('Chờ thực hiện 2');
    expect(text).toContain('Đang sửa chữa 1');
    expect(text).toContain('Hoàn thành 1');
    // Search narrows the visible rows but never rewrites tab semantics/counts.
    await typeQuery(renderer, 'so-1001');
    const searched = visibleText(renderer);
    expect(searched).toContain('Tất cả 4');
    expect(searched).toContain('Chờ thực hiện 2');
    expect(searched).toContain('#SO-1001');
    expect(searched).not.toContain('#SO-1002');
    await act(async () => renderer.unmount());
  });

  it('keeps truthful coverage and load-more when search has no match on a partial page', async () => {
    const page = Array.from({ length: 20 }, (_, index) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString().padStart(12, '0')}`,
      code: `SO-20${index.toString().padStart(2, '0')}`,
      status: 'ACCEPTED',
    })) as TechnicianOrderItem[];
    mockedJobsState = jobsState(page, 40);
    const renderer = await renderScreen();
    await typeQuery(renderer, 'zzz');
    const text = visibleText(renderer);
    expect(text).toContain('Không tìm thấy mã phù hợp trong phần đã tải');
    expect(text).toContain('Đang hiển thị 20/40 việc');
    // Local no-match must not claim a global absence while pages remain.
    expect(text).not.toContain('Chưa có công việc nào');
    expect(buttonsByLabel(renderer, 'Tải thêm công việc')).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it('hides load-more on the last page while keeping the loaded-only no-match message', async () => {
    const page = Array.from({ length: 20 }, (_, index) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString().padStart(12, '0')}`,
      code: `SO-21${index.toString().padStart(2, '0')}`,
      status: 'ACCEPTED',
    })) as TechnicianOrderItem[];
    mockedJobsState = jobsState(page, 20);
    const renderer = await renderScreen();
    await typeQuery(renderer, 'zzz');
    const text = visibleText(renderer);
    expect(text).toContain('Không tìm thấy mã phù hợp trong phần đã tải');
    expect(text).toContain('Đang hiển thị 20/20 việc');
    expect(buttonsByLabel(renderer, 'Tải thêm công việc')).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('types locally without any jobs GET, mutation, refresh, chat lookup or navigation', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED]);
    const renderer = await renderScreen();
    await typeQuery(renderer, 'so-1001');
    await typeQuery(renderer, 'so');
    await typeQuery(renderer, '');
    for (const name of [
      'getTechnicianJobs',
      'getTechnicianJobsPage',
      'getOrder',
      'enRoute',
      'checkIn',
    ]) {
      expect(mockedOrdersApi[name]).not.toHaveBeenCalled();
    }
    expect(mockedFindChatForBooking).not.toHaveBeenCalled();
    expect(mockLoader.refresh).not.toHaveBeenCalled();
    expect(mockLoader.loadMoreJobs).not.toHaveBeenCalled();
    expect(mockLoader.handleEnRoute).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('keeps exactly one of each current primary action on the active row', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED]);
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Đã nhận đơn');
    expect(text).toContain('#SO-1001');
    expect(text).toContain('Sửa điều hòa');
    expect(text).toContain('Khách: Nguyễn Văn A');
    expect(text).toContain('Bắt đầu di chuyển');
    expect(text).toContain('Nhắn tin với khách');
    expect(buttonsByLabel(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    expect(buttonsByLabel(renderer, 'Nhắn tin với khách hàng')).toHaveLength(1);
    expect(buttonsByLabel(renderer, 'Xem chi tiết công việc SO-1001')).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it('keeps the EN_ROUTE check-in action exactly once', async () => {
    mockedJobsState = jobsState([EN_ROUTE_JOB]);
    const renderer = await renderScreen();
    expect(visibleText(renderer)).toContain('Check-in tại nhà khách');
    expect(buttonsByLabel(renderer, 'Check-in tại nhà khách')).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it('never exposes detail, chat or contact actions on sanitized historical rows', async () => {
    mockedJobsState = jobsState([HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('#SO-0999');
    expect(text).toContain('Đơn lưu trữ — chỉ xem tóm tắt.');
    expect(text).not.toMatch(/LEAK_/);
    const labels = renderer.root
      .findAll((node) => node.type === TouchableOpacity)
      .map((node) => node.props.accessibilityLabel);
    expect(labels).not.toContain('Xem chi tiết công việc SO-0999');
    expect(labels).not.toContain('Nhắn tin với khách hàng');
    expect(labels).not.toContain('Bắt đầu di chuyển');
    expect(labels).not.toContain('Check-in tại nhà khách');
    await act(async () => renderer.unmount());
  });

  it('keeps loading, honest error retry and denied states', async () => {
    mockedJobsState = { ...jobsState([]), loading: true };
    let renderer = await renderScreen();
    expect(visibleText(renderer)).toContain('Đang tải…');
    await act(async () => renderer.unmount());

    mockedJobsState = { ...jobsState([]), error: 'Không thể tải công việc. Vui lòng thử lại.' };
    renderer = await renderScreen();
    const errorText = visibleText(renderer);
    expect(errorText).toContain('Không thể tải công việc');
    expect(
      renderer.root.findAll((node) => node.props.accessibilityLabel === 'Thử tải lại danh sách công việc').length,
    ).toBeGreaterThanOrEqual(1);
    await act(async () => renderer.unmount());

    mockedJobsState = {
      ...jobsState([]),
      error: 'Không có quyền xem công việc. Vui lòng kiểm tra đăng nhập.',
    };
    renderer = await renderScreen();
    expect(visibleText(renderer)).toContain('Không có quyền xem công việc');
    await act(async () => renderer.unmount());
  });

  it('shows the sanitized-history privacy notice with accessible 12pt text', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    const notice = renderer.root.findAllByType(Text).find(
      (node) =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('Lịch sử thợ chỉ gồm mã, trạng thái và ngày'),
    );
    expect(notice).toBeDefined();
    const style = StyleSheet.flatten(notice?.props.style);
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
    expect(visibleText(renderer)).toContain(
      'Lịch sử thợ chỉ gồm mã, trạng thái và ngày; không hiển thị tên khách, địa chỉ, ảnh, tiền, chi tiết hoặc chat.',
    );
    await act(async () => renderer.unmount());
  });

  it('keeps 44pt touch targets and 12pt minimum text', async () => {
    mockedJobsState = jobsState([ACTIVE_ACCEPTED, EN_ROUTE_JOB, HISTORICAL_POISONED]);
    const renderer = await renderScreen();
    for (const node of renderer.root.findAllByType(TouchableOpacity)) {
      const minHeight = Math.max(
        0,
        ...styleValues(node.props.style).map((style) =>
          typeof style.minHeight === 'number' ? style.minHeight : 0,
        ),
      );
      expect(minHeight).toBeGreaterThanOrEqual(44);
    }
    for (const node of renderer.root.findAllByType(Text)) {
      for (const style of styleValues(node.props.style)) {
        if (typeof style.fontSize === 'number') {
          expect(style.fontSize).toBeGreaterThanOrEqual(12);
        }
      }
    }
    await act(async () => renderer.unmount());
  });
});
