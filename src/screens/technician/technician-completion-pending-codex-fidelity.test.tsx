import React from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ordersApi } from '../../api/orders.api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
let mockRouteId = ORDER_ID;
let mockAuthState = { isAuthenticated: true, user: { id: 'tech-test', role: 'technician' } };
const mockAuthListeners = new Set<() => void>();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const requestedOrder = {
  id: ORDER_ID,
  code: 'SO-TEST-108',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Sửa máy giặt thử nghiệm',
  status: 'UNDER_REPAIR' as const,
  arrivalVerified: true,
  beforeEvidenceCount: 2,
  afterEvidenceCount: 2,
  completionRequestedAt: '2030-10-21T04:00:00Z',
  customerConfirmed: false as boolean | undefined,
  pricingMode: 'fixed_price',
  technician: { id: 'tech-test', fullName: 'Kỹ thuật viên kiểm thử', phoneNumber: '', averageRating: null },
  customerName: 'Khách kiểm thử',
  customerPhone: '',
  addressSummary: 'Địa chỉ kiểm thử có nhiều dòng và nội dung dài',
  scheduledAt: '2030-10-21T03:00:00Z',
  scopeDescription: 'Sửa máy giặt không vắt theo yêu cầu kiểm thử',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  paymentStatus: 'UNPAID' as const,
  createdAt: '2030-10-20T03:00:00Z',
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
    (selector?: (s: typeof mockAuthState) => unknown) => selector ? selector(mockAuthState) : mockAuthState,
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
const getCosts = jest.mocked(ordersApi.getAdditionalCosts);
const mutations = [
  ordersApi.enRoute, ordersApi.checkIn, ordersApi.startRepair, ordersApi.requestCompletion,
  ordersApi.declareCashSettlement, ordersApi.uploadEvidenceBefore, ordersApi.uploadEvidenceAfter,
  ordersApi.deleteEvidence, ordersApi.createQuotation, ordersApi.createAdditionalCostProposal,
];
const renderers: ReturnType<typeof create>[] = [];

function textOf(node: ReactTestInstance): string {
  return node.findAllByType(Text).map((text) =>
    React.Children.toArray(text.props.children).filter((child) => typeof child === 'string' || typeof child === 'number').join(''),
  ).join('\n');
}
function byId(renderer: ReturnType<typeof create>, id: string) {
  return renderer.root.findAll((node) => node.type === View && node.props.testID === id);
}
function button(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.findAll((node) => node.type === TouchableOpacity && node.props.accessibilityLabel === label);
}
async function flush() {
  await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
}
async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TechnicianOrderDetailScreen />); });
  renderers.push(renderer);
  await flush();
  return renderer;
}
function deferred<T,>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function expectNoSensitiveEffects() {
  mutations.forEach((mutation) => expect(mutation).not.toHaveBeenCalled());
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
}

let sessionSequence = 0;
beforeEach(() => {
  jest.clearAllMocks();
  mockRouteId = ORDER_ID;
  mockAuthState = { isAuthenticated: true, user: { id: `tech-test-${++sessionSequence}`, role: 'technician' } };
  getDetail.mockReset().mockResolvedValue({ ...requestedOrder });
  getCosts.mockReset().mockResolvedValue([]);
  jest.mocked(ordersApi.getOrder).mockReset().mockResolvedValue({ ...requestedOrder, technician: { ...requestedOrder.technician, id: mockAuthState.user.id } });
  jest.mocked(ordersApi.checkIn).mockReset().mockResolvedValue({ result: 'valid' });
  jest.mocked(ordersApi.requestCompletion).mockReset().mockResolvedValue({ id: ORDER_ID });
  jest.mocked(Location.hasServicesEnabledAsync).mockReset().mockResolvedValue(true);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockReset().mockResolvedValue({ status: 'granted' } as never);
  jest.mocked(Location.getCurrentPositionAsync).mockReset().mockResolvedValue({ coords: { latitude: 0, longitude: 0, accuracy: 8 } } as never);
  jest.mocked(ordersApi.enRoute).mockReset().mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => { renderers.splice(0).forEach((renderer) => renderer.unmount()); });
  mockAuthListeners.clear();
  jest.restoreAllMocks();
});

