import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerNotificationsScreen from './CustomerNotificationsScreen';

const mockGetPage = jest.fn();
const mockReadAll = jest.fn();
const mockReadOne = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    spacing: {}, fontSize: {},
    colors: {
      background: '#F7F5F2', surface: '#FFFFFF', text: '#1A1714',
      textSecondary: '#5C554C', muted: '#6B7280', border: '#E2DDD6',
      primary: '#3B82F6', primaryStrong: '#2563EB',
      primarySoft: '#DBEAFE', primaryTint: '#EFF6FF',
      success: '#059669', error: '#DC2626',
      tone: { danger: { fg: '#B91C1C', bg: '#FEE2E2' }, warning: { fg: '#92400E', bg: '#FEF3C7', text: '#92400E' } },
    },
  }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../hooks/useScrollHideTabBar', () => ({ useScrollHideTabBar: () => jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ bottom: 16, top: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../api/notifications.api', () => ({
  notificationsApi: {
    getNotificationPage: (...args: unknown[]) => mockGetPage(...args),
    readAll: (...args: unknown[]) => mockReadAll(...args),
    readNotification: (...args: unknown[]) => mockReadOne(...args),
  },
}));
jest.mock('../../api/support-cases.api', () => ({
  supportCasesApi: { getMine: jest.fn() },
}));

const item = (id: string, isRead: boolean, title = 'Cập nhật đơn') => ({
  id,
  title,
  message: 'Đơn của bạn có cập nhật',
  createdAt: '2026-10-09T08:00:00Z',
  isRead,
  type: 'BOOKING',
  referenceId: null,
  referenceType: null,
});
const page = (data: ReturnType<typeof item>[]) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<CustomerNotificationsScreen />); });
  return renderer;
}
function textOf(renderer: ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map((node) => {
    const children = node.props.children as unknown;
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.filter((x) => typeof x === 'string' || typeof x === 'number').join('');
    return '';
  }).join('\n');
}
function buttonByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === label);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadAll.mockResolvedValue(undefined);
  mockReadOne.mockResolvedValue(undefined);
  mockGetPage.mockResolvedValue(page([]));
});

describe('C-RUI6A real Customer Notifications UI', () => {
  it('shows neutral loading while REST is unresolved, with no invented notification rows', async () => {
    mockGetPage.mockImplementation(() => new Promise(() => undefined));
    const renderer = await render();
    expect(textOf(renderer)).toContain('Đang tải thông báo');
    expect(textOf(renderer)).not.toContain('Chưa có thông báo nào');
    expect(mockReadAll).not.toHaveBeenCalled();
    expect(mockReadOne).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('renders source-backed unread count and full accessible row text without read mutation on mount', async () => {
    mockGetPage.mockResolvedValueOnce(page([item('n1', false), item('n2', true, 'Thanh toán')]));
    const renderer = await render();
    expect(textOf(renderer)).toContain('1 chưa đọc ·');
    expect(textOf(renderer)).toContain('2 đã tải');
    expect(textOf(renderer).match(/chưa đọc/g)).toHaveLength(1);
    expect(renderer.root.findAllByType(FlatList)[0].props.data).toHaveLength(2);
    expect(buttonByLabel(renderer, 'Chưa đọc. Cập nhật đơn. Đơn của bạn có cập nhật')).toBeDefined();
    expect(buttonByLabel(renderer, 'Đã đọc. Thanh toán. Đơn của bạn có cập nhật')).toBeDefined();
    expect(mockReadAll).not.toHaveBeenCalled();
    expect(mockReadOne).not.toHaveBeenCalled();
    const mark = buttonByLabel(renderer, 'Đánh dấu tất cả thông báo đã đọc');
    expect(mark).toBeDefined();
    expect(mark!.props.style[0].minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => renderer.unmount());
  });

  it('shows an empty state only after confirmed empty server page', async () => {
    const renderer = await render();
    expect(textOf(renderer)).toContain('Chưa có thông báo nào');
    expect(textOf(renderer)).toContain('lịch hẹn, đơn sửa chữa hoặc yêu cầu hỗ trợ');
    await act(async () => renderer.unmount());
  });

  it('renders retry on failure, not a fake empty list', async () => {
    mockGetPage.mockRejectedValueOnce(new Error('network'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const renderer = await render();
      expect(textOf(renderer)).toContain('Không tải được thông báo');
      expect(buttonByLabel(renderer, 'Đánh dấu tất cả thông báo đã đọc')).toBeDefined();
      expect(textOf(renderer)).not.toContain('Chưa có thông báo nào');
      await act(async () => renderer.unmount());
    } finally { consoleSpy.mockRestore(); }
  });

  it('does not report read-all success when server PATCH fails', async () => {
    mockGetPage.mockResolvedValueOnce(page([item('n1', false)]));
    mockReadAll.mockRejectedValueOnce(new Error('offline'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const renderer = await render();
      const mark = buttonByLabel(renderer, 'Đánh dấu tất cả thông báo đã đọc');
      expect(mark).toBeDefined();
      await act(async () => mark!.props.onPress());
      expect(mockReadAll).toHaveBeenCalledTimes(1);
      expect(textOf(renderer)).toContain('Không thể đánh dấu tất cả đã đọc');
      expect(textOf(renderer)).toContain('1 chưa đọc ·');
      await act(async () => renderer.unmount());
    } finally { consoleSpy.mockRestore(); }
  });

  it('uses a single notification heading and keeps rows on a 44pt target', async () => {
    mockGetPage.mockResolvedValueOnce(page([item('n1', false)]));
    const renderer = await render();
    expect(textOf(renderer)).not.toContain('THÔNG BÁO');
    expect(renderer.root.findAllByType(Text).filter((node) => node.props.accessibilityRole === 'header')).toHaveLength(1);
    const row = buttonByLabel(renderer, 'Chưa đọc. Cập nhật đơn. Đơn của bạn có cập nhật');
    expect(row).toBeDefined();
    expect(StyleSheet.flatten(row!.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(mockReadAll).not.toHaveBeenCalled();
    expect(mockReadOne).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
