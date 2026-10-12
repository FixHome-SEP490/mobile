import React from 'react';
import { Alert, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteId = ORDER_ID;
  mockAuthState = { isAuthenticated: true, user: { id: 'tech-test', role: 'technician' } };
  getDetail.mockReset().mockResolvedValue({ ...acceptedOrder });
  jest.mocked(ordersApi.enRoute).mockReset().mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => { renderers.splice(0).forEach((renderer) => renderer.unmount()); });
  mockAuthListeners.clear();
  jest.restoreAllMocks();
});

describe('T-NATIVE-04A accepted order presentation through the real detail loader', () => {
  it('places a decorative hero before the server badge and real service heading', async () => {
    const renderer = await renderScreen();
    const hero = byId(renderer, 'accepted-order-hero');
    expect(hero).toHaveLength(1);
    const art = byId(renderer, 'accepted-order-art')[0];
    expect(art.props.accessible).toBe(false);
    expect(StyleSheet.flatten(art.props.style).minHeight).toBeGreaterThanOrEqual(144);
    const text = textOf(hero[0]);
    expect(text.indexOf('Đã nhận đơn')).toBeLessThan(text.indexOf(acceptedOrder.serviceName));
    expect(text).toContain(acceptedOrder.code);
    const heading = hero[0].findAll((node) => node.type === Text && node.props.accessibilityRole === 'header');
    expect(heading).toHaveLength(1);
    expect(heading[0].props.children).toBe(acceptedOrder.serviceName);
    expect(StyleSheet.flatten(heading[0].props.style).fontSize).toBeGreaterThanOrEqual(24);
    expectNoSensitiveEffects();
  });

  it('separates verified customer, full address, Vietnam time and scope into labelled paper rows', async () => {
    const renderer = await renderScreen();
    const paper = byId(renderer, 'accepted-order-information');
    expect(paper).toHaveLength(1);
    const rows = paper[0].findAll((node) => node.type === View && node.props.testID?.startsWith('accepted-order-row-'));
    expect(rows.map((row) => textOf(row))).toEqual([
      'Khách hàng\nKhách kiểm thử',
      'Địa chỉ thực hiện\nĐịa chỉ kiểm thử có nhiều dòng và nội dung dài',
      'Lịch hẹn\n10:00 21/10/2030',
      'Phạm vi công việc\nKiểm tra chỗ rò nước theo yêu cầu kiểm thử',
    ]);
    for (const row of rows) {
      for (const text of row.findAllByType(Text)) {
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.allowFontScaling).not.toBe(false);
        expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      }
    }
    expectNoSensitiveEffects();
  });

  it('omits missing personal data and code without substituting an ID or sample information', async () => {
    getDetail.mockResolvedValue({ ...acceptedOrder, code: '', serviceName: '', customerName: '', addressSummary: '', scheduledAt: '', scopeDescription: '' });
    const renderer = await renderScreen();
    const hero = byId(renderer, 'accepted-order-hero');
    expect(hero).toHaveLength(1);
    expect(textOf(hero[0])).toContain('Dịch vụ sửa chữa');
    expect(textOf(renderer.root)).not.toContain(ORDER_ID.slice(0, 8));
    expect(byId(renderer, 'accepted-order-information')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('does not present demo identities, dates, payment claims, GPS or a demo action', async () => {
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).not.toMatch(/SO-DEMO|Linh|Quận\s*3|Đường Mẫu|Sự kiện mẫu|Khách mẫu|Ngày mẫu|DEMO|Sửa điều hòa|90%|ETA|GPS đã|đã thanh toán/i);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it('keeps the original next-step, contact, chat and back controls with accessible touch targets', async () => {
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Bước tiếp theo');
    expect(textOf(renderer.root)).toContain('Liên hệ nhanh');
    for (const label of ['Quay lại', 'Bắt đầu di chuyển', 'Nhắn tin với khách hàng', 'Chỉ đường đến địa chỉ khách hàng']) {
      const controls = button(renderer, label);
      expect(controls).toHaveLength(1);
      const style = StyleSheet.flatten(controls[0].props.style);
      expect(Math.max(style.height ?? 0, style.minHeight ?? 0)).toBeGreaterThanOrEqual(44);
    }
    await act(async () => button(renderer, 'Quay lại')[0].props.onPress());
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expectNoSensitiveEffects();
  });

  it('shows loading without accepted status or private fields until a full GET resolves', async () => {
    const pending = deferred<typeof acceptedOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Đang tải chi tiết công việc…');
    expect(textOf(renderer.root)).not.toContain('Đã nhận đơn');
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.customerName);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    await act(async () => pending.resolve(acceptedOrder));
    await flush();
    expect(textOf(renderer.root)).toContain(acceptedOrder.customerName);
    expect(getDetail).toHaveBeenCalledWith(ORDER_ID);
    expectNoSensitiveEffects();
  });

  it('recovers a failed GET only through retry and reveals data after the successful read', async () => {
    getDetail.mockRejectedValueOnce(new Error('offline'));
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Không thể tải chi tiết đơn. Vui lòng thử lại.');
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.addressSummary);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    await act(async () => button(renderer, 'Thử tải lại chi tiết công việc')[0].props.onPress());
    await flush();
    expect(getDetail).toHaveBeenCalledTimes(2);
    expect(textOf(renderer.root)).toContain(acceptedOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404])('suppresses the accepted UI after HTTP %i', async (status) => {
    getDetail.mockRejectedValue({ response: { status } });
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Không xem được công việc');
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.customerName);
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.addressSummary);
    expect(byId(renderer, 'accepted-order-hero')).toHaveLength(0);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each(['history', 'wrong-id', 'no-order'])('does not reveal full detail from a %s response', async (kind) => {
    const response = kind === 'history' ? { ...acceptedOrder, historical: true }
      : kind === 'wrong-id' ? { ...acceptedOrder, id: '33333333-3333-4333-8333-333333333333' } : null;
    getDetail.mockResolvedValue(response as never);
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Không xem được công việc');
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.customerName);
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.addressSummary);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expect(ordersApi.getEvidence).not.toHaveBeenCalled();
    expect(ordersApi.getInvoice).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('rejects an invalid route without any order GET', async () => {
    mockRouteId = 'SO-DEMO-001';
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Mã đơn dịch vụ không hợp lệ.');
    expect(getDetail).not.toHaveBeenCalled();
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('rejects an unauthenticated session before fetching private detail', async () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: false };
    const renderer = await renderScreen();
    expect(textOf(renderer.root)).toContain('Không có quyền xem đơn dịch vụ.');
    expect(getDetail).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('clears private detail when ownership changes and rejects a late full GET', async () => {
    const renderer = await renderScreen();
    const pending = deferred<typeof acceptedOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => { renderer.root.findByType(RefreshControl).props.onRefresh(); });
    await act(async () => {
      mockAuthState = { ...mockAuthState, user: { id: 'other-tech', role: 'technician' } };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(acceptedOrder));
    await flush();
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.addressSummary);
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.customerName);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('clears accepted private fields when refresh returns a historical summary', async () => {
    const renderer = await renderScreen();
    getDetail.mockResolvedValueOnce({ ...acceptedOrder, historical: true });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(textOf(renderer.root)).toContain('chỉ còn tóm tắt lưu trữ');
    expect(textOf(renderer.root)).not.toContain(acceptedOrder.addressSummary);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('delegates travel to the existing handler once, stays disabled while pending, and waits for GET status', async () => {
    const pending = deferred<Record<string, unknown>>();
    jest.mocked(ordersApi.enRoute).mockReturnValueOnce(pending.promise);
    const renderer = await renderScreen();
    await act(async () => { button(renderer, 'Bắt đầu di chuyển')[0].props.onPress(); });
    expect(ordersApi.enRoute).toHaveBeenCalledTimes(1);
    expect(ordersApi.enRoute).toHaveBeenCalledWith(ORDER_ID);
    expect(button(renderer, 'Bắt đầu di chuyển')[0].props.disabled).toBe(true);
    await act(async () => { button(renderer, 'Bắt đầu di chuyển')[0].props.onPress(); });
    expect(ordersApi.enRoute).toHaveBeenCalledTimes(1);
    expect(textOf(renderer.root)).toContain('Đã nhận đơn');
    getDetail.mockResolvedValueOnce({ ...acceptedOrder, status: 'EN_ROUTE' });
    await act(async () => pending.resolve({}));
    await flush();
    expect(textOf(renderer.root)).toContain('Đang di chuyển');
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expect(button(renderer, 'Check-in tại nhà khách')).toHaveLength(1);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not simulate travel success after a failed mutation', async () => {
    jest.mocked(ordersApi.enRoute).mockRejectedValueOnce(new Error('offline'));
    const renderer = await renderScreen();
    await act(async () => button(renderer, 'Bắt đầu di chuyển')[0].props.onPress());
    expect(textOf(renderer.root)).toContain('Đã nhận đơn');
    expect(textOf(renderer.root)).not.toContain('Đang di chuyển');
    expect(getDetail).toHaveBeenCalledTimes(1);
    expect(button(renderer, 'Bắt đầu di chuyển')[0].props.disabled).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Lỗi', expect.any(String));
  });

  it.each([
    ['EN_ROUTE', 'Đang di chuyển', 'Check-in tại nhà khách'],
    ['UNDER_REPAIR', 'Đang sửa chữa', 'Đã yêu cầu hoàn thành'],
    ['COMPLETED', 'Hoàn thành', 'Nghiệm thu'],
    ['CANCELLED', 'Đã hủy', 'Dịch vụ sửa chữa'],
  ] as const)('keeps the existing %s overview and phase controls', async (status, label, phaseText) => {
    getDetail.mockResolvedValue({ ...acceptedOrder, status, completionRequestedAt: status === 'UNDER_REPAIR' ? '2030-10-21T04:00:00Z' : undefined, serviceName: 'Dịch vụ sửa chữa' });
    const renderer = await renderScreen();
    const text = textOf(renderer.root);
    expect(text).toContain(label);
    expect(text).toContain(phaseText);
    expect(text).toContain('Khách: Khách kiểm thử');
    expect(text).toContain('#SO-TEST-042');
    expect(text).toContain('Lịch hẹn: 10:00 21/10/2030');
    expect(byId(renderer, 'accepted-order-hero')).toHaveLength(0);
    expect(byId(renderer, 'accepted-order-information')).toHaveLength(0);
    expect(button(renderer, 'Bắt đầu di chuyển')).toHaveLength(0);
    expectNoSensitiveEffects();
  });
});
