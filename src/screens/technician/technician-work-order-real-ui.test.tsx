import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import { serviceOrderStatusView } from './technician-status';
import { selectTechnicianWorkOrderHierarchy } from './technician-work-order-hierarchy';
import { techOrderDetailTarget } from './technician-order-detail';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const activeOrder = {
  id: ORDER_ID,
  code: 'SO-1',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Sua dieu hoa',
  status: 'UNDER_REPAIR',
  customerName: 'Khach A',
  customerPhone: '0900000001',
  addressSummary: 'Quan 1',
  scheduledAt: '2030-10-21T10:00:00Z',
  laborTotal: 500000,
  partsTotal: 200000,
  grandTotal: 700000,
  paymentStatus: 'UNPAID',
  completionRequestedAt: '2030-10-21T11:00:00Z',
  customerConfirmed: false,
  arrivalVerified: true,
  beforeEvidenceCount: 1,
  afterEvidenceCount: 1,
  pricingMode: 'fixed_price',
  createdAt: '2030-10-21T09:00:00Z',
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { serviceOrderId: ORDER_ID } }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
    }, []);
  },
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

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

jest.mock('expo-location', () => ({
  hasServicesEnabledAsync: jest.fn(async () => true),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Highest: 1 },
}));

jest.mock('../../store/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'tech-1', role: 'technician' } };
  const hook = Object.assign(
    (selector?: (s: unknown) => unknown) => (typeof selector === 'function' ? selector(state) : state),
    { getState: () => state, subscribe: () => () => undefined },
  );
  return { useAuthStore: hook };
});

jest.mock('./technician-jobs-loader', () => ({
  technicianJobsUserId: () => 'tech-1',
}));

jest.mock('./technician-chat-shortcut', () => ({
  findChatForBooking: jest.fn(async () => ({
    conversationId: 'c1',
    counterpartName: 'Khach A',
    serviceName: 'Sua dieu hoa',
  })),
}));

jest.mock('../../api/orders.api', () => ({
  isHistoricalOrder: (row: { historical?: boolean } | null) => row?.historical === true,
  ordersApi: {
    getOrder: jest.fn(async () => ({ ...activeOrder })),
    getTechnicianOrder: jest.fn(async () => ({ ...activeOrder })),
    getEvidence: jest.fn(async () => []),
    getInvoice: jest.fn(async () => null),
    getAdditionalCosts: jest.fn(async () => []),
    getCashSettlement: jest.fn(async () => null),
    declareCashSettlement: jest.fn(),
    enRoute: jest.fn(),
    checkIn: jest.fn(),
    startRepair: jest.fn(),
    requestCompletion: jest.fn(),
    uploadEvidenceBefore: jest.fn(),
    uploadEvidenceAfter: jest.fn(),
    deleteEvidence: jest.fn(),
    createQuotation: jest.fn(),
    createAdditionalCostProposal: jest.fn(),
  },
}));

jest.mock('../../api/parts-catalog.api', () => ({
  partsCatalogApi: { getCatalog: jest.fn(async () => ({ data: [] })) },
}));

jest.mock('../../components/OrderNoteCard', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./technician-parts-section', () => ({
  __esModule: true,
  default: () => null,
}));

// Import after all mocks so the screen binds to the stubbed APIs.
const TechnicianOrderDetailScreen =
  jest.requireActual('./TechnicianOrderDetailScreen').default as React.ComponentType;

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

async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TechnicianOrderDetailScreen />);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
  return renderer;
}

