import React from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ordersApi } from '../../api/orders.api';
import * as Location from 'expo-location';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
let mockRouteId = ORDER_ID;
let mockAuthState = { isAuthenticated: true, user: { id: 'tech-test', role: 'technician' } };
const mockAuthListeners = new Set<() => void>();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const acceptedOrder = {
  id: ORDER_ID,
  code: 'SO-TEST-042',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Kiểm tra đường ống thử nghiệm',
  status: 'ACCEPTED' as const,
  customerName: 'Khách kiểm thử',
  customerPhone: '',
  addressSummary: 'Địa chỉ kiểm thử có nhiều dòng và nội dung dài',
  scheduledAt: '2030-10-21T03:00:00Z',
  scopeDescription: 'Kiểm tra chỗ rò nước theo yêu cầu kiểm thử',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  paymentStatus: 'UNPAID' as const,
  createdAt: '2030-10-20T03:00:00Z',
};

const enRouteOrder = {
  ...acceptedOrder,
  status: 'EN_ROUTE' as const,
  arrivalVerified: false,
};

const arrivedOrder = {
  ...acceptedOrder,
  status: 'EN_ROUTE' as const,
  arrivalVerified: true,
  beforeEvidenceCount: 0,
  pricingMode: 'fixed_price',
};

const underRepairOrder = {
  ...acceptedOrder,
  status: 'UNDER_REPAIR' as const,
  arrivalVerified: true,
  beforeEvidenceCount: 1,
  afterEvidenceCount: 0,
  pricingMode: 'fixed_price',
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { serviceOrderId: mockRouteId } }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(() => cb(), [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactModule.createElement(NativeView, props, children),
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
  };
});
jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = (props: object) => ReactModule.createElement(NativeView, props);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('expo-location', () => ({
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Highest: 1 },
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector?: (s: typeof mockAuthState) => unknown) => (selector ? selector(mockAuthState) : mockAuthState),
    {
      getState: () => mockAuthState,
      subscribe: (listener: () => void) => {
        mockAuthListeners.add(listener);
        return () => mockAuthListeners.delete(listener);
      },
    },
  ),
}));
jest.mock('../../api/orders.api', () => ({
  isHistoricalOrder: (order: { historical?: boolean } | null) => order?.historical === true,
  ordersApi: {
    getTechnicianOrder: jest.fn(),
    getOrder: jest.fn(),
    getEvidence: jest.fn(async () => []),
    getInvoice: jest.fn(async () => null),
    getAdditionalCosts: jest.fn(async () => []),
    getCashSettlement: jest.fn(async () => null),
    enRoute: jest.fn(),
    checkIn: jest.fn(),
    startRepair: jest.fn(),
    requestCompletion: jest.fn(),
    declareCashSettlement: jest.fn(),
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
jest.mock('./technician-chat-shortcut', () => ({ findChatForBooking: jest.fn() }));
jest.mock('../../components/OrderNoteCard', () => ({ __esModule: true, default: () => null }));
jest.mock('./technician-parts-section', () => ({ __esModule: true, default: () => null }));

const TechnicianOrderDetailScreen =
  jest.requireActual('./TechnicianOrderDetailScreen').default as React.ComponentType;
const getDetail = jest.mocked(ordersApi.getTechnicianOrder);
const location = jest.mocked(Location);

const renderers: ReturnType<typeof create>[] = [];

function textOf(node: ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map((text) =>
      React.Children.toArray(text.props.children)
        .filter((child) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join('\n');
}
function stageFocus(renderer: ReturnType<typeof create>) {
  return renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-stage-focus');
}
function button(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.findAll(
    (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === label,
  );
}
async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
}
async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TechnicianOrderDetailScreen />);
  });
  renderers.push(renderer);
  await flush();
  await flush();
  return renderer;
}
function expectNoMountSideEffects() {
  expect(ordersApi.enRoute).not.toHaveBeenCalled();
  expect(ordersApi.checkIn).not.toHaveBeenCalled();
  expect(ordersApi.startRepair).not.toHaveBeenCalled();
  expect(ordersApi.requestCompletion).not.toHaveBeenCalled();
  expect(ordersApi.uploadEvidenceBefore).not.toHaveBeenCalled();
  expect(ordersApi.uploadEvidenceAfter).not.toHaveBeenCalled();
  expect(ordersApi.createQuotation).not.toHaveBeenCalled();
  expect(ordersApi.createAdditionalCostProposal).not.toHaveBeenCalled();
  expect(ordersApi.declareCashSettlement).not.toHaveBeenCalled();
  expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteId = ORDER_ID;
  mockAuthState = { isAuthenticated: true, user: { id: 'tech-test', role: 'technician' } };
  getDetail.mockReset().mockResolvedValue({ ...acceptedOrder });
  jest.mocked(ordersApi.enRoute).mockReset().mockResolvedValue({});
  jest.mocked(ordersApi.checkIn).mockReset().mockResolvedValue({});
});
afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach((renderer) => renderer.unmount());
  });
  mockAuthListeners.clear();
  jest.restoreAllMocks();
});

