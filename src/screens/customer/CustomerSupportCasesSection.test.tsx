import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CASE_ID = '22222222-2222-4222-8222-222222222222';
const mockListMine = jest.fn();
const mockGetMine = jest.fn();
const mockCreateCase = jest.fn();

jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      ReactModule.useEffect(() => effect(), [effect]),
  };
});

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactModule.createElement(Native.Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    colors: {
      primary: '#3B82F6',
      primarySoft: '#EFF6FF',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#64748B',
      muted: '#94A3B8',
      border: '#E2E8F0',
      divider: '#F1F5F9',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
    },
  }),
}));

jest.mock('../../api/support-cases.api', () => ({
  supportCasesApi: {
    listMine: (...args: unknown[]) => mockListMine(...args),
    getMine: (...args: unknown[]) => mockGetMine(...args),
    createCase: (...args: unknown[]) => mockCreateCase(...args),
  },
}));

function supportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    caseType: 'quality',
    status: 'open',
    bookingId: null,
    serviceOrderId: ORDER_ID,
    reason: 'Chất lượng sửa chữa chưa đạt yêu cầu.',
    description: null,
    resolutionReason: null,
    evidenceRefs: null,
    isUrgent: false,
    respondBy: null,
    resolvedAt: null,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

function screenElement(status = 'UNDER_REPAIR') {
  const { default: CustomerSupportCasesSection } = jest.requireActual('./CustomerSupportCasesSection') as {
    default: React.ComponentType<{ orderId: string; orderStatus: string; completedAt?: string | null }>;
  };
  return React.createElement(CustomerSupportCasesSection, {
    orderId: ORDER_ID,
    orderStatus: status,
    completedAt: status === 'COMPLETED' ? '2026-09-29T00:00:00.000Z' : null,
  });
}

async function mount(status = 'UNDER_REPAIR'): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(screenElement(status));
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListMine.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockGetMine.mockResolvedValue(supportRow());
  mockCreateCase.mockResolvedValue(supportRow());
});

