import React from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ordersApi } from '../../api/orders.api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as quotationCreate from './technician-quotation-create';

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
  laborTotal: 275000,
  partsTotal: 120000,
  grandTotal: 395000,
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




function branch(renderer: ReturnType<typeof create>) {
  const panels = byId(renderer, 'quotation-price-branch');
  expect(panels).toHaveLength(1);
  return panels[0];
}
function quote(status: unknown) {
  return {
    id: 'quotation-test', status, laborTotal: 275000, partsTotal: 120000,
    items: [{ type: 'LABOR', description: 'Phạm vi báo giá kiểm thử', quantity: 1, unitPrice: 275000, lineTotal: 275000 }],
  };
}
function input(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.findAll((node) => node.type === TextInput && node.props.accessibilityLabel === label)[0];
}
async function tap(renderer: ReturnType<typeof create>, label: string) {
  const controls = button(renderer, label);
  expect(controls).toHaveLength(1);
  await act(async () => controls[0].props.onPress());
  await flush();
}

describe('T-NATIVE-06B1 server-authoritative read-only quotation branch', () => {
  it.each([
    ['fixed_price', 'Giá cố định', 'Cần khảo sát'],
    ['inspection_required', 'Cần khảo sát', 'Giá cố định'],
    ['FIXED_PRICE', 'Giá cố định', 'Cần khảo sát'],
    ['INSPECTION_REQUIRED', 'Cần khảo sát', 'Giá cố định'],
  ])('marks only the server pricing branch %s as current', async (pricingMode, current, other) => {
    getDetail.mockResolvedValue({ ...travelOrder, pricingMode } as never);
    const renderer = await renderScreen();
    const panel = branch(renderer);
    expect(textOf(panel)).toContain(current);
    expect(textOf(panel)).toContain(other);
    const options = panel.findAll((node) => node.type === View && node.props.accessibilityRole === 'text');
    expect(options).toHaveLength(2);
    expect(options.find((node) => node.props.accessibilityLabel.startsWith(current))?.props.accessibilityLabel)
      .toBe(`${current}, áp dụng cho đơn này, chỉ đọc`);
    expect(options.find((node) => node.props.accessibilityLabel.startsWith(other))?.props.accessibilityLabel)
      .toBe(`${other}, không áp dụng cho đơn này, chỉ đọc`);
    expectNoSensitiveEffects();
  });

  it.each([undefined, null, '', 'unknown', 'CHECKED_IN', true])('keeps unrecognized pricing %s neutral', async (pricingMode) => {
    getDetail.mockResolvedValue({ ...travelOrder, pricingMode } as never);
    const renderer = await renderScreen();
    const panel = branch(renderer);
    expect(textOf(panel)).toContain('Chưa xác định nhánh giá');
    expect(textOf(panel)).not.toContain('Đang áp dụng');
    expect(panel.findAll((node) => typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.includes(', áp dụng cho đơn này,'))).toHaveLength(0);
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each([
    ['SENT', 'Chờ khách duyệt', false],
    ['APPROVED', 'Đã duyệt', false],
    ['REJECTED', 'Đã từ chối', true],
    ['SUPERSEDED', 'Đã thay bằng báo giá mới', true],
    ['EXPIRED', 'Đã hết hạn', true],
    ['sent', 'Chờ khách duyệt', false],
    ['unknown', 'Không rõ', true],
    [null, 'Không rõ', true],
  ])('shows GET quotation status %s and preserves editor eligibility', async (status, label, editable) => {
    getDetail.mockResolvedValue({ ...travelOrder, quotation: quote(status) } as never);
    const renderer = await renderScreen();
    const panel = branch(renderer);
    expect(textOf(panel)).toContain('Trạng thái báo giá');
    expect(textOf(panel)).toContain(label);
    expect(textOf(panel)).not.toMatch(/đã thanh toán|đã trả tiền|PAID|mẫu|demo|\d+\s*₫/i);
    if (String(status).toUpperCase() !== 'APPROVED') expect(textOf(panel)).not.toContain('Đã duyệt');
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(editable ? 1 : 0);
    expect(textOf(renderer.root)).toContain('Phạm vi báo giá kiểm thử');
    expect(button(renderer, 'Duyệt báo giá')).toHaveLength(0);
    expect(button(renderer, 'Từ chối báo giá')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('does not manufacture quote status or prices when GET has no quotation', async () => {
    const renderer = await renderScreen();
    const panel = branch(renderer);
    expect(textOf(panel)).not.toMatch(/Trạng thái báo giá|Chờ khách duyệt|Đã duyệt|Đã thanh toán|0\s*₫/i);
    expectNoSensitiveEffects();
  });

  it.each(['sent', 'busy', 'needsVerify'] as const)('does not turn local %s into a customer decision', async (flag) => {
    // Inject local UI state only; the authorized GET still has no quotation.
    // Keep the real controller methods and never invoke submit.
    const createController = quotationCreate.createQuotationCreateController;
    let publish!: Parameters<typeof createController>[1];
    jest.spyOn(quotationCreate, 'createQuotationCreateController').mockImplementation((deps, write) => {
      publish = write;
      return createController(deps, write);
    });
    const renderer = await renderScreen();
    await act(async () => {
      publish({
        ...quotationCreate.initialQuoteState,
        rows: quotationCreate.initialQuoteState.rows.map((row) => ({ ...row, quantity: '1' })),
        [flag]: true,
      });
    });
    expect(textOf(branch(renderer))).not.toMatch(/Trạng thái báo giá|Chờ khách duyệt|Đã duyệt|Đã thanh toán/i);
    if (flag === 'sent') {
      expect(textOf(renderer.root)).toContain('Đã gửi báo giá, chờ khách duyệt.');
      expect(button(renderer, 'Gửi báo giá')).toHaveLength(0);
    } else {
      expect(input(renderer, 'Mô tả dòng 1').props.editable).toBe(false);
      expect(button(renderer, 'Gửi báo giá')[0].props.disabled).toBe(true);
      expect(button(renderer, 'Thêm linh kiện kỹ thuật')[0].props.disabled).toBe(true);
    }
    expectNoSensitiveEffects();
  });

  it('has no toggle, press handler, input or duplicate action in the header', async () => {
    const renderer = await renderScreen();
    const panel = branch(renderer);
    expect(panel.findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(panel.findAllByType(Pressable)).toHaveLength(0);
    expect(panel.findAllByType(TextInput)).toHaveLength(0);
    expect(panel.findAll((node) => typeof node.props.onPress === 'function' ||
      ['button', 'switch', 'radio', 'tab'].includes(node.props.accessibilityRole))).toHaveLength(0);
    expect(panel.findAll((node) => node.props.accessibilityState?.selected !== undefined)).toHaveLength(0);
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it('keeps saved fixed unit price, quantity and scope without a new quote action', async () => {
    getDetail.mockResolvedValue({ ...travelOrder, pricingMode: 'fixed_price', fixedUnitPrice: 275000, quantity: 3 } as never);
    const renderer = await renderScreen();
    branch(renderer);
    expect(textOf(renderer.root)).toMatch(/Đơn giá đã lưu: 275\.000\s₫/);
    expect(textOf(renderer.root)).toContain('Số lượng đã đặt: 3');
    expect(textOf(renderer.root)).toContain(travelOrder.scopeDescription);
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it.each([false, null, undefined])('keeps the arrival gate %s closed after opening the quotation card', async (arrivalVerified) => {
    getDetail.mockResolvedValue({ ...travelOrder, arrivalVerified } as never);
    const renderer = await renderScreen();
    await tap(renderer, 'Báo giá');
    branch(renderer);
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(0);
    expect(input(renderer, 'Mô tả dòng 1')).toBeUndefined();
    expectNoSensitiveEffects();
  });

  it.each(['ACCEPTED', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'])('does not unlock quote creation for lifecycle %s', async (status) => {
    getDetail.mockResolvedValue({ ...travelOrder, status } as never);
    const renderer = await renderScreen();
    await tap(renderer, 'Báo giá');
    branch(renderer);
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(0);
    expectNoSensitiveEffects();
  });

  it('preserves labor, parts, warranty, note and confirmation without POST', async () => {
    const renderer = await renderScreen();
    branch(renderer);
    await tap(renderer, 'Thêm linh kiện kỹ thuật');
    expect(input(renderer, 'Thời hạn bảo hành dòng 2')).toBeDefined();
    await act(async () => {
      input(renderer, 'Mô tả dòng 1').props.onChangeText('Công kiểm thử');
      input(renderer, 'Đơn giá dòng 1').props.onChangeText('275000');
      input(renderer, 'Mô tả dòng 2').props.onChangeText('Linh kiện kiểm thử');
      input(renderer, 'Đơn giá dòng 2').props.onChangeText('120000');
      input(renderer, 'Thời hạn bảo hành dòng 2').props.onChangeText('30');
      input(renderer, 'Ghi chú báo giá').props.onChangeText('Ghi chú kiểm thử');
    });
    await tap(renderer, 'Tăng số lượng dòng 2');
    await tap(renderer, 'Gửi báo giá');
    expect(button(renderer, 'Xác nhận gửi báo giá')).toHaveLength(1);
    expect(textOf(renderer.root)).toContain('Chi phí dự kiến:');
    expect(textOf(renderer.root)).toContain('đề xuất, chưa thanh toán');
    expect(input(renderer, 'Ghi chú báo giá').props.value).toBe('Ghi chú kiểm thử');
    expect(textOf(branch(renderer))).not.toMatch(/Chờ khách duyệt|Đã duyệt|\d+\s*₫/);
    expectNoSensitiveEffects();
    await tap(renderer, 'Sửa lại báo giá');
    expect(button(renderer, 'Xác nhận gửi báo giá')).toHaveLength(0);
    expect(button(renderer, 'Gửi báo giá')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it('waits for authorized current GET rather than showing a branch while loading', async () => {
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValue(pending.promise);
    const renderer = await renderScreen();
    expect(byId(renderer, 'quotation-price-branch')).toHaveLength(0);
    expectNoSensitiveEffects();
    await act(async () => pending.resolve(travelOrder));
    await flush();
    branch(renderer);
    expectNoSensitiveEffects();
  });

  it('hides the previous branch while refreshing and then uses the current GET mode', async () => {
    const renderer = await renderScreen();
    branch(renderer);
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    expect(byId(renderer, 'quotation-price-branch')).toHaveLength(0);
    await act(async () => pending.resolve({ ...travelOrder, pricingMode: 'fixed_price' }));
    await flush();
    expect(branch(renderer).findAll((node) => node.type === View &&
      node.props.accessibilityLabel === 'Giá cố định, áp dụng cho đơn này, chỉ đọc')).toHaveLength(1);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404, 500, 'history', 'wrong-order'])('hides private price and quote on initial %s', async (failure) => {
    if (failure === 'history') getDetail.mockResolvedValue({ ...travelOrder, historical: true, quotation: quote('APPROVED') } as never);
    else if (failure === 'wrong-order') getDetail.mockResolvedValue({ ...travelOrder, id: '33333333-3333-4333-8333-333333333333' });
    else getDetail.mockRejectedValue({ response: { status: failure } });
    const renderer = await renderScreen();
    expect(byId(renderer, 'quotation-price-branch')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toMatch(/275\.000|395\.000|Đã duyệt|Phạm vi báo giá kiểm thử/);
    expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
  });

  it.each([401, 403, 404, 500, 'history'])('removes the current branch after refresh %s', async (failure) => {
    getDetail.mockResolvedValue({ ...travelOrder, quotation: quote('SENT') } as never);
    const renderer = await renderScreen();
    branch(renderer);
    if (failure === 'history') getDetail.mockResolvedValueOnce({ ...travelOrder, historical: true } as never);
    else getDetail.mockRejectedValueOnce({ response: { status: failure } });
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await flush();
    expect(byId(renderer, 'quotation-price-branch')).toHaveLength(0);
    if (failure !== 500) expect(textOf(renderer.root)).not.toContain(travelOrder.customerName);
    expectNoSensitiveEffects();
  });

  it('discards late GET after session ownership revocation', async () => {
    const renderer = await renderScreen();
    branch(renderer);
    const pending = deferred<typeof travelOrder>();
    getDetail.mockReturnValueOnce(pending.promise);
    await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
    await act(async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false };
      mockAuthListeners.forEach((listener) => listener());
    });
    await act(async () => pending.resolve(travelOrder));
    await flush();
    expect(byId(renderer, 'quotation-price-branch')).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain(travelOrder.addressSummary);
    expectNoSensitiveEffects();
  });

  it.each(['unauthenticated', 'customer', 'invalid-id'])('does not present or load pricing for %s', async (access) => {
    if (access === 'unauthenticated') mockAuthState = { ...mockAuthState, isAuthenticated: false };
    if (access === 'customer') mockAuthState = { ...mockAuthState, user: { ...mockAuthState.user, role: 'customer' } };
    if (access === 'invalid-id') mockRouteId = 'invalid-id';
    const renderer = await renderScreen();
    expect(byId(renderer, 'quotation-price-branch')).toHaveLength(0);
    expect(getDetail).not.toHaveBeenCalled();
    expectNoSensitiveEffects();
  });

  it('keeps text scalable, current state readable without color and the header in safe scroll', async () => {
    const renderer = await renderScreen();
    const panel = branch(renderer);
    expect(textOf(panel)).toContain('Đang áp dụng');
    for (const text of panel.findAllByType(Text)) {
      expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(12);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    expect(renderer.root.findByType(ScrollView).findAll((node) => node === panel)).toHaveLength(1);
    expect(StyleSheet.flatten(renderer.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom)
      .toBeGreaterThanOrEqual(48);
    expectNoSensitiveEffects();
  });
});
