import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import VisitGroupsPanel from './VisitGroupsPanel';

const mockGetMyPage = jest.fn();
const mockGetMyOrders = jest.fn();

jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return { useFocusEffect: (callback: () => void) => ReactModule.useEffect(callback, [callback]) };
});
jest.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh: jest.fn() }));
jest.mock('./CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../constants/theme', () => {
  const tone = { bg: '#eee', fg: '#111', text: '#222' };
  return {
    iconSize: { sm: 16, md: 20, lg: 24 },
  iconStroke: 1.75,
  useAppTheme: () => ({
      colors: {
        primary: '#2563EB', primaryStrong: '#1D4ED8', surface: '#FFFFFF', text: '#0F172A', textSecondary: '#64748B', border: '#E2E8F0',
        tone: { success: tone, warning: tone, danger: tone, info: tone, violet: tone, repair: tone, neutral: tone },
      },
    }),
  };
});
jest.mock('../../api/orders.api', () => ({
  ordersApi: { getMyOrders: (...args: unknown[]) => mockGetMyOrders(...args), getTechnicianJobs: jest.fn(async () => []) },
  isHistoricalOrder: () => false,
}));
jest.mock('../../api/visit-groups.api', () => ({
  visitGroupsApi: { getMyPage: (...args: unknown[]) => mockGetMyPage(...args) },
}));


const row = (id: string, status: string, createdAt: string) => ({
  id, createdAt, bookingMode: 'scheduled', slot: 'morning', scheduledAt: '2026-10-26T01:00:00.000Z', scheduledEndAt: null, status,
  items: [
    { itemId: `${id}-1`, sequence: 1, bookingId: 'b1', serviceId: 's', deviceLabel: null, outcome: null, bookingStatus: 'SUBMITTED', serviceName: 'Điều hòa', orderId: null, orderCode: null, orderStatus: null },
    { itemId: `${id}-2`, sequence: 2, bookingId: 'b2', serviceId: 's', deviceLabel: 'Tủ lạnh nhà bếp', outcome: null, bookingStatus: 'SUBMITTED', serviceName: 'Tủ lạnh', orderId: null, orderCode: null, orderStatus: null },
  ],
});
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
async function mount(props: Partial<React.ComponentProps<typeof VisitGroupsPanel>> = {}) {
  jest.useFakeTimers();
  let tree!: ReactTestRenderer;
  const onOpen = jest.fn();
  await act(async () => { tree = create(<VisitGroupsPanel search="" onOpen={onOpen} {...props} />); });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { await Promise.resolve(); });
  return { tree, onOpen };
}
beforeEach(() => { mockGetMyOrders.mockResolvedValue([]); });
afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

it('shows each visit with its devices and status, and opens it', async () => {
  mockGetMyPage.mockResolvedValue({ data: [row('v1', 'matching', '2026-10-25T01:00:00.000Z')], total: 1 });
  const { tree, onOpen } = await mount();
  const all = texts(tree);
  expect(all).toContain('Lượt sửa · 2 thiết bị');
  expect(all).toContain('Đang tìm thợ');
  expect(all).toContain('Máy 2 · Tủ lạnh');
  expect(mockGetMyPage).toHaveBeenCalledWith(1, 20, { q: '' });
  act(() => { tree.root.findAllByType(TouchableOpacity).find((b) => b.props.testID === 'visit-group-v1')!.props.onPress(); });
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
});

it('says so when there is no visit, and when a search finds none', async () => {
  mockGetMyPage.mockResolvedValue({ data: [], total: 0 });
  expect(texts((await mount()).tree)).toContain('Chưa có lượt sửa nhiều thiết bị');
  jest.useRealTimers();
  expect(texts((await mount({ search: 'xyz' })).tree)).toContain('Không có lượt sửa phù hợp');
});

it('history mode merges the finished statuses, newest first', async () => {
  mockGetMyPage.mockImplementation(async (_page: number, _size: number, filter: { status: string }) => ({
    data: filter.status === 'completed' ? [row('old', 'completed', '2026-10-01T00:00:00.000Z')]
      : filter.status === 'failed' ? [row('new', 'failed', '2026-10-20T00:00:00.000Z')] : [],
    total: 1,
  }));
  const { tree } = await mount({ terminalOnly: true });
  expect(mockGetMyPage).toHaveBeenCalledTimes(5);
  const ids = tree.root.findAllByType(TouchableOpacity).map((b) => b.props.testID).filter(Boolean);
  expect(ids).toEqual(['visit-group-new', 'visit-group-old']);
});

it('shows a retry when the list cannot be read', async () => {
  mockGetMyPage.mockRejectedValue(new Error('offline'));
  expect(texts((await mount()).tree)).toContain('Thử lại');
});

const repairRow = () => ({
  ...row('v9', 'under_repair', '2026-10-29T01:00:00.000Z'),
  items: [1, 2].map((n) => ({ itemId: `v9-${n}`, sequence: n, bookingId: `b${n}`, serviceId: 's', deviceLabel: null, outcome: 'succeeded', bookingStatus: 'MATCHED', serviceName: `Máy ${n}`, orderId: `o${n}`, orderCode: `SO-${n}`, orderStatus: 'under_repair' })),
});
const deviceOrder = (n: number, extra: object) => ({ id: `o${n}`, code: `SO-${n}`, status: 'UNDER_REPAIR', grandTotal: 100000, ...extra });

it('shows Chờ thanh toán when every device of an under-repair visit is handed over, not Đang sửa chữa', async () => {
  mockGetMyPage.mockResolvedValue({ data: [repairRow()], total: 1 });
  mockGetMyOrders.mockResolvedValue([deviceOrder(1, { completionRequestedAt: '2026-10-29T13:20:00.000Z' }), deviceOrder(2, { completionRequestedAt: '2026-10-29T13:15:00.000Z' })]);
  const all = texts((await mount()).tree);
  expect(all).toContain('Chờ thanh toán');
  expect(all).not.toContain('Đang sửa chữa');
});

it('keeps Đang sửa chữa while one device is still not handed over, or its order could not be read', async () => {
  mockGetMyPage.mockResolvedValue({ data: [repairRow()], total: 1 });
  mockGetMyOrders.mockResolvedValue([deviceOrder(1, { completionRequestedAt: '2026-10-29T13:20:00.000Z' }), deviceOrder(2, {})]);
  expect(texts((await mount()).tree)).toContain('Đang sửa chữa');
  jest.useRealTimers();
  mockGetMyOrders.mockResolvedValue([deviceOrder(1, { completionRequestedAt: '2026-10-29T13:20:00.000Z' })]);
  expect(texts((await mount()).tree)).toContain('Đang sửa chữa');
});
