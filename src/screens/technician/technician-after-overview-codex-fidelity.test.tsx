import React from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ordersApi } from '../../api/orders.api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const COST_ID = '44444444-4444-4444-8444-444444444444';
let mockRouteId = ORDER_ID;
let mockAuthState = { isAuthenticated: true, user: { id: 'tech-test', role: 'technician' } };
const mockAuthListeners = new Set<() => void>();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const underRepairOrder = {
  id: ORDER_ID,
  code: 'SO-TEST-108',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Sửa máy giặt thử nghiệm',
  status: 'UNDER_REPAIR' as const,
  arrivalVerified: true,
  beforeEvidenceCount: 2,
  afterEvidenceCount: 0,
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
// Device storage and parts scanner are outside this presentation slice.
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
  getDetail.mockReset().mockResolvedValue({ ...underRepairOrder });
  getCosts.mockReset().mockResolvedValue([]);
  jest.mocked(ordersApi.getOrder).mockReset().mockResolvedValue({ ...underRepairOrder, technician: { ...underRepairOrder.technician, id: mockAuthState.user.id } });
  jest.mocked(ordersApi.checkIn).mockReset().mockResolvedValue({ result: 'valid' });
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

describe('T-NATIVE-08A authorized native AFTER overview', () => {
  it('shows the calm pale hero with honest empty AFTER count and no fake photo', async () => {
    const renderer = await renderScreen();
    expect(getDetail).toHaveBeenCalledWith(ORDER_ID);
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Tình trạng sau sửa');
    expect(textOf(panel[0])).toContain('Chưa ghi nhận ảnh sau sửa');
    expect(byId(renderer, 'after-hero-art')).toHaveLength(1);
    expect(byId(renderer, 'after-evidence-placeholder')).toHaveLength(1);
    expect(panel[0].findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(panel[0].findAllByType(Image)).toHaveLength(0);
    expect(textOf(panel[0])).not.toMatch(/SO-DEMO|mẫu|demo|COMPLETION_REQUESTED|đã thanh toán|PAID|1\.250\.000 ₫/i);
    expectNoSensitiveEffects();
  });

  it.each([1, 2, 5])('reads %s recorded AFTER photos only from the server count', async (count) => {
    getDetail.mockResolvedValue({ ...underRepairOrder, afterEvidenceCount: count });
    const renderer = await renderScreen();
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain(`Đã ghi nhận ${count} ảnh sau sửa`);
    expect(textOf(panel[0])).not.toContain('Chưa ghi nhận ảnh sau sửa');
    expect(panel[0].findAllByType(Image)).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each([0, null, undefined, -1, NaN, Infinity, -Infinity, '2', true])('leaves AFTER honest empty for invalid count %s', async (count) => {
    getDetail.mockResolvedValue({ ...underRepairOrder, afterEvidenceCount: count } as never);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Chưa ghi nhận ảnh sau sửa');
    expect(textOf(panel[0])).not.toMatch(/Đã ghi nhận|Infinity|NaN/);
    expectNoSensitiveEffects();
  });

  it('shows no pending cost when the server returns an empty list', async () => {
    const renderer = await renderScreen();
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    const cost = byId(renderer, 'after-cost-row');
    expect(cost).toHaveLength(1);
    expect(textOf(cost[0])).toContain('Không có yêu cầu chi phí phát sinh đang chờ duyệt');
    expectNoSensitiveEffects();
  });

  it('blocks completion truthfully when a real pending cost exists', async () => {
    getCosts.mockResolvedValue([{
      id: COST_ID,
      serviceOrderId: ORDER_ID,
      status: 'PENDING_APPROVAL',
      reason: 'Thay linh kiện kiểm thử',
      totalLaborDelta: 0,
      totalPartsDelta: 0,
      createdAt: '2030-10-21T03:00:00Z',
      items: [],
    }]);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(byId(renderer, 'after-cost-row')[0])).toContain('Còn chi phí phát sinh chờ khách quyết định');
    expect(textOf(panel[0])).not.toMatch(/Không có yêu cầu chi phí/);
    // Pending cost keeps the single await-cost next action, never a completion CTA.
    expect(button(renderer, 'Gửi yêu cầu nghiệm thu')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Chờ phản hồi chi phí phát sinh');
    expectNoSensitiveEffects();
  });

  it.each(['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'])('treats non-pending cost %s as no pending request', async (status) => {
    getCosts.mockResolvedValue([{
      id: COST_ID,
      serviceOrderId: ORDER_ID,
      status,
      reason: 'Khoản đã xử lý kiểm thử',
      totalLaborDelta: 0,
      totalPartsDelta: 0,
      createdAt: '2030-10-21T03:00:00Z',
      items: [],
    }]);
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    expect(textOf(byId(renderer, 'after-cost-row')[0])).toContain('Không có yêu cầu chi phí phát sinh đang chờ duyệt');
    expectNoSensitiveEffects();
  });

  it('stays cost-neutral while costs are loading or failed', async () => {
    const pendingCosts = deferred<never[]>();
    getCosts.mockReturnValue(pendingCosts.promise as never);
    const renderer = await renderScreen();
    // Detail resolved but costs still in flight: overview may show loading copy, never green.
    const loadingPanel = byId(renderer, 'after-overview');
    expect(loadingPanel).toHaveLength(1);
    expect(textOf(loadingPanel[0])).not.toMatch(/Đã ghi nhận \d+ ảnh sau sửa.*đã tải|thành công/i);
    await act(async () => pendingCosts.resolve([]));
    await flush();
    expect(textOf(byId(renderer, 'after-overview')[0])).toContain('Không có yêu cầu chi phí phát sinh đang chờ duyệt');
    // Failed GET stays honest, never claims zero pending as verified.
    getCosts.mockRejectedValueOnce(new Error('offline'));
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    const afterFail = byId(renderer, 'after-overview');
    expect(afterFail).toHaveLength(1);
    expect(textOf(afterFail[0])).not.toMatch(/Ghi chú bàn giao mẫu|đã thanh toán|PAID/i);
    expectNoSensitiveEffects();
  });

  it('keeps local pending selection separate from the server count', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{
      uri: 'file:///test-only-after.jpg', mimeType: 'image/jpeg', fileSize: 2048,
    }] } as never);
    jest.mocked(ordersApi.uploadEvidenceAfter).mockRejectedValue(new Error('timeout'));
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    expect(textOf(byId(renderer, 'after-overview')[0])).toContain('Chưa ghi nhận ảnh sau sửa');
    await act(async () => button(renderer, 'Chụp ảnh sau sửa chữa')[0].props.onPress());
    await flush();
    const panel = byId(renderer, 'after-overview')[0];
    expect(textOf(panel)).toContain('Chưa ghi nhận ảnh sau sửa');
    expect(textOf(panel)).toContain('Ảnh đã chọn trên máy chưa được xác minh tải lên.');
    expect(textOf(panel)).not.toMatch(/Đã ghi nhận 1 ảnh sau sửa|đã tải lên|thành công/i);
    expect(panel.findAllByType(Image)).toHaveLength(0);
    expect(ordersApi.uploadEvidenceAfter).not.toHaveBeenCalled();
    expect(button(renderer, 'Tải ảnh sau sửa chữa lên')).toHaveLength(1);
    await act(async () => button(renderer, 'Tải ảnh sau sửa chữa lên')[0].props.onPress());
    await flush();
    expect(ordersApi.uploadEvidenceAfter).toHaveBeenCalledTimes(1);
    const reconciling = byId(renderer, 'after-overview')[0];
    expect(textOf(reconciling)).toContain('Chưa ghi nhận ảnh sau sửa');
    expect(textOf(reconciling)).toContain('Lần tải ảnh sau đang chờ xác minh.');
    expect(reconciling.findAllByType(Image)).toHaveLength(0);
    expect(button(renderer, 'Kiểm tra ảnh sau sửa')).toHaveLength(1);
    await act(async () => button(renderer, 'Kiểm tra ảnh sau sửa')[0].props.onPress());
    await flush();
    expect(ordersApi.uploadEvidenceAfter).toHaveBeenCalledTimes(1);
    expect(ordersApi.requestCompletion).not.toHaveBeenCalled();
  });

  it('does not fake quotation approval, customer acceptance, payment or a completion note', async () => {
    getDetail.mockResolvedValue({
      ...underRepairOrder,
      afterEvidenceCount: 2,
      pricingMode: 'inspection_required',
      quotation: {
        id: 'quotation-test', status: 'SENT', laborTotal: 0, partsTotal: 0,
        items: [{ type: 'LABOR', description: 'Phạm vi đã lưu trong báo giá kiểm thử', quantity: 1, unitPrice: 0, lineTotal: 0 }],
      },
    } as never);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Đã ghi nhận 2 ảnh sau sửa');
    expect(textOf(renderer.root)).not.toMatch(/Ghi chú bàn giao|Tình trạng đã kiểm tra|đã nghiệm thu|đã hoàn thành|đã thanh toán|PAID|COMPLETED/i);
    expect(textOf(panel[0])).not.toMatch(/Báo giá đã được khách duyệt|Khách đã duyệt/i);
    expectNoSensitiveEffects();
  });

  it('keeps exactly one true next-step CTA and the existing AFTER plus Nghiệm thu cards', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    expect(button(renderer, 'Chụp ảnh sau sửa từ bước tiếp theo')).toHaveLength(1);
    expect(button(renderer, 'Ảnh sau sửa chữa')).toHaveLength(1);
    expect(button(renderer, 'Nghiệm thu')).toHaveLength(1);
    expect(button(renderer, 'Chụp ảnh sau sửa chữa')).toHaveLength(1);
    expect(textOf(renderer.root)).not.toMatch(/Yêu cầu hoàn thành sẽ tạo|Ghi chú bàn giao mẫu/i);
    expectNoSensitiveEffects();
  });

  it('moves to the single request-completion CTA once AFTER is recorded without pending costs', async () => {
    getDetail.mockResolvedValue({ ...underRepairOrder, afterEvidenceCount: 2 });
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    expect(textOf(byId(renderer, 'after-overview')[0])).toContain('Đã ghi nhận 2 ảnh sau sửa');
    expect(button(renderer, 'Yêu cầu nghiệm thu')).toHaveLength(1);
    expect(button(renderer, 'Chụp ảnh sau sửa từ bước tiếp theo')).toHaveLength(0);
    expect(ordersApi.requestCompletion).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it.each(['ACCEPTED', 'EN_ROUTE', 'COMPLETED', 'CANCELLED', 'UNKNOWN'])('hides the AFTER overview on %s', async (status) => {
    getDetail.mockResolvedValue({ ...underRepairOrder, status } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(byId(renderer, 'after-hero-art')).toHaveLength(0);
    expect(byId(renderer, 'after-evidence-placeholder')).toHaveLength(0);
    expect(byId(renderer, 'after-cost-row')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain(underRepairOrder.serviceName);
    expectNoSensitiveEffects();
  });

  it('hides the overview once the server records completionRequestedAt', async () => {
    getDetail.mockResolvedValue({ ...underRepairOrder, completionRequestedAt: '2030-10-21T04:00:00Z' } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đã yêu cầu hoàn thành');
    expect(textOf(renderer.root)).not.toMatch(/Tình trạng sau sửa.*Chưa ghi nhận|Tình trạng sau sửa.*Đã ghi nhận/);
    expectNoSensitiveEffects();
  });

  it.each(['offline', 401, 403, 404])('reveals no overview or private data on GET failure %s', async (failure) => {
    getDetail.mockRejectedValue(failure === 'offline' ? new Error('offline') : { response: { status: failure } });
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(underRepairOrder.customerName);
    expectNoSensitiveEffects();
  });

  it.each(['history', 'wrong-id', 'absent'])('rejects %s detail without overview or evidence reads', async (kind) => {
    getDetail.mockResolvedValue((kind === 'history' ? { ...underRepairOrder, historical: true }
      : kind === 'wrong-id' ? { ...underRepairOrder, id: '33333333-3333-4333-8333-333333333333' } : null) as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(underRepairOrder.addressSummary);
    expect(ordersApi.getEvidence).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('does not GET or display the overview for an invalid route ID', async () => {
    mockRouteId = 'not-a-service-order';
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('waits for a fresh authorized GET before presenting the overview', async () => {
    const pending = deferred<typeof underRepairOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expectNoSensitiveEffects();
    await act(async () => pending.resolve(underRepairOrder));
    await flush();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404, 'history'])('removes the existing overview on revoked refresh %s', async (failure) => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    if (failure === 'history') getDetail.mockResolvedValueOnce({ ...underRepairOrder, historical: true });
    else getDetail.mockRejectedValueOnce({ response: { status: failure } });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(underRepairOrder.customerName);
    expectNoSensitiveEffects();
  });

  it('ignores late verified GET after session ownership is revoked', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'after-overview')).toHaveLength(1);
    const pending = deferred<typeof underRepairOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await act(async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(underRepairOrder));
    await flush();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(underRepairOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it('shows no overview when the session is unauthenticated', async () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: false };
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'after-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('keeps scalable text, decorative art and safe scroll without a timer or demo CTA', async () => {
    const renderer = await renderScreen();
    const panel = byId(renderer, 'after-overview');
    expect(panel).toHaveLength(1);
    for (const text of panel[0].findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    const art = byId(renderer, 'after-hero-art')[0];
    expect(art.props.accessible).toBe(false);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    const placeholder = byId(renderer, 'after-evidence-placeholder')[0];
    expect(placeholder.props.accessible).toBe(false);
    expect(placeholder.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(StyleSheet.flatten(placeholder.props.style).minHeight).toBeGreaterThanOrEqual(200);
    expect(textOf(panel[0])).not.toMatch(/\d+\s*(phút|giờ|giây)|đã trôi qua|timer|đếm ngược/i);
    expect(textOf(renderer.root)).not.toMatch(/Ghi nhận sau sửa|Thêm bằng chứng AFTER mẫu|Demo:/i);
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.findAll((node) => node === panel[0])).toHaveLength(1);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(48);
    expectNoSensitiveEffects();
  });
});
