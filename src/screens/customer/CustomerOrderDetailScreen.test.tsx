import React from 'react';
import { Image, Modal, Text, TouchableOpacity, type TextStyle, type ViewStyle, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockGetOrder = jest.fn();
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
let mockRouteServiceOrderId = 'order-1';
const PHOTO_URI = 'https://example.test/signed-evidence.jpg';
const mockInitialState: {
  order: Record<string, unknown> | null; loading: boolean; refreshing: boolean; error: string | null;
} = { order: null, loading: false, refreshing: false, error: 'Không thể tải chi tiết đơn.' };
const mockEvidenceState = {
  photos: [] as { id: string; type: 'BEFORE' | 'AFTER' | 'ADDITIONAL'; uri: string; note: string | null }[],
  loading: false,
  error: null as string | null,
  canRetry: false,
  failed: {} as Record<string, true>,
};
const mockInvoiceState = {
  invoice: null as null | {
    id: string; paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED' | 'UNKNOWN';
    laborText: string | null; partsText: string | null; totalText: string | null;
    issuedText: string | null; paidText: string | null;
    items: { id: string; description: string; quantity: number; lineTotalText: string | null }[];
  },
  absent: false,
  loading: false,
  error: null as string | null,
  canRetry: false,
};
const mockPaymentState = {
  loading: false, cashBusy: false, cashNeedsVerify: false,
  onlineBusy: false, onlinePending: false, error: null as string | null,
  settlement: null as null | {
    id: string; declaredAmount: number; confirmedAmount: number | null;
    status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'DISPUTED'; technicianNotes: string | null;
  },
};
const mockPaymentController = {
  focus: jest.fn(), blur: jest.fn(), startVnpay: jest.fn(), reconcileOnline: jest.fn(),
  reconcileCash: jest.fn(), confirmCash: jest.fn(), loadCash: jest.fn(), reset: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { serviceOrderId: mockRouteServiceOrderId } }),
  // Do not run the authenticated GET on a mocked renderer. We are checking
  // only initial read-only states, never transaction/controller effects.
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(Native.View, props, children),
  };
});
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name) };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'Medium' } }));
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF',
      background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A',
      textSecondary: '#64748B', muted: '#94A3B8', border: '#E2E8F0',
      divider: '#F1F5F9', success: '#059669', warning: '#D97706',
      error: '#B91C1C',
      tone: {
        success: { bg: '#E7F6F0', text: '#08734F' },
        warning: { bg: '#FEF6E0', text: '#805B00' },
        danger: { bg: '#FEECEB', text: '#B42318' },
        info: { bg: '#EAF1FE', text: '#175CD3' },
        neutral: { bg: '#EFECE7', text: '#5C554C' },
      },
    },
  }),
}));
jest.mock('../../api/orders.api', () => ({
  ordersApi: {
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
  },
}));
jest.mock('./order-evidence', () => {
  const actual = jest.requireActual('./order-evidence');
  return {
    ...actual,
    createOrderEvidenceController: () => ({
      focusEvidence: jest.fn(), blurEvidence: jest.fn(), refreshEvidence: jest.fn(), markImageFailed: jest.fn(),
    }),
    get initialEvidenceState() { return mockEvidenceState; },
  };
});
jest.mock('./order-invoice', () => {
  const actual = jest.requireActual('./order-invoice');
  return {
    ...actual,
    get initialInvoiceState() { return mockInvoiceState; },
    createOrderInvoiceController: () => ({
      focusInvoice: jest.fn(), blurInvoice: jest.fn(), refreshInvoice: jest.fn(),
    }),
  };
});
jest.mock('./customer-payment', () => {
  const actual = jest.requireActual('./customer-payment');
  return {
    ...actual,
    get initialCustomerPaymentState() { return mockPaymentState; },
    createCustomerPaymentController: () => mockPaymentController,
  };
});
jest.mock('./order-additional-costs', () => {
  const actual = jest.requireActual('./order-additional-costs');
  return {
    ...actual,
    createAdditionalCostsController: () => ({
      focusCosts: jest.fn(), blurCosts: jest.fn(), refreshCosts: jest.fn(),
    }),
  };
});
jest.mock('./customer-order-detail', () => {
  const actual = jest.requireActual('./customer-order-detail');
  return { ...actual, get initialOrderDetailState() { return mockInitialState; } };
});
jest.mock('./CustomerSupportCasesSection', () => () => null);
jest.mock('../../components/customer/CustomerSkeleton', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return () => ReactModule.createElement(Native.Text, null, 'Mock skeleton');
});

