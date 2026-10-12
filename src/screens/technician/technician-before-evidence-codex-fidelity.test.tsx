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
const travelOrder = {
  id: ORDER_ID,
  code: 'SO-TEST-042',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Kiểm tra đường ống thử nghiệm',
  status: 'EN_ROUTE' as const,
  arrivalVerified: true,
  beforeEvidenceCount: 0,
  pricingMode: 'inspection_required',
  technician: { id: 'tech-test', fullName: 'Kỹ thuật viên kiểm thử', phoneNumber: '', averageRating: null },
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
  getDetail.mockReset().mockResolvedValue({ ...travelOrder });
  jest.mocked(ordersApi.getOrder).mockReset().mockResolvedValue({ ...travelOrder, technician: { ...travelOrder.technician, id: mockAuthState.user.id } });
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



describe('T-NATIVE-06A authorized native BEFORE overview', () => {
  it('shows server-verified arrival and an honest empty BEFORE overview without advancing EN_ROUTE', async () => {
    const renderer = await renderScreen();
    expect(getDetail).toHaveBeenCalledWith(ORDER_ID);
    const panel = byId(renderer, 'before-evidence-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Đã xác minh đến nơi');
    expect(textOf(panel[0])).toContain('Tình trạng trước sửa');
    expect(textOf(panel[0])).toContain('BEFORE');
    expect(textOf(panel[0])).toContain('Chưa ghi nhận ảnh trước sửa');
    expect(textOf(renderer.root)).toContain('Đang di chuyển');
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(button(renderer, 'Chụp ảnh trước sửa chữa ngay')).toHaveLength(1);
    expect(panel[0].findAllByType(Image)).toHaveLength(0);
    expect(textOf(panel[0])).not.toMatch(/mẫu|demo|CHECKED_IN|đã tải|đã thanh toán|\d+\s*₫/i);
    expectNoSensitiveEffects();
  });

  it.each([1, 3])('reads %s recorded BEFORE photos only from the order, not an empty evidence list', async (count) => {
    getDetail.mockResolvedValue({ ...travelOrder, beforeEvidenceCount: count });
    const renderer = await renderScreen();
    const panel = byId(renderer, 'before-evidence-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain(`Đã ghi nhận ${count} ảnh trước sửa`);
    expect(textOf(panel[0])).not.toContain('Chưa ghi nhận');
    expect(panel[0].findAllByType(Image)).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each([0, null, undefined, -1, NaN, Infinity, -Infinity, '2', true])('does not invent uploaded evidence from invalid/empty count %s', async (count) => {
    getDetail.mockResolvedValue({ ...travelOrder, beforeEvidenceCount: count } as never);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'before-evidence-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Chưa ghi nhận ảnh trước sửa');
    expect(textOf(panel[0])).not.toMatch(/Đã ghi nhận|đã tải|Infinity|NaN/);
    expectNoSensitiveEffects();
  });

  it.each([false, undefined, null, 'true', 1])('does not infer arrival verification from %s', async (arrivalVerified) => {
    getDetail.mockResolvedValue({ ...travelOrder, arrivalVerified } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each(['ACCEPTED', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED', 'UNKNOWN', 'en_route', 'CHECKED_IN'])('preserves %s without the new overview', async (status) => {
    getDetail.mockResolvedValue({ ...travelOrder, status } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain(travelOrder.serviceName);
    if (status === 'ACCEPTED') expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    if (status === 'UNDER_REPAIR') {
      await act(async () => button(renderer, 'Ảnh sau & bàn giao')[0].props.onPress());
      expect(button(renderer, 'Chụp ảnh sau sửa từ bước tiếp theo')).toHaveLength(1);
    }
    if (status === 'COMPLETED') expect(textOf(renderer.root)).toContain('Nghiệm thu');
    expectNoSensitiveEffects();
  });

  it.each(['offline', 401, 403, 404])('reveals no overview or private data on GET failure %s', async (failure) => {
    getDetail.mockRejectedValue(failure === 'offline' ? new Error('offline') : { response: { status: failure } });
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
  });

  it.each(['history', 'wrong-id', 'absent'])('rejects %s detail without overview or evidence reads', async (kind) => {
    getDetail.mockResolvedValue((kind === 'history' ? { ...travelOrder, historical: true }
      : kind === 'wrong-id' ? { ...travelOrder, id: '33333333-3333-4333-8333-333333333333' } : null) as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.addressSummary);
    expect(ordersApi.getEvidence).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('does not GET or display the overview for an invalid route ID', async () => {
    mockRouteId = 'not-a-service-order';
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('waits for a fresh authorized GET before presenting arrival', async () => {
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expectNoSensitiveEffects();
    await act(async () => pending.resolve(travelOrder));
    await flush();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404, 'history'])('removes existing overview on revoked refresh %s', async (failure) => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(1);
    if (failure === 'history') getDetail.mockResolvedValueOnce({ ...travelOrder, historical: true });
    else getDetail.mockRejectedValueOnce({ response: { status: failure } });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
  });

  it('ignores late verified GET after session ownership is revoked', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(1);
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await act(async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(travelOrder));
    await flush();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it('shows no overview when the session is unauthenticated', async () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: false };
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each([
    ['fixed_price', 'Giá cố định'],
    ['inspection_required', 'Cần khảo sát và báo giá'],
    [undefined, null], [null, null], ['unknown', null], ['FIXED_PRICE', null],
  ])('shows only the read-only pricing label authorized by %s', async (pricingMode, label) => {
    getDetail.mockResolvedValue({ ...travelOrder, pricingMode } as never);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'before-evidence-overview');
    expect(panel).toHaveLength(1);
    const pricing = byId(renderer, 'before-evidence-pricing');
    expect(pricing).toHaveLength(label ? 1 : 0);
    if (label) expect(textOf(pricing[0])).toBe(label);
    expect(panel[0].findAllByType(TouchableOpacity)).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each(['SENT', 'APPROVED'])('keeps the existing %s quotation and its action priority', async (status) => {
    getDetail.mockResolvedValue({ ...travelOrder, beforeEvidenceCount: 2, quotation: {
      id: 'quotation-test', status, laborTotal: 0, partsTotal: 0,
      items: [{ type: 'LABOR', description: 'Phạm vi đã lưu trong báo giá kiểm thử', quantity: 1, unitPrice: 0, lineTotal: 0 }],
    } } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(1);
    expect(button(renderer, 'Báo giá')).toHaveLength(1);
    expect(textOf(renderer.root)).toContain('Phạm vi đã lưu trong báo giá kiểm thử');
    expect(button(renderer, 'Chụp ảnh trước sửa chữa ngay')).toHaveLength(0);
    if (status === 'SENT') expect(textOf(renderer.root)).toContain('Đang chờ khách duyệt báo giá.');
    else {
      expect(button(renderer, 'Cập nhật từ hệ thống')).toHaveLength(1);
      expect(button(renderer, 'Bắt đầu sửa chữa')).toHaveLength(1);
    }
    expectNoSensitiveEffects();
  });

  it('keeps scalable text, a decorative placeholder and one 44pt capture CTA inside safe scroll', async () => {
    const renderer = await renderScreen();
    const panel = byId(renderer, 'before-evidence-overview');
    expect(panel).toHaveLength(1);
    expect(panel[0].findAllByType(TouchableOpacity)).toHaveLength(0);
    for (const text of panel[0].findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    const placeholder = byId(renderer, 'before-evidence-placeholder')[0];
    expect(placeholder.props.accessible).toBe(false);
    expect(placeholder.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(StyleSheet.flatten(placeholder.props.style).minHeight).toBeGreaterThanOrEqual(200);
    const cta = button(renderer, 'Chụp ảnh trước sửa chữa ngay');
    expect(cta).toHaveLength(1);
    expect(StyleSheet.flatten(cta[0].props.style).minHeight).toBeGreaterThanOrEqual(44);
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.findAll((node) => node === panel[0])).toHaveLength(1);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(48);
    expectNoSensitiveEffects();
  });

  it.each([0, 2])('keeps local pending and ambiguous uploads separate from server count %s', async (count) => {
    getDetail.mockResolvedValue({ ...travelOrder, beforeEvidenceCount: count });
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{
      uri: 'file:///test-only-before.jpg', mimeType: 'image/jpeg', fileSize: 2048,
    }] } as never);
    jest.mocked(ordersApi.uploadEvidenceBefore).mockRejectedValue(new Error('timeout'));
    const renderer = await renderScreen();
    expect(byId(renderer, 'before-evidence-overview')).toHaveLength(1);
    expectNoSensitiveEffects();
    if (count) {
      await act(async () => button(renderer, 'Ảnh trước sửa chữa')[0].props.onPress());
    }
    await act(async () => button(renderer, 'Chụp ảnh trước sửa chữa')[0].props.onPress());
    await flush();
    const expected = count ? 'Đã ghi nhận 2 ảnh trước sửa' : 'Chưa ghi nhận ảnh trước sửa';
    expect(textOf(byId(renderer, 'before-evidence-overview')[0])).toContain(expected);
    expect(textOf(byId(renderer, 'before-evidence-overview')[0])).toContain('Ảnh đã chọn trên máy chưa được xác minh tải lên.');
    expect(button(renderer, 'Tải ảnh trước sửa chữa lên')).toHaveLength(1);
    expect(button(renderer, 'Chụp ảnh trước sửa chữa ngay')).toHaveLength(0);
    expect(ordersApi.uploadEvidenceBefore).not.toHaveBeenCalled();
    await act(async () => button(renderer, 'Tải ảnh trước sửa chữa lên')[0].props.onPress());
    await flush();
    expect(ordersApi.uploadEvidenceBefore).toHaveBeenCalledTimes(1);
    expect(button(renderer, 'Kiểm tra bằng chứng trước sửa chữa')).toHaveLength(1);
    expect(button(renderer, 'Tải ảnh trước sửa chữa lên')).toHaveLength(0);
    const panel = byId(renderer, 'before-evidence-overview')[0];
    expect(textOf(panel)).toContain(expected);
    expect(textOf(panel)).toContain('Lần tải ảnh trước đang chờ xác minh.');
    expect(panel.findAllByType(Image)).toHaveLength(0);
    // A saved count is neutral information, never a green upload-success receipt.
    const countText = panel.findAllByType(Text).find((node) => textOf(node) === expected);
    expect(countText).toBeDefined();
    expect(StyleSheet.flatten(countText!.props.style).color).toBe('#0F172A');
    // GET-only reconciliation preserves the existing no-repost lock.
    await act(async () => button(renderer, 'Kiểm tra bằng chứng trước sửa chữa')[0].props.onPress());
    await flush();
    expect(ordersApi.uploadEvidenceBefore).toHaveBeenCalledTimes(1);
    expect(button(renderer, 'Kiểm tra bằng chứng trước sửa chữa')).toHaveLength(1);
    expect(ordersApi.createQuotation).not.toHaveBeenCalled();
    expect(ordersApi.startRepair).not.toHaveBeenCalled();
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