describe('technician workflow focused UI P1A T04/T05 (RED first)', () => {
  it('T04 ACCEPTED shows the accepted stage first with exactly one existing travel CTA', async () => {
    const renderer = await renderScreen();
    const focus = stageFocus(renderer);
    expect(focus).toHaveLength(1);
    expect(textOf(focus[0])).toContain('Công việc đã nhận');
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    const travelButtons = renderer.root.findAll(
      (node) => node.type === TouchableOpacity && textOf(node).includes('Bắt đầu di chuyển'),
    );
    expect(travelButtons).toHaveLength(1);
    const style = StyleSheet.flatten(button(renderer, 'Bắt đầu di chuyển')[0].props.style);
    expect(Math.max(style.minHeight ?? 0, style.height ?? 0)).toBeGreaterThanOrEqual(44);
    for (const text of focus[0].findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
    }
    expect(textOf(renderer.root)).toContain('Ảnh trước sửa chữa');
    expect(textOf(renderer.root)).toContain('Báo giá');
    expectNoMountSideEffects();
  });

  it('opens all details as a separate scroll scene and returns to the same active stage without a CTA request', async () => {
    const renderer = await renderScreen();
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-current-stage-context')).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-sticky-footer')).toHaveLength(1);

    await act(async () => { button(renderer, 'Xem toàn bộ chi tiết')[0].props.onPress(); });

    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-all-details-header')).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === ScrollView && node.props.testID === 'technician-all-details-scroll')).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-current-stage-context')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-stage-progress')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-sticky-footer')).toHaveLength(0);
    expect(button(renderer, 'Xem toàn bộ chi tiết')).toHaveLength(0);
    expectNoMountSideEffects();

    await act(async () => { button(renderer, 'Đóng toàn bộ chi tiết')[0].props.onPress(); });

    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-all-details-header')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-current-stage-context')).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-sticky-footer')).toHaveLength(1);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    expectNoMountSideEffects();
  });

  it('closes all details back to the exact previously selected read-only stage', async () => {
    getDetail.mockResolvedValue({ ...enRouteOrder });
    const renderer = await renderScreen();
    await act(async () => { button(renderer, 'Xem tiến độ công việc')[0].props.onPress(); });
    const pastStep = button(renderer, 'Di chuyển, đã ghi nhận, xem lại');
    expect(pastStep).toHaveLength(1);
    await act(async () => { pastStep[0].props.onPress(); });
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-past-stage')).toHaveLength(1);

    const backHandlerRegistration = jest.spyOn(BackHandler, 'addEventListener');
    await act(async () => { button(renderer, 'Xem toàn bộ chi tiết')[0].props.onPress(); });
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-past-stage')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-sticky-footer')).toHaveLength(0);

    const hardwareBackPress = backHandlerRegistration.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
    expect(hardwareBackPress).toBeDefined();
    await act(async () => { expect(hardwareBackPress?.({} as never)).toBe(true); });
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-past-stage')).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-current-stage-context')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'technician-sticky-footer')).toHaveLength(0);
    expectNoMountSideEffects();
  });

  it('T05 EN_ROUTE before arrival shows the check-in stage first with exactly one existing check-in CTA', async () => {
    getDetail.mockResolvedValue({ ...enRouteOrder });
    const renderer = await renderScreen();
    const focus = stageFocus(renderer);
    expect(focus).toHaveLength(1);
    expect(textOf(focus[0])).toContain('Đến nơi, xác nhận rõ');
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(1);
    const style = StyleSheet.flatten(button(renderer, 'Check-in tại nhà khách')[0].props.style);
    expect(Math.max(style.minHeight ?? 0, style.height ?? 0)).toBeGreaterThanOrEqual(44);
    expect(textOf(renderer.root)).toContain('Ảnh trước sửa chữa');
    expectNoMountSideEffects();
  });

  it('after arrivalVerified moves to the BEFORE stage and never shows the check-in stage', async () => {
    getDetail.mockResolvedValue({ ...arrivedOrder });
    const renderer = await renderScreen();
    expect(stageFocus(renderer)).toHaveLength(1);
    expect(textOf(stageFocus(renderer)[0])).toContain('Ghi nhận trước khi sửa');
    expect(textOf(stageFocus(renderer)[0])).not.toContain('Đến nơi, xác nhận rõ');
    expect(textOf(renderer.root)).not.toContain('Đến nơi, xác nhận rõ');
    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'before-evidence-overview')).toHaveLength(1);
    expectNoMountSideEffects();
  });

  it('loading shows the loader with no stage and no CTA', async () => {
    let resolveDetail!: (value: unknown) => void;
    getDetail.mockReturnValue(new Promise((resolve) => { resolveDetail = resolve as (value: unknown) => void; }));
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expect(stageFocus(renderer)).toHaveLength(0);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    await act(async () => { resolveDetail({ ...acceptedOrder }); });
    await flush();
    expect(stageFocus(renderer)).toHaveLength(1);
  });

  it('401 keeps the safe denied state with retry and no stage, CTA, or customer PII', async () => {
    getDetail.mockRejectedValue({ response: { status: 401 } });
    const renderer = await renderScreen();
    expect(stageFocus(renderer)).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Không xem được công việc');
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain('Khách kiểm thử');
    expect(button(renderer, 'Thử tải lại chi tiết công việc').length).toBeGreaterThanOrEqual(1);
    expectNoMountSideEffects();
  });

  it('historical summaries never show a stage, CTA, or customer private fields', async () => {
    getDetail.mockResolvedValue({ id: ORDER_ID, code: 'SO-TEST-042', status: 'COMPLETED', createdAt: '2030-10-20T03:00:00Z', historical: true });
    const renderer = await renderScreen();
    expect(stageFocus(renderer)).toHaveLength(0);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('chỉ còn tóm tắt lưu trữ');
    expect(textOf(renderer.root)).not.toContain('Khách kiểm thử');
    expectNoMountSideEffects();
  });

  it('unknown arrival stays fail-safe with no stage while the legacy CTA remains single', async () => {
    const { arrivalVerified: _dropped, ...rest } = enRouteOrder;
    getDetail.mockResolvedValue({ ...rest });
    const renderer = await renderScreen();
    expect(stageFocus(renderer)).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(1);
    expectNoMountSideEffects();
  });

  it('retargeted detail IDs never show a stage or a CTA', async () => {
    getDetail.mockResolvedValue({ ...acceptedOrder, id: '33333333-3333-4333-8333-333333333333' });
    const renderer = await renderScreen();
    expect(stageFocus(renderer)).toHaveLength(0);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
  });

  it('UNDER_REPAIR keeps its focused repair stage and every existing work form without duplicate CTA', async () => {
    getDetail.mockResolvedValue({ ...underRepairOrder });
    const renderer = await renderScreen();
    expect(stageFocus(renderer)).toHaveLength(1);
    expect(textOf(stageFocus(renderer)[0])).toContain('Sửa chữa theo phạm vi đã duyệt');
    for (const section of ['Ảnh trước sửa chữa', 'Giá cố định', 'Đề xuất chi phí phát sinh', 'Ảnh sau sửa chữa', 'Nghiệm thu', 'Hóa đơn', 'Chi phí phát sinh']) {
      expect(textOf(renderer.root)).toContain(section);
    }
    const ctaLabels = ['Bắt đầu di chuyển', 'Check-in tại nhà khách', 'Bắt đầu sửa chữa', 'Gửi yêu cầu nghiệm thu'];
    for (const label of ctaLabels) {
      expect(button(renderer, label).length).toBeLessThanOrEqual(1);
    }
    expectNoMountSideEffects();
  });

  it('travel single-flight disables the single CTA without inventing another button', async () => {
    let resolveEnRoute!: (value: unknown) => void;
    jest.mocked(ordersApi.enRoute).mockReturnValue(new Promise((resolve) => { resolveEnRoute = resolve as (value: unknown) => void; }));
    const renderer = await renderScreen();
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    await act(async () => {
      button(renderer, 'Bắt đầu di chuyển')[0].props.onPress();
    });
    await flush();
    const busyButtons = button(renderer, 'Bắt đầu di chuyển');
    expect(busyButtons).toHaveLength(1);
    expect(busyButtons[0].props.disabled).toBe(true);
    await act(async () => { resolveEnRoute({}); });
    await flush();
    await flush();
  });
});