async function mount() {
  const { default: Screen } = jest.requireActual('./CustomerOrderDetailScreen') as {
    default: React.ComponentType;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(React.createElement(Screen));
    await Promise.resolve();
  });
  return tree;
}
function textValues(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map((n) => String(n.props.children ?? ''));
}
function touch(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
}
function flatten(node: ReactTestInstance | undefined): ViewStyle {
  return StyleSheet.flatten(node?.props.style ?? {}) as ViewStyle;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRouteServiceOrderId = 'order-1';
  Object.assign(mockInitialState, { order: null, loading: false, refreshing: false, error: 'Không thể tải chi tiết đơn.' });
  mockGetOrder.mockRejectedValue(new Error('No authorized customer session in UI test'));
  mockEvidenceState.photos = [];
  mockEvidenceState.loading = false;
  mockEvidenceState.error = null;
  mockEvidenceState.canRetry = false;
  mockEvidenceState.failed = {};
  Object.assign(mockInvoiceState, {
    invoice: null, absent: false, loading: false, error: null, canRetry: false,
  });
  Object.assign(mockPaymentState, {
    loading: false, cashBusy: false, cashNeedsVerify: false,
    onlineBusy: false, onlinePending: false, error: null, settlement: null,
  });
});

function showEligiblePayment(orderPaymentStatus = 'UNPAID') {
  mockRouteServiceOrderId = ORDER_ID;
  Object.assign(mockInitialState, {
    order: {
      id: ORDER_ID, code: 'FH-TEST', status: 'UNDER_REPAIR',
      paymentStatus: orderPaymentStatus, customerConfirmed: true, historical: false,
      serviceName: 'Repair', timeline: [],
    },
    loading: false, refreshing: false, error: null,
  });
  mockInvoiceState.invoice = {
    id: 'invoice-test', paymentStatus: 'UNPAID', laborText: null, partsText: null,
    totalText: null, issuedText: null, paidText: null, items: [],
  };
}

