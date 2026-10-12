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
const repairOrder = {
  id: ORDER_ID,
  code: 'SO-TEST-107',
  bookingId: '22222222-2222-4222-8222-222222222222',
  serviceName: 'Sửa điều hòa thử nghiệm',
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
  scopeDescription: 'Sửa điều hòa không lạnh theo yêu cầu kiểm thử',
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
  getDetail.mockReset().mockResolvedValue({ ...repairOrder });
  jest.mocked(ordersApi.getOrder).mockReset().mockResolvedValue({ ...repairOrder, technician: { ...repairOrder.technician, id: mockAuthState.user.id } });
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

describe('T-NATIVE-07A authorized native UNDER_REPAIR overview', () => {
  it('shows the pale-blue wrench hero with three checked rows on verified fixed_price order', async () => {
    const renderer = await renderScreen();
    expect(getDetail).toHaveBeenCalledWith(ORDER_ID);
    const panel = byId(renderer, 'repair-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(panel[0])).toContain('Đang sửa chữa');
    expect(textOf(panel[0])).toContain('Một công việc đang mở');
    expect(textOf(panel[0])).toContain('Không có bộ đếm thời gian giả');
    expect(textOf(panel[0])).toContain('Mã đơn: SO-TEST-107');
    expect(textOf(byId(renderer, 'repair-readiness-before')[0])).toContain('Đã ghi nhận 2 ảnh trước sửa');
    expect(textOf(byId(renderer, 'repair-readiness-pricing')[0])).toContain('Giá cố định theo đơn');
    expect(textOf(byId(renderer, 'repair-readiness-started')[0])).toContain('Đã bắt đầu sửa chữa');
    expect(byId(renderer, 'repair-before-checked')).toHaveLength(1);
    expect(byId(renderer, 'repair-pricing-checked')).toHaveLength(1);
    expect(byId(renderer, 'repair-started-checked')).toHaveLength(1);
    expect(panel[0].findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(panel[0].findAllByType(Image)).toHaveLength(0);
    expect(textOf(panel[0])).not.toMatch(/SO-DEMO|mẫu|demo|₫|đã thanh toán|đã nhận tiền/i);
    expectNoSensitiveEffects();
  });

  it.each([1, 3])('reads %s recorded BEFORE photos only from the order, not local selection', async (count) => {
    getDetail.mockResolvedValue({ ...repairOrder, beforeEvidenceCount: count });
    const renderer = await renderScreen();
    const panel = byId(renderer, 'repair-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(byId(renderer, 'repair-readiness-before')[0])).toContain(`Đã ghi nhận ${count} ảnh trước sửa`);
    expect(byId(renderer, 'repair-before-checked')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each([0, null, undefined, -1, NaN, Infinity, -Infinity, '2', true])('leaves BEFORE unchecked for invalid/empty count %s', async (count) => {
    getDetail.mockResolvedValue({ ...repairOrder, beforeEvidenceCount: count } as never);
    const renderer = await renderScreen();
    const panel = byId(renderer, 'repair-overview');
    expect(panel).toHaveLength(1);
    expect(textOf(byId(renderer, 'repair-readiness-before')[0])).toContain('Chưa ghi nhận ảnh trước sửa');
    expect(byId(renderer, 'repair-before-checked')).toHaveLength(0);
    expect(textOf(panel[0])).not.toMatch(/Đã ghi nhận|Infinity|NaN/);
    expectNoSensitiveEffects();
  });

  it('marks inspection pricing checked only on explicit quotation APPROVED', async () => {
    getDetail.mockResolvedValue({
      ...repairOrder,
      pricingMode: 'inspection_required',
      quotation: {
        id: 'quotation-test', status: 'APPROVED', laborTotal: 0, partsTotal: 0,
        items: [{ type: 'LABOR', description: 'Phạm vi đã lưu trong báo giá kiểm thử', quantity: 1, unitPrice: 0, lineTotal: 0 }],
      },
    } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    expect(textOf(byId(renderer, 'repair-readiness-pricing')[0])).toContain('Báo giá đã được khách duyệt');
    expect(byId(renderer, 'repair-pricing-checked')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each(['SENT', 'REJECTED', 'DRAFT', undefined])('rejects inspection pricing without approval (%s)', async (status) => {
    getDetail.mockResolvedValue({
      ...repairOrder,
      pricingMode: 'inspection_required',
      ...(status === undefined ? {} : {
        quotation: {
          id: 'quotation-test', status, laborTotal: 0, partsTotal: 0,
          items: [{ type: 'LABOR', description: 'Phạm vi đã lưu trong báo giá kiểm thử', quantity: 1, unitPrice: 0, lineTotal: 0 }],
        },
      }),
    } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    expect(textOf(byId(renderer, 'repair-readiness-pricing')[0])).toContain('Chưa có báo giá được duyệt');
    expect(byId(renderer, 'repair-pricing-checked')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each([undefined, null, 'unknown', 'hourly'])('stays pricing-neutral for unknown branch %s', async (pricingMode) => {
    getDetail.mockResolvedValue({ ...repairOrder, pricingMode } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    expect(textOf(byId(renderer, 'repair-readiness-pricing')[0])).toContain('Chưa xác định nhánh giá');
    expect(byId(renderer, 'repair-pricing-checked')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each(['ACCEPTED', 'EN_ROUTE', 'COMPLETED', 'CANCELLED', 'UNKNOWN'])('hides the repair hero on %s', async (status) => {
    getDetail.mockResolvedValue({ ...repairOrder, status } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain(repairOrder.serviceName);
    expectNoSensitiveEffects();
  });

  it.each(['offline', 401, 403, 404])('reveals no hero or private data on GET failure %s', async (failure) => {
    getDetail.mockRejectedValue(failure === 'offline' ? new Error('offline') : { response: { status: failure } });
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(repairOrder.customerName);
    expectNoSensitiveEffects();
  });

  it.each(['history', 'wrong-id', 'absent'])('rejects %s detail without hero or evidence reads', async (kind) => {
    getDetail.mockResolvedValue((kind === 'history' ? { ...repairOrder, historical: true }
      : kind === 'wrong-id' ? { ...repairOrder, id: '33333333-3333-4333-8333-333333333333' } : null) as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(repairOrder.addressSummary);
    expect(ordersApi.getEvidence).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('does not GET or display the hero for an invalid route ID', async () => {
    mockRouteId = 'not-a-service-order';
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('waits for a fresh authorized GET before presenting the hero', async () => {
    const pending = deferred<typeof repairOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expectNoSensitiveEffects();
    await act(async () => pending.resolve(repairOrder));
    await flush();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404, 'history'])('removes the existing hero on revoked refresh %s', async (failure) => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    if (failure === 'history') getDetail.mockResolvedValueOnce({ ...repairOrder, historical: true });
    else getDetail.mockRejectedValueOnce({ response: { status: failure } });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(repairOrder.customerName);
    expectNoSensitiveEffects();
  });

  it('ignores late verified GET after session ownership is revoked', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    const pending = deferred<typeof repairOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await act(async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(repairOrder));
    await flush();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(repairOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it('shows no hero when the session is unauthenticated', async () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: false };
    const renderer = await renderScreen();
    expect(getDetail).not.toHaveBeenCalled();
    expect(byId(renderer, 'repair-overview')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('keeps the existing after-evidence single CTA and cost area without a demo CTA', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    expect(button(renderer, 'Chụp ảnh sau sửa từ bước tiếp theo')).toHaveLength(1);
    expect(textOf(renderer.root)).not.toContain('Ghi nhận sau sửa');
    expect(textOf(renderer.root)).toContain('Chi phí phát sinh');
    expect(textOf(renderer.root)).toContain('Chưa có yêu cầu chi phí phát sinh.');
    expect(textOf(renderer.root)).not.toMatch(/SO-DEMO|p\.s\.quote|đã thanh toán \d|1\.250\.000 ₫/i);
    expectNoSensitiveEffects();
  });

  it('still shows the hero after completion was requested, without inventing payment', async () => {
    getDetail.mockResolvedValue({ ...repairOrder, completionRequestedAt: '2030-10-21T04:00:00Z' } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'repair-overview')).toHaveLength(1);
    expect(byId(renderer, 'repair-started-checked')).toHaveLength(1);
    expect(button(renderer, 'Chụp ảnh sau sửa từ bước tiếp theo')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Đã yêu cầu hoàn thành');
    expect(textOf(byId(renderer, 'repair-overview')[0])).not.toMatch(/đã thanh toán|đã hoàn thành|PAID/i);
    expectNoSensitiveEffects();
  });

  it('keeps scalable text, decorative art and safe scroll without an elapsed timer', async () => {
    const renderer = await renderScreen();
    const panel = byId(renderer, 'repair-overview');
    expect(panel).toHaveLength(1);
    for (const text of panel[0].findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    const art = byId(renderer, 'repair-hero-art')[0];
    expect(art.props.accessible).toBe(false);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(textOf(panel[0])).not.toMatch(/\d+\s*(phút|giờ|giây)|đã trôi qua|timer/i);
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.findAll((node) => node === panel[0])).toHaveLength(1);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(48);
    expectNoSensitiveEffects();
  });
});
