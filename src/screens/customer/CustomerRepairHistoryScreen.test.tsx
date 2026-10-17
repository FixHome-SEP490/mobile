import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockBack = jest.fn();
const mockHistory = jest.fn();

jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => ReactModule.useEffect(callback, [callback]),
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockBack }),
  };
});
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name),
  };
});
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF',
      background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A',
      textSecondary: '#64748B', muted: '#94A3B8', border: '#E2E8F0',
      divider: '#F1F5F9', success: '#059669', warning: '#D97706',
    },
  }),
}));
jest.mock('../../api/orders.api', () => ({
  ordersApi: { getRepairHistory: (...args: unknown[]) => mockHistory(...args) },
}));

const validRow = {
  orderId: 'service-order-1',
  bookingId: 'booking-1',
  code: 'FH-001',
  status: 'completed',
  serviceName: 'Vệ sinh máy lạnh',
  technicianName: 'Kỹ thuật viên A',
  laborTotal: 100000,
  partsTotal: 0,
  grandTotal: 100000,
  completedAt: '2026-09-29T02:30:00.000Z',
};

async function mount() {
  const { default: Screen } = jest.requireActual('./CustomerRepairHistoryScreen') as {
    default: React.ComponentType;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(React.createElement(Screen));
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((x) => String(x.props.children ?? ''));
}
function action(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === label);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.mockResolvedValue({ data: [], total: 0 });
});

describe('CustomerRepairHistoryScreen real UI', () => {
  it('shows retry on initial API error without falsely claiming no search results', async () => {
    mockHistory.mockRejectedValueOnce(new Error('network unavailable'));
    const tree = await mount();
    try {
      expect(mockHistory).toHaveBeenCalledWith(1, 20, 'completed');
      expect(texts(tree)).toContain('Không thể tải lịch sử sửa chữa. Vui lòng thử lại.');
      expect(texts(tree)).not.toContain('Không tìm thấy kết quả');
      expect(texts(tree)).not.toContain('Chưa có lịch sử sửa chữa');
      expect(action(tree, 'Thử tải lại lịch sử sửa chữa')).toBeDefined();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('distinguishes a genuinely empty loaded history from a network failure', async () => {
    const tree = await mount();
    try {
      expect(texts(tree)).toContain('Chưa có lịch sử sửa chữa');
      expect(texts(tree)).not.toContain('Không tìm thấy kết quả');
      expect(texts(tree)).not.toContain('Không thể tải lịch sử sửa chữa. Vui lòng thử lại.');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('labels search as downloaded-only when a later page may match', async () => {
    mockHistory.mockResolvedValue({ data: [validRow], total: 40 });
    const tree = await mount();
    try {
      await act(async () => {
        tree.root.findByType(TextInput).props.onChangeText('không tìm thấy');
      });
      expect(texts(tree)).toContain('Không có kết quả trong lịch sử đã tải');
      expect(texts(tree)).toContain('Tìm kiếm chỉ áp dụng cho các đơn đã tải. Bạn có thể tải thêm để tìm tiếp.');
      expect(action(tree, 'Tải thêm lịch sử sửa chữa')).toBeDefined();
      expect(action(tree, 'Xóa tìm kiếm')).toBeDefined();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('navigates from a real completed order and never mutates orders on mount', async () => {
    mockHistory.mockResolvedValue({ data: [validRow], total: 1 });
    const tree = await mount();
    try {
      expect(texts(tree)).toContain('Vệ sinh máy lạnh');
      const open = action(tree, 'Xem chi tiết đơn sửa chữa FH-001');
      expect(open).toBeDefined();
      act(() => open?.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerOrderDetail', { serviceOrderId: 'service-order-1' });
      expect(mockHistory).toHaveBeenCalledTimes(1);
      expect(action(tree, 'Quay lại')).toBeDefined();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('shows the Codex history/warranty overline and keeps completed rows on a 44pt target', async () => {
    mockHistory.mockResolvedValue({ data: [validRow], total: 1 });
    const tree = await mount();
    try {
      expect(texts(tree)).toContain('LỊCH SỬ & BẢO HÀNH');
      const open = action(tree, 'Xem chi tiết đơn sửa chữa FH-001');
      expect(open).toBeDefined();
      expect(StyleSheet.flatten(open?.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(mockHistory).toHaveBeenCalledTimes(1);
    } finally {
      act(() => tree.unmount());
    }
  });
});