describe('CustomerOrderDetailScreen source-backed empty/loading UI', () => {
  it('renders only the eligible quotation section and does not approve it on open', async () => {
    showEligiblePayment();
    Object.assign(mockInitialState.order!, { status: 'EN_ROUTE', customerConfirmed: false, quotation: { id: 'quote-fixture', status: 'SENT', items: [] } });
    const tree = await mount();
    try {
      const quoteSection = () => tree.root.findAll(node => node.props.testID === 'order-detail-section-quote-8')[0];
      expect(StyleSheet.flatten(quoteSection().props.style).display).toBe('flex');
      const footer = touch(tree, 'Xem báo giá');
      expect(footer).toBeDefined();
      await act(async () => { footer?.props.onPress(); });
      expect(mockGetOrder).not.toHaveBeenCalled();
      expect(mockPaymentController.startVnpay).not.toHaveBeenCalled();
    } finally { await act(async () => tree.unmount()); }
  });
  it('shows one active payment section and opens read-only progress without a transaction', async () => {
    showEligiblePayment();
    const tree = await mount();
    try {
      const detail = () => tree.root.findAll(node => node.props.testID === 'order-detail-section-payment-11')[0];
      expect(StyleSheet.flatten(detail().props.style).display).toBe('flex');
      const expand = tree.root.findAllByType(TouchableOpacity).find(node => node.props.testID === 'order-detail-expand-all')!;
      await act(async () => { expand.props.onPress(); });
      expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(true);
      const approve = touch(tree, 'Duyệt báo giá');
      expect(approve).toBeUndefined();
      const milestone = tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === 'Tiến độ: Đang sửa chữa');
      if (milestone) await act(async () => { milestone.props.onPress(); });
      expect(mockPaymentController.startVnpay).not.toHaveBeenCalled();
      expect(mockPaymentController.confirmCash).not.toHaveBeenCalled();
      expect(mockGetOrder).not.toHaveBeenCalled();
    } finally { await act(async () => tree.unmount()); }
  });
  it('renders an accessible order detail header and retry without claiming order status, payment or warranty', async () => {
    const tree = await mount();
    try {
      expect(textValues(tree)).toContain('Bước · Chi tiết đơn sửa chữa');
      expect(textValues(tree)).toContain('Không xem được đơn');
      expect(textValues(tree)).toContain('Không thể tải chi tiết đơn.');
      const header = tree.root.findAllByType(Text).find((x) => x.props.children === 'Bước · Chi tiết đơn sửa chữa');
      expect(header?.props.accessibilityRole).toBe('header');
      const back = touch(tree, 'Quay lại');
      expect(back).toBeDefined();
      expect(flatten(back).minHeight ?? flatten(back).height).toBeGreaterThanOrEqual(44);
      const retry = touch(tree, 'Thử tải lại chi tiết đơn');
      expect(retry).toBeDefined();
      expect(flatten(retry).minHeight ?? flatten(retry).height).toBeGreaterThanOrEqual(44);
      expect(textValues(tree)).not.toContain('Đã thanh toán');
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockGetOrder).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('does not describe the still-loading order as absent or successful', async () => {
    mockInitialState.loading = true;
    mockInitialState.error = null;
    const tree = await mount();
    try {
      expect(textValues(tree)).toContain('Đang tải chi tiết đơn...');
      expect(textValues(tree)).not.toContain('Không xem được đơn');
      expect(touch(tree, 'Thử tải lại chi tiết đơn')).toBeUndefined();
      expect(mockGetOrder).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('keeps a disabled retry visibly disabled while a refresh is unresolved', async () => {
    mockInitialState.refreshing = true;
    const tree = await mount();
    try {
      const retry = touch(tree, 'Thử tải lại chi tiết đơn');
      expect(retry?.props.disabled).toBe(true);
      expect(retry?.props.accessibilityState.disabled).toBe(true);
      expect(mockGetOrder).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('opens the already-authorized evidence photo in a read-only zoom viewer', async () => {
    mockRouteServiceOrderId = ORDER_ID;
    Object.assign(mockInitialState, {
      order: {
        id: ORDER_ID, code: 'FH-TEST', status: 'ACCEPTED',
        serviceName: 'Sửa điều hòa', timeline: [],
      },
      loading: false, refreshing: false, error: null,
    });
    mockEvidenceState.photos = [{ id: 'evidence-1', type: 'BEFORE', uri: PHOTO_URI, note: null }];
    const tree = await mount();
    try {
      const open = touch(tree, 'Phóng to ảnh Trước sửa chữa');
      expect(open).toBeDefined();
      act(() => open?.props.onPress());
      const viewer = tree.root.findAllByType(Modal).find((node) => node.props.visible)!;
      expect(viewer.props.visible).toBe(true);
      expect(tree.root.findAllByType(Image).some((node) => node.props.source?.uri === PHOTO_URI)).toBe(true);
      const close = touch(tree, 'Đóng ảnh');
      expect(close).toBeDefined();
      act(() => close?.props.onPress());
      expect(viewer.props.visible).toBe(false);
      expect(mockGetOrder).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('renders UNKNOWN invoice status neutrally and leaves a missing total absent', async () => {
    showEligiblePayment();
    mockInvoiceState.invoice = {
      id: 'invoice-test', paymentStatus: 'UNKNOWN', laborText: null, partsText: null,
      totalText: null, issuedText: null, paidText: null, items: [],
    };
    const tree = await mount();
    try {
      const status = tree.root.findByProps({ testID: 'invoice-payment-status' });
      expect(status.props.accessibilityLabel).toBe('Trạng thái thanh toán: Không rõ');
      expect(flatten(status).backgroundColor).toBe('#EFECE7');
      expect(textValues(tree)).toContain('Không rõ');
      expect(textValues(tree)).toContain('Chưa rõ tổng tiền.');
      expect(tree.root.findAllByProps({ testID: 'invoice-total' })).toHaveLength(0);
      expect(textValues(tree)).not.toContain('0 ₫');
      expect(textValues(tree)).not.toContain('Đã thanh toán');
      expect(mockGetOrder).not.toHaveBeenCalled();
      expect(mockPaymentController.startVnpay).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('labels PAID only from the invoice status and keeps the provided total in the total hierarchy', async () => {
    showEligiblePayment();
    mockInvoiceState.invoice = {
      id: 'invoice-test', paymentStatus: 'PAID', laborText: null, partsText: null,
      totalText: 'SERVER_TOTAL', issuedText: null, paidText: null,
      items: [{ id: 'item-1', description: 'Repair', quantity: 1, lineTotalText: 'SERVER_ITEM_TOTAL' }],
    };
    const tree = await mount();
    try {
      const status = tree.root.findByProps({ testID: 'invoice-payment-status' });
      expect(status.props.accessibilityLabel).toBe('Trạng thái thanh toán: Đã thanh toán');
      expect(textValues(tree)).toContain('SERVER_TOTAL');
      expect(textValues(tree)).toContain('SERVER_ITEM_TOTAL');
      const total = tree.root.findByProps({ testID: 'invoice-total' });
      expect(total).toBeDefined();
      const totalText = tree.root.findAllByType(Text).find((node) => node.props.children === 'SERVER_TOTAL');
      expect((StyleSheet.flatten(totalText?.props.style) as TextStyle).fontWeight).toBe('700');
      expect(mockPaymentController.startVnpay).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('distinguishes a technician cash declaration from customer confirmation or dispute', async () => {
    showEligiblePayment();
    mockPaymentState.settlement = {
      id: 'settlement-test', declaredAmount: 1234, confirmedAmount: null,
      status: 'PENDING_CONFIRMATION', technicianNotes: 'Declared by technician',
    };
    const tree = await mount();
    try {
      expect(tree.root.findByProps({ testID: 'cash-settlement-status' }).props.accessibilityLabel)
        .toBe('Đối soát tiền mặt: Chờ khách xác nhận');
      expect(textValues(tree).join(' ')).toContain('Declared by technician');
      const confirm = touch(tree, 'Xác nhận đã trả tiền mặt');
      const dispute = touch(tree, 'Báo sai số tiền mặt');
      expect(confirm).toBeDefined();
      expect(dispute).toBeDefined();
      expect(flatten(confirm).minHeight ?? flatten(confirm).height).toBeGreaterThanOrEqual(44);
      expect(flatten(dispute).minHeight ?? flatten(dispute).height).toBeGreaterThanOrEqual(44);
      expect(textValues(tree)).not.toContain('Đã thanh toán');
      expect(mockPaymentController.confirmCash).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('keeps disputed cash explicitly unresolved and not paid', async () => {
    showEligiblePayment();
    mockPaymentState.settlement = {
      id: 'settlement-test', declaredAmount: 1234, confirmedAmount: null,
      status: 'DISPUTED', technicianNotes: null,
    };
    const tree = await mount();
    try {
      expect(tree.root.findByProps({ testID: 'cash-settlement-status' }).props.accessibilityLabel)
        .toBe('Đối soát tiền mặt: Đang tranh chấp');
      expect(textValues(tree).join(' ')).toContain('Hóa đơn chưa được coi là đã thanh toán.');
      expect(textValues(tree)).not.toContain('Đã thanh toán');
      expect(mockPaymentController.confirmCash).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('shows pending VNPay and cash verification recovery without declaring success', async () => {
    showEligiblePayment();
    mockPaymentState.onlinePending = true;
    mockPaymentState.cashNeedsVerify = true;
    mockPaymentState.settlement = {
      id: 'settlement-test', declaredAmount: 1234, confirmedAmount: null,
      status: 'PENDING_CONFIRMATION', technicianNotes: null,
    };
    const tree = await mount();
    try {
      expect(textValues(tree).join(' ')).toContain('Quay lại ứng dụng không đồng nghĩa đã thanh toán thành công.');
      const onlineCheck = touch(tree, 'Kiểm tra trạng thái thanh toán');
      const cashCheck = touch(tree, 'Kiểm tra đối soát tiền mặt');
      const confirmCash = touch(tree, 'Xác nhận đã trả tiền mặt');
      const disputeCash = touch(tree, 'Báo sai số tiền mặt');
      expect(onlineCheck).toBeDefined();
      expect(cashCheck).toBeDefined();
      expect(confirmCash?.props.disabled).toBe(true);
      expect(disputeCash?.props.disabled).toBe(true);
      expect(flatten(onlineCheck).minHeight ?? flatten(onlineCheck).height).toBeGreaterThanOrEqual(44);
      expect(flatten(cashCheck).minHeight ?? flatten(cashCheck).height).toBeGreaterThanOrEqual(44);
      expect(textValues(tree)).not.toContain('Đã thanh toán');
      expect(mockPaymentController.reconcileOnline).not.toHaveBeenCalled();
      expect(mockPaymentController.reconcileCash).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('reports CONFIRMED as cash reconciliation only, separately from invoice payment', async () => {
    showEligiblePayment();
    mockPaymentState.settlement = {
      id: 'settlement-test', declaredAmount: 1234, confirmedAmount: 1234,
      status: 'CONFIRMED', technicianNotes: null,
    };
    const tree = await mount();
    try {
      expect(tree.root.findByProps({ testID: 'cash-settlement-status' }).props.accessibilityLabel)
        .toBe('Đối soát tiền mặt: Đã xác nhận');
      expect(tree.root.findByProps({ testID: 'invoice-payment-status' }).props.accessibilityLabel)
        .toBe('Trạng thái thanh toán: Chưa thanh toán');
      expect(textValues(tree).join(' ')).toContain('Trạng thái hóa đơn được hiển thị riêng');
      expect(mockPaymentController.confirmCash).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('announces financial control busy state without invoking a payment request', async () => {
    showEligiblePayment();
    mockPaymentState.cashBusy = true;
    mockPaymentState.cashNeedsVerify = true;
    mockPaymentState.onlineBusy = true;
    mockPaymentState.onlinePending = true;
    mockPaymentState.settlement = {
      id: 'settlement-test', declaredAmount: 1234, confirmedAmount: null,
      status: 'PENDING_CONFIRMATION', technicianNotes: null,
    };
    const tree = await mount();
    try {
      for (const label of [
        'Xác nhận đã trả tiền mặt',
        'Báo sai số tiền mặt',
        'Kiểm tra đối soát tiền mặt',
        'Thanh toán qua VNPay',
        'Kiểm tra trạng thái thanh toán',
      ]) {
        const control = touch(tree, label);
        expect(control?.props.disabled).toBe(true);
        expect(control?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
      }
      expect(mockPaymentController.startVnpay).not.toHaveBeenCalled();
      expect(mockPaymentController.confirmCash).not.toHaveBeenCalled();
      expect(mockPaymentController.reconcileCash).not.toHaveBeenCalled();
      expect(mockPaymentController.reconcileOnline).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });
});
