import React from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  arrivalVerified: false,
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


describe('T-NATIVE-05A real EN_ROUTE prearrival presentation', () => {
  it.each([false, undefined])('presents the canonical locator only before verified arrival (%s)', async (arrivalVerified) => {
    getDetail.mockResolvedValue({ ...travelOrder, arrivalVerified });
    const renderer = await renderScreen();
    const panel = byId(renderer, 'checkin-prearrival');
    expect(panel).toHaveLength(1);
    const copy = textOf(panel[0]);
    expect(copy).toContain('Đến nơi, xác nhận rõ');
    expect(copy).toContain('Check-in tại điểm làm việc');
    expect(copy).toContain('Không theo dõi vị trí liên tục.');
    expect(copy).not.toMatch(/đã xác minh|được chấp nhận|hoàn thành|đã cấp quyền|GPS|ETA|\d+\s*(km|m)\b/i);
    const art = byId(renderer, 'checkin-locator-art')[0];
    expect(art.props.accessible).toBe(false);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(StyleSheet.flatten(art.props.style).minHeight).toBeGreaterThanOrEqual(200);
    expectNoSensitiveEffects();
    expect(Location.hasServicesEnabledAsync).not.toHaveBeenCalled();
  });

  it('keeps permission and arrival unchecked with three truthful readiness rows', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    const rows = byId(renderer, 'checkin-prearrival')[0].findAll((node) => node.type === View && node.props.testID?.startsWith('checkin-readiness-'));
    expect(rows.map(textOf)).toEqual([
      'Đang di chuyển',
      'Ứng dụng sẽ hỏi quyền vị trí khi check-in',
      'Chưa xác minh đến nơi',
    ]);
    // Only the server EN_ROUTE row carries a check; other icons are neutral circles.
    expect(rows[0].findAll((node) => node.type === View && node.props.testID === 'checkin-travel-checked')).toHaveLength(1);
    for (const row of rows.slice(1)) {
      expect(row.findAll((node) => node.type === View && node.props.testID === 'checkin-travel-checked')).toHaveLength(0);
    }
  });

  it('keeps scalable 12pt+ copy and the single existing 44pt+ action in safe scroll content', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    const panel = byId(renderer, 'checkin-prearrival')[0];
    for (const text of panel.findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    expect(panel.findAllByType(TouchableOpacity)).toHaveLength(0);
    const cta = button(renderer, 'Check-in tại nhà khách');
    expect(cta).toHaveLength(1);
    const controls = renderer.root.findAllByType(TouchableOpacity);
    expect(controls.filter((node) => /check-in/i.test(node.props.accessibilityLabel ?? ''))).toHaveLength(1);
    const style = StyleSheet.flatten(cta[0].props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.findAll((node) => node === panel)).toHaveLength(1);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(48);
    expect(textOf(renderer.root)).toContain(travelOrder.serviceName);
    expect(textOf(renderer.root)).toContain(travelOrder.addressSummary);
    expect(textOf(renderer.root)).toContain('Bước tiếp theo');
    expectNoSensitiveEffects();
  });

  it('skips prearrival and check-in once the authorized GET verifies arrival, keeping before-photo priority', async () => {
    getDetail.mockResolvedValue({ ...travelOrder, arrivalVerified: true });
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(button(renderer, 'Chụp ảnh trước sửa chữa ngay')).toHaveLength(1);
    expect(textOf(renderer.root)).toContain('Đang di chuyển');
    expectNoSensitiveEffects();
  });

  it('reveals no prearrival or private data while the authorized GET is pending', async () => {
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
    await act(async () => pending.resolve(travelOrder));
    await flush();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
  });

  it.each(['offline', 401, 403, 404])('shows no prearrival or private data after GET failure %s', async (failure) => {
    getDetail.mockRejectedValue(failure === 'offline' ? new Error('offline') : { response: { status: failure } });
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.addressSummary);
    expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
  });

  it.each(['history', 'wrong-id', 'absent'])('suppresses private prearrival from %s detail', async (kind) => {
    getDetail.mockResolvedValue((kind === 'history' ? { ...travelOrder, historical: true }
      : kind === 'wrong-id' ? { ...travelOrder, id: '33333333-3333-4333-8333-333333333333' } : null) as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.addressSummary);
    expect(ordersApi.getEvidence).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('removes prearrival and private fields on historical refresh', async () => {
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    getDetail.mockResolvedValueOnce({ ...travelOrder, historical: true });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
  });

  it('removes prearrival on session revocation and ignores late private GET', async () => {
    const renderer = await renderScreen();
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await act(async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(travelOrder));
    await flush();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it.each(['ACCEPTED', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED', 'UNKNOWN'])('does not add a check-in panel or action to %s', async (status) => {
    getDetail.mockResolvedValue({ ...travelOrder, status } as never);
    const renderer = await renderScreen();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(textOf(renderer.root)).toContain(travelOrder.serviceName);
    if (status === 'ACCEPTED') expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    if (status === 'UNDER_REPAIR') expect(button(renderer, 'Chụp ảnh sau sửa từ bước tiếp theo')).toHaveLength(1);
    if (status === 'COMPLETED') expect(textOf(renderer.root)).toContain('Nghiệm thu');
    expectNoSensitiveEffects();
  });

  it.each(['denied', 'unavailable'])('keeps arrival unverified when mocked location is %s on tap', async (permission) => {
    if (permission === 'denied') jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
    else jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
    const renderer = await renderScreen();
    expectNoSensitiveEffects();
    await act(async () => { void button(renderer, 'Check-in tại nhà khách')[0].props.onPress(); });
    await flush();
    expect(ordersApi.checkIn).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    expect(textOf(byId(renderer, 'checkin-prearrival')[0])).toContain('Chưa xác minh đến nơi');
    expect(button(renderer, 'Check-in tại nhà khách')[0].props.disabled).toBe(false);
  });

  it('delegates one tap to the real guarded controller, blocks duplicates, and never treats POST as arrival', async () => {
    const permission = deferred<{ status: string }>();
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReturnValueOnce(permission.promise as never);
    const renderer = await renderScreen();
    expectNoSensitiveEffects();
    await act(async () => { void button(renderer, 'Check-in tại nhà khách')[0].props.onPress(); });
    expect(button(renderer, 'Check-in tại nhà khách')[0].props.disabled).toBe(true);
    await act(async () => { void button(renderer, 'Check-in tại nhà khách')[0].props.onPress(); });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ordersApi.checkIn).not.toHaveBeenCalled();
    await act(async () => permission.resolve({ status: 'granted' }));
    await flush();
    expect(ordersApi.checkIn).toHaveBeenCalledTimes(1);
    expect(ordersApi.checkIn).toHaveBeenCalledWith(ORDER_ID, { lat: 0, lng: 0, accuracyMeters: 8 });
    expect(ordersApi.getOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    expect(textOf(byId(renderer, 'checkin-prearrival')[0])).toContain('Chưa xác minh đến nơi');
    expect(textOf(renderer.root)).toContain('Đang di chuyển');
    expect(Alert.alert).not.toHaveBeenCalledWith('Đã xác minh check-in', expect.anything());
    await act(async () => { void button(renderer, 'Check-in tại nhà khách')[0].props.onPress(); });
    await flush();
    expect(ordersApi.checkIn).toHaveBeenCalledTimes(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('removes prearrival only after fresh verified GET and leaves EN_ROUTE intact', async () => {
    const readback = deferred<typeof travelOrder>();
    jest.mocked(ordersApi.getOrder).mockReturnValueOnce(readback.promise);
    const renderer = await renderScreen();
    await act(async () => { void button(renderer, 'Check-in tại nhà khách')[0].props.onPress(); });
    expect(ordersApi.checkIn).toHaveBeenCalledTimes(1);
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(1);
    expect(Alert.alert).not.toHaveBeenCalledWith('Đã xác minh check-in', expect.anything());
    const verified = { ...travelOrder, arrivalVerified: true, technician: { ...travelOrder.technician, id: mockAuthState.user.id } };
    getDetail.mockResolvedValue(verified);
    await act(async () => readback.resolve(verified));
    await flush();
    expect(byId(renderer, 'checkin-prearrival')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(0);
    expect(button(renderer, 'Chụp ảnh trước sửa chữa ngay')).toHaveLength(1);
    expect(textOf(renderer.root)).toContain('Đang di chuyển');
    expect(ordersApi.startRepair).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