describe('T-NATIVE-08B completion pending Codex fidelity', () => {
  it('shows the warm Clock hero above the next step when the server recorded the request', async () => {
    const renderer = await renderScreen();
    expect(getDetail).toHaveBeenCalledWith(ORDER_ID);
    const panel = byId(renderer, 'completion-pending-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Đã yêu cầu hoàn thành');
    expect(textOf(panel[0])).toContain('Chờ khách xác nhận nghiệm thu');
    expect(byId(renderer, 'completion-pending-art')).toHaveLength(1);
    expect(panel[0].findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(panel[0].findAllByType(Image)).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Chờ khách nghiệm thu. Yêu cầu hoàn thành không đồng nghĩa');
    expect(button(renderer, 'Kiểm tra trạng thái nghiệm thu')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it('shows the hero after a confirmed controller POST even before the server mirrors it', async () => {
    getDetail.mockResolvedValue({
      ...requestedOrder,
      completionRequestedAt: undefined,
      afterEvidenceCount: 2,
    } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    await act(async () => button(renderer, 'Yêu cầu nghiệm thu')[0].props.onPress());
    await flush();
    await act(async () => button(renderer, 'Xác nhận yêu cầu hoàn thành')[0].props.onPress());
    await flush();
    expect(ordersApi.requestCompletion).toHaveBeenCalledTimes(1);
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(1);
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(byId(renderer, 'completion-pending-overview')[0])).toContain('Đã yêu cầu hoàn thành');
  });

  it('keeps the hero hidden on an ambiguous POST lock without server confirmation', async () => {
    getDetail.mockResolvedValue({
      ...requestedOrder,
      completionRequestedAt: undefined,
      afterEvidenceCount: 2,
    } as never);
    jest.mocked(ordersApi.requestCompletion).mockRejectedValueOnce(new Error('timeout'));
    const renderer = await renderScreen();
    await act(async () => button(renderer, 'Yêu cầu nghiệm thu')[0].props.onPress());
    await flush();
    await act(async () => button(renderer, 'Xác nhận yêu cầu hoàn thành')[0].props.onPress());
    await flush();
    expect(ordersApi.requestCompletion).toHaveBeenCalledTimes(1);
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toMatch(/tải lại chi tiết đơn|chờ xác minh/i);
  });

  it.each(['ACCEPTED', 'EN_ROUTE', 'COMPLETED', 'CANCELLED', 'UNKNOWN'])('hides the pending hero on %s', async (status) => {
    getDetail.mockResolvedValue({ ...requestedOrder, status } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(byId(renderer, 'completion-pending-art')).toHaveLength(0);
    expect(byId(renderer, 'completion-pending-after')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain(requestedOrder.serviceName);
    expectNoSensitiveEffects();
  });

  it('hides the hero for COMPLETED even with a recorded request', async () => {
    getDetail.mockResolvedValue({ ...requestedOrder, status: 'COMPLETED' } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đơn đã hoàn thành.');
    expectNoSensitiveEffects();
  });

  it('hides the hero when no request was recorded locally or on the server', async () => {
    getDetail.mockResolvedValue({ ...requestedOrder, completionRequestedAt: undefined } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    expect(ordersApi.requestCompletion).not.toHaveBeenCalled();
  });

  it.each([true, false, undefined, null])('labels customerConfirmed %s independently of payment', async (customerConfirmed) => {
    getDetail.mockResolvedValue({ ...requestedOrder, customerConfirmed } as never);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'completion-pending-overview');
    expect(panel).toHaveLength(1);
    const customer = byId(renderer, 'completion-pending-customer')[0];
    if (customerConfirmed === true) {
      expect(textOf(customer)).toContain('Khách đã xác nhận nghiệm thu');
      expect(textOf(customer)).not.toMatch(/chưa thanh toán|đã thanh toán/i);
    } else if (customerConfirmed === false) {
      expect(textOf(customer)).toContain('Chờ khách xác nhận nghiệm thu');
    } else {
      expect(textOf(customer)).toContain('Chưa xác định trạng thái nghiệm thu');
    }
    expectNoSensitiveEffects();
  });

  it.each(['PAID', 'UNPAID', 'REFUNDED', undefined, null, ''])('labels payment %s independently of acceptance', async (paymentStatus) => {
    getDetail.mockResolvedValue({ ...requestedOrder, paymentStatus } as never);
    const renderer = await renderScreen();
    const payment = byId(renderer, 'completion-pending-payment')[0];
    const normalized = String(paymentStatus ?? '').toUpperCase();
    if (normalized === 'PAID') {
      expect(textOf(payment)).toContain('Đã thanh toán');
    } else if (normalized === 'UNPAID') {
      expect(textOf(payment)).toContain('Chưa thanh toán');
      expect(textOf(payment)).not.toMatch(/đã xác nhận nghiệm thu|khách đã xác nhận/i);
    } else {
      expect(textOf(payment)).toContain('Chưa xác định trạng thái thanh toán');
      expect(textOf(payment)).not.toContain('Đã thanh toán');
    }
    expectNoSensitiveEffects();
  });

  it.each([1, 2, 5])('reads %s recorded AFTER photos only from the server count', async (count) => {
    getDetail.mockResolvedValue({ ...requestedOrder, afterEvidenceCount: count });
    const renderer = await renderScreen();
    const after = byId(renderer, 'completion-pending-after')[0];
    expect(textOf(after)).toContain(`Đã ghi nhận ${count} ảnh sau sửa`);
    expect(after.findAllByType(Image)).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('labels explicitly zero AFTER as no recorded photo', async () => {
    getDetail.mockResolvedValue({ ...requestedOrder, afterEvidenceCount: 0 });
    const renderer = await renderScreen();
    expect(textOf(byId(renderer, 'completion-pending-after')[0])).toContain('Không có ảnh AFTER được ghi nhận');
    expectNoSensitiveEffects();
  });

  it.each([null, undefined, -1, NaN, Infinity, -Infinity, '2', true])('keeps AFTER neutral for invalid count %s', async (count) => {
    getDetail.mockResolvedValue({ ...requestedOrder, afterEvidenceCount: count } as never);
    const renderer = await renderScreen();
    expect(textOf(byId(renderer, 'completion-pending-after')[0])).toContain('Chưa xác định ảnh AFTER đã lưu');
    expect(textOf(byId(renderer, 'completion-pending-after')[0])).not.toMatch(/Đã ghi nhận \d+ ảnh|Infinity|NaN/);
    expectNoSensitiveEffects();
  });

  it('claims neither COMPLETED, settlement, note, money nor quotation approval', async () => {
    const renderer = await renderScreen();
    const panel = byId(renderer, 'completion-pending-overview')[0];
    expect(textOf(panel)).not.toMatch(/COMPLETED|COMPLETION_REQUESTED|SO-DEMO|mẫu|demo|Ghi chú bàn giao|đối soát|khai báo tiền mặt|hóa đơn|báo giá|1\.250\.000|₫|\d+\s*(phút|giờ|giây)|đếm ngược|timer/i);
    expect(textOf(panel)).toContain('Nghiệm thu, thanh toán là các bước riêng');
    expect(textOf(renderer.root)).not.toMatch(/Trở về góc làm việc|Xem hóa đơn & khai báo/i);
    expectNoSensitiveEffects();
  });

  it('keeps exactly one existing refresh action and no new navigation CTA', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(1);
    expect(button(renderer, 'Kiểm tra trạng thái nghiệm thu')).toHaveLength(1);
    expect(button(renderer, 'Nghiệm thu')).toHaveLength(1);
    expect(renderer.root.findAllByType(TouchableOpacity).filter((node) =>
      String(node.props.accessibilityLabel ?? '').toLowerCase().includes('trở về') ||
      String(node.props.accessibilityLabel ?? '').toLowerCase().includes('hóa đơn'),
    )).toHaveLength(0);
    expect(byId(renderer, 'completion-pending-overview')[0].findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it.each(['offline', 401, 403, 404])('reveals no pending hero or private data on GET failure %s', async (failure) => {
    getDetail.mockRejectedValue(failure === 'offline' ? new Error('offline') : { response: { status: failure } });
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(requestedOrder.customerName);
    expectNoSensitiveEffects();
  });

  it.each(['history', 'wrong-id', 'absent'])('rejects %s detail without hero or evidence reads', async (kind) => {
    getDetail.mockResolvedValue((kind === 'history' ? { ...requestedOrder, historical: true }
      : kind === 'wrong-id' ? { ...requestedOrder, id: '33333333-3333-4333-8333-333333333333' } : null) as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(requestedOrder.addressSummary);
    expect(ordersApi.getEvidence).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('hides the hero while an error banner is shown', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(1);
    getDetail.mockRejectedValueOnce(new Error('offline'));
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
  });

  it('does not GET or display the hero for an invalid route ID', async () => {
    mockRouteId = 'not-a-service-order';
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('waits for a fresh authorized GET before presenting the hero', async () => {
    const pending = deferred<typeof requestedOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expectNoSensitiveEffects();
    await act(async () => pending.resolve(requestedOrder));
    await flush();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404, 'history'])('removes the existing hero on revoked refresh %s', async (failure) => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(1);
    if (failure === 'history') getDetail.mockResolvedValueOnce({ ...requestedOrder, historical: true });
    else getDetail.mockRejectedValueOnce({ response: { status: failure } });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(requestedOrder.customerName);
    expectNoSensitiveEffects();
  });

  it('ignores late verified GET after session ownership is revoked', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(1);
    const pending = deferred<typeof requestedOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await act(async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(requestedOrder));
    await flush();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(requestedOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it('shows no hero when the session is unauthenticated', async () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: false };
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'completion-pending-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('keeps scalable text, decorative art and safe scroll without a timer or demo CTA', async () => {
    const renderer = await renderScreen();
    const panel = byId(renderer, 'completion-pending-overview');
    expect(panel).toHaveLength(1);
    for (const text of panel[0].findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    const art = byId(renderer, 'completion-pending-art')[0];
    expect(art.props.accessible).toBe(false);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(textOf(panel[0])).not.toMatch(/\d+\s*(phút|giờ|giây)|đã trôi qua|timer|đếm ngược/i);
    expect(textOf(renderer.root)).not.toMatch(/Ghi nhận sau sửa|Thêm bằng chứng AFTER mẫu|Demo:/i);
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.findAll((node) => node === panel[0])).toHaveLength(1);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(48);
    expect(panel[0].findAll((node) => node.props.testID === 'after-overview')).toHaveLength(0);
    const overviewIndex = scroll.findAll((node) => node.type === View).findIndex((node) => node.props.testID === 'completion-pending-overview');
    const nextStepIndex = textOf(renderer.root).indexOf('Bước tiếp theo');
    expect(overviewIndex).toBeGreaterThanOrEqual(0);
    expect(nextStepIndex).toBeGreaterThan(-1);
    expectNoSensitiveEffects();
  });
});