describe('TechnicianOrderDetailScreen real-UI presentation (T-RUI2C)', () => {
  it('locks one real current state, one dominant next action with its checklist, and secondary contact/chat', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    expect(text).toContain('Chi tiết công việc');
    // One real current state from the Backend status.
    expect(text).toContain('Đang sửa chữa');
    // One dominant next action for the requested-completion state.
    expect(text).toContain('Đã yêu cầu hoàn thành');
    // Readiness checklist sits next to the action inside the same card.
    expect(text).toContain('Điều kiện yêu cầu nghiệm thu');
    // Call/map/chat stay secondary below the primary action.
    expect(text).toContain('Liên hệ nhanh');
    expect(text).toContain('Nhắn tin với khách');
    // Never invents ETA, distance, rating, or verified payment proof.
    expect(text).not.toMatch(/ETA|km|5\.0|★/i);
    expect(text).not.toContain('đã thanh toán và tiền công đã được ghi nhận');
    await act(async () => renderer.unmount());
  });

  it('keeps completion, customer payment, and cash declaration semantically separate', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    // Completion card no longer merges payment into its title or success claim.
    expect(text).toContain('Nghiệm thu');
    expect(text).not.toContain('Nghiệm thu và thanh toán');
    // Customer payment stays a separate read-only invoice concern.
    expect(text).toContain('Hóa đơn');
    // Cash declaration stays opt-in and never equals customer payment.
    expect(text).toMatch(/khai báo .* chưa phải đã thanh toán|khai báo .*ở thẻ riêng/i);
    await act(async () => renderer.unmount());
  });

  it('exposes safe targets and Vietnamese accessibility labels on header/primary/secondary', async () => {
    const renderer = await renderScreen();
    expect(renderer.root.findAllByProps({ accessibilityRole: 'header' }).length).toBeGreaterThanOrEqual(2);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quay lại' }).length).toBeGreaterThanOrEqual(1);
    expect(
      renderer.root.findAll(
        (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Nhắn tin với khách hàng',
      ).length,
    ).toBe(1);
    const scopedLabels = ['Quay lại', 'Nhắn tin với khách hàng', 'Gọi khách hàng', 'Chỉ đường đến địa chỉ khách hàng'];
    const { StyleSheet } = jest.requireActual<typeof import('react-native')>('react-native');
    const scoped = renderer.root.findAll(
      (node) =>
        node.type === TouchableOpacity &&
        typeof node.props.accessibilityLabel === 'string' &&
        scopedLabels.includes(node.props.accessibilityLabel),
    );
    expect(scoped.length).toBeGreaterThanOrEqual(2);
    for (const node of scoped) {
      const flat = StyleSheet.flatten(node.props.style) ?? {};
      const style = flat as { minHeight?: number; height?: number };
      const touchHeight = Math.max(style.minHeight ?? 0, style.height ?? 0);
      if (touchHeight > 0) {
        expect(touchHeight).toBeGreaterThanOrEqual(44);
      } else {
        // Nested ContactActions can supply an enlarged touch hitSlop instead.
        expect(node.props.hitSlop).toBeDefined();
      }
    }
    await act(async () => renderer.unmount());
  });

  it('keeps hierarchy ordering, status labels, and owner-locked detail targets', () => {
    expect(serviceOrderStatusView('ACCEPTED').label).toBe('Đã nhận đơn');
    expect(serviceOrderStatusView('EN_ROUTE').label).toBe('Đang di chuyển');
    expect(serviceOrderStatusView('UNDER_REPAIR').label).toBe('Đang sửa chữa');
    expect(serviceOrderStatusView('COMPLETED').label).toBe('Hoàn thành');
    expect(serviceOrderStatusView('CANCELLED').label).toBe('Đã hủy');
    const sections = selectTechnicianWorkOrderHierarchy({
      currentState: serviceOrderStatusView('UNDER_REPAIR'),
      primaryAction: { kind: 'await-customer-acceptance', heading: 'Đã yêu cầu hoàn thành' },
      readiness: { title: 'Điều kiện yêu cầu nghiệm thu', items: [], emptyMessage: 'Sẵn sàng.' },
      secondaryActions: ['contact', 'chat'],
    });
    expect(sections.map((section) => section.kind)).toEqual([
      'current-state',
      'primary-action',
      'readiness',
      'secondary-actions',
    ]);
    expect(techOrderDetailTarget({ id: ORDER_ID })).toBe(ORDER_ID);
    expect(techOrderDetailTarget({ id: ORDER_ID, historical: true })).toBeNull();
  });
});