describe('CustomerSupportCasesSection', () => {
  it('loads actor-safe per-order cases and shows an honest empty state', async () => {
    const tree = await mount();
    expect(mockListMine).toHaveBeenCalledWith({ page: 1, limit: 20, serviceOrderId: ORDER_ID });
    expect(
      tree.root.findAllByType(Text).some((node) => node.props.children === 'Bạn chưa gửi khiếu nại nào cho đơn này.'),
    ).toBe(true);
  });

  it('opens a support-case detail through mine/:id data', async () => {
    mockListMine.mockResolvedValue({
      data: [supportRow({ status: 'in_review' })],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mockGetMine.mockResolvedValue(supportRow({
      status: 'in_review',
      resolutionReason: 'Quản lý đang kiểm tra thêm thông tin.',
    }));

    const tree = await mount();
    const row = tree.root.findAllByType(TouchableOpacity).find(
      (node) => node.props.accessibilityLabel === 'Xem chi tiết khiếu nại Chất lượng sửa chữa chưa đạt',
    );
    expect(row).toBeTruthy();

    await act(async () => {
      row!.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetMine).toHaveBeenCalledWith(CASE_ID);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Chi tiết khiếu nại')).toBe(true);
    expect(
      tree.root.findAllByType(Text).some((node) => node.props.children === 'Quản lý đang kiểm tra thêm thông tin.'),
    ).toBe(true);
  });

  it('names a rejected case as rejected in the final progress step, without creating a case', async () => {
    const rejected = supportRow({ status: 'rejected', resolutionReason: 'Không đủ điều kiện xử lý.' });
    mockListMine.mockResolvedValue({ data: [rejected], total: 1, page: 1, limit: 20, totalPages: 1 });
    mockGetMine.mockResolvedValue(rejected);
    const tree = await mount();
    try {
      const row = tree.root.findAllByType(TouchableOpacity).find(
        (node) => node.props.accessibilityLabel === 'Xem chi tiết khiếu nại Chất lượng sửa chữa chưa đạt',
      );
      expect(row).toBeDefined();
      await act(async () => { row?.props.onPress(); await Promise.resolve(); });
      const progress = tree.root.findByProps({ testID: 'support-case-progress' });
      const labels = progress.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      expect(labels).toContain('Đã từ chối');
      expect(labels).not.toContain('Kết quả xử lý');
      expect(mockCreateCase).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('creates an active-order complaint using an allowed type, reason, serviceOrderId and urgent flag only', async () => {
    const tree = await mount('UNDER_REPAIR');
    const openButton = tree.root.findAllByType(TouchableOpacity).find(
      (node) => node.props.accessibilityLabel === 'Gửi khiếu nại',
    );
    expect(openButton).toBeTruthy();

    act(() => openButton!.props.onPress());

    const input = tree.root.findByProps({ accessibilityLabel: 'Mô tả khiếu nại' }) as unknown as ReactTestRenderer['root'];
    act(() => input.props.onChangeText('Công việc đang bị gián đoạn và cần hỗ trợ.'));

    const urgentSwitch = tree.root.findAllByType(Switch)[0];
    act(() => urgentSwitch.props.onValueChange(true));

    const submitButtons = tree.root.findAllByType(TouchableOpacity).filter((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Gửi khiếu nại'),
    );
    expect(submitButtons.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      submitButtons[submitButtons.length - 1].props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateCase).toHaveBeenCalledWith({
      caseType: 'mid_job_interruption',
      reason: 'Công việc đang bị gián đoạn và cần hỗ trợ.',
      serviceOrderId: ORDER_ID,
      isUrgent: true,
    });
  });

  it('closes complaint creation for a completed order outside the seven-day window', async () => {
    const { default: CustomerSupportCasesSection } = jest.requireActual('./CustomerSupportCasesSection') as {
      default: React.ComponentType<{ orderId: string; orderStatus: string; completedAt?: string | null }>;
    };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(CustomerSupportCasesSection, {
        orderId: ORDER_ID,
        orderStatus: 'COMPLETED',
        completedAt: '2026-01-01T00:00:00.000Z',
      }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const createButton = tree.root.findAllByType(TouchableOpacity).find(
      (node) => node.props.accessibilityLabel === 'Gửi khiếu nại',
    );
    expect(createButton?.props.disabled).toBe(true);
  });

  it('shows failed first GET with an accessible retry, not a confirmed empty list', async () => {
    mockListMine.mockRejectedValueOnce(new Error('Mất kết nối'));
    const tree = await mount();
    try {
      const txt = tree.root.findAllByType(Text).map((x) => String(x.props.children ?? ''));
      expect(txt).not.toContain('Bạn chưa gửi khiếu nại nào cho đơn này.');
      const retry = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Tải lại danh sách khiếu nại',
      );
      expect(retry).toBeDefined();
      expect(retry?.props.accessibilityState.disabled).toBe(false);
      expect(StyleSheet.flatten(retry?.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(mockCreateCase).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('communicates ineligible creation as disabled with a 44pt target', async () => {
    const { default: Screen } = jest.requireActual('./CustomerSupportCasesSection') as {
      default: React.ComponentType<{ orderId: string; orderStatus: string; completedAt?: string | null }>;
    };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(Screen, {
        orderId: ORDER_ID, orderStatus: 'COMPLETED',
        completedAt: '2026-01-01T00:00:00.000Z',
      }));
      await Promise.resolve();
    });
    try {
      const action = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Gửi khiếu nại',
      );
      expect(action?.props.disabled).toBe(true);
      expect(action?.props.accessibilityState.disabled).toBe(true);
      expect(StyleSheet.flatten(action?.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(mockCreateCase).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('uses accessible controls without a submit when opening the form', async () => {
    const tree = await mount();
    try {
      const open = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Gửi khiếu nại',
      );
      act(() => open?.props.onPress());
      const close = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Đóng biểu mẫu khiếu nại',
      );
      expect(close).toBeDefined();
      expect(StyleSheet.flatten(close?.props.style).minWidth).toBeGreaterThanOrEqual(44);
      const choice = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityRole === 'radio',
      );
      expect(choice?.props.accessibilityLabel).toBeTruthy();
      expect(StyleSheet.flatten(choice?.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(mockCreateCase).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('makes a failed actor-safe detail read retryable without POST', async () => {
    mockListMine.mockResolvedValue({ data: [supportRow()], total: 1, page: 1, limit: 20, totalPages: 1 });
    mockGetMine.mockRejectedValueOnce(new Error('Không thể kết nối'));
    const tree = await mount();
    try {
      const row = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Xem chi tiết khiếu nại Chất lượng sửa chữa chưa đạt',
      );
      await act(async () => { row?.props.onPress(); await Promise.resolve(); });
      const retry = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Tải lại chi tiết khiếu nại',
      );
      expect(retry).toBeDefined();
      expect(StyleSheet.flatten(retry?.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(mockGetMine).toHaveBeenCalledWith(CASE_ID);
      expect(mockCreateCase).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('keeps primary complaint actions on a 44pt target without submitting on open', async () => {
    const tree = await mount();
    try {
      const open = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Gửi khiếu nại',
      );
      act(() => open?.props.onPress());
      const submit = tree.root.findAllByType(TouchableOpacity).find(
        (x) => x.props.accessibilityLabel === 'Xác nhận gửi khiếu nại',
      );
      expect(submit).toBeDefined();
      expect(StyleSheet.flatten(submit?.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(mockCreateCase).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });
});
