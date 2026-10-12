// T-NATIVE-12B1: Codex-inspired read-only REAL job calendar (not demo availability editor).
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianScheduleScreen from './TechnicianScheduleScreen';
import { fetchAllOrders } from './technician-earnings';
import { technicianProfileApi } from '../../api/technician-profile.api';
import type { ServiceOrderItem } from '../../api/orders.api';
import { dayKeyVn } from './technician-schedule';

const mockBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockBack, navigate: mockNavigate }) }));
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: ({ children, ...rest }: { children?: React.ReactNode }) => R.createElement(NativeView, rest, children),
    useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
  };
});
jest.mock('lucide-react-native', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => R.createElement(NativeView, null);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      background: '#ffffff', surface: '#ffffff', text: '#1a1714', textSecondary: '#5c554c',
      muted: '#94a3b8', primary: '#2563eb', primaryStrong: '#1d4ed8', primarySoft: '#eff6ff',
      primaryTint: '#bfdbfe', border: '#e2ddd6', divider: '#e2ddd6', error: '#b42318',
      tone: {
        warning: { bg: '#fef6e0', fg: '#b07d00', text: '#805b00' },
        success: { bg: '#e7f6f0', fg: '#0e8a5f', text: '#08734f' },
        danger: { bg: '#feeceb', fg: '#d92d20', text: '#b42318' },
        info: { bg: '#eaf1fe', fg: '#175cd3', text: '#175cd3' },
        neutral: { bg: '#efeee7', fg: '#7d7468', text: '#5c554c' },
      },
    },
  }),
}));
jest.mock('../../components/customer/CustomerSkeleton', () => () => null);
jest.mock('../../components/StatusBadge', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ view }: { view: { label: string } }) => R.createElement(NativeText, null, view.label);
});
jest.mock('../../api/orders.api', () => ({
  ordersApi: { getMyOrdersPage: jest.fn() },
  isHistoricalOrder: (order: { historical?: boolean }) => order.historical === true,
}));
jest.mock('../../api/technician-profile.api', () => ({
  technicianProfileApi: {
    getMyTimeOff: jest.fn(), updateMySchedule: jest.fn(), createTimeOff: jest.fn(),
    deleteTimeOff: jest.fn(), updateMyProfile: jest.fn(), setSkillPricing: jest.fn(),
  },
}));
jest.mock('./technician-earnings', () => ({ fetchAllOrders: jest.fn() }));

const mockFetch = fetchAllOrders as jest.MockedFunction<typeof fetchAllOrders>;
const profileApi = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const today = () => dayKeyVn(Date.now())!;
const isoOnDay = (key: string) => new Date(key + 'T09:00:00+07:00').toISOString();
function order(overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem {
  return {
    id: 'order-real-fixture', code: 'FH-REAL', status: 'ACCEPTED',
    scheduledAt: isoOnDay(today()), serviceName: 'Sửa tủ lạnh', addressSummary: 'Địa chỉ đã tải',
    ...overrides,
  } as ServiceOrderItem;
}
function visibleText(r: ReactTestRenderer): string {
  return r.root.findAllByType(Text).map(x => {
    const c = x.props.children; return Array.isArray(c) ? c.filter((y: unknown) => typeof y === 'string' || typeof y === 'number').join('') : String(c ?? '');
  }).join('\n');
}
function btn(r: ReactTestRenderer, label: string) {
  return r.root.findAllByType(TouchableOpacity).filter(x => x.props.accessibilityLabel === label);
}
function styleList(v: unknown): Record<string, unknown>[] {
  return (Array.isArray(v) ? v : [v]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}
async function render() {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<TechnicianScheduleScreen />); });
  return r;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ orders: [order()], truncated: false });
  profileApi.getMyTimeOff.mockResolvedValue([]);
});
describe('T12B1 real jobs calendar read-only Codex presentation', () => {
  it('preserves Lịch làm việc heading and adds a source-honest weekly eyebrow', async () => {
    const r = await render();
    expect(visibleText(r)).toContain('Lịch làm việc');
    expect(visibleText(r)).toContain('Công việc trong tuần');
    await act(async () => r.unmount());
  });
  it('discloses loaded orders and keeps availability edits in real Profile', async () => {
    const r = await render();
    expect(visibleText(r)).toContain('Lịch hiển thị các đơn đã tải và ngày nghỉ đã khai báo.');
    expect(visibleText(r)).toContain('Chỉnh khung giờ nhận việc tại Hồ sơ nghề nghiệp.');
    await act(async () => r.unmount());
  });
  it('never fabricates fake availability, price, demo save or district slots', async () => {
    const r = await render();
    const t = visibleText(r);
    expect(t).not.toMatch(/Quận 3 mẫu|300\.000 ₫|Lưu lịch & kỹ năng mẫu|Khả dụng 5 km|Ngày nghỉ mẫu 12\/10/);
    await act(async () => r.unmount());
  });
  it('renders an actual accepted nonhistoric order on today without inventing other events', async () => {
    const r = await render();
    const t = visibleText(r);
    expect(t).toContain('Sửa tủ lạnh'); expect(t).toContain('#FH-REAL');
    expect(t).not.toContain('Chưa có công việc vào cả tuần');
    await act(async () => r.unmount());
  });
  it('does not render cancelled/sanitized history or leak previously archived address', async () => {
    mockFetch.mockResolvedValue({ orders: [
      order({ id: 'cancelled', code: 'CANCEL', status: 'CANCELLED' }),
      order({ id: 'history', code: 'HISTORY', historical: true, addressSummary: 'PRIVATE DO NOT LEAK' } as unknown as Partial<ServiceOrderItem>),
    ], truncated: false });
    const r = await render(); const t = visibleText(r);
    expect(t).not.toContain('CANCEL'); expect(t).not.toContain('HISTORY'); expect(t).not.toContain('PRIVATE DO NOT LEAK');
    expect(t).toContain('Không có công việc');
    await act(async () => r.unmount());
  });
  it('retains seven distinct day choices without saving any calendar mutation', async () => {
    const r = await render();
    const days = r.root.findAllByType(TouchableOpacity).filter(x => String(x.props.accessibilityLabel ?? '').includes(' ngày ') && String(x.props.accessibilityLabel ?? '').includes(' công việc'));
    expect(days).toHaveLength(7);
    expect(profileApi.updateMySchedule).not.toHaveBeenCalled();
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.deleteTimeOff).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  it('switches week locally without another GET or POST', async () => {
    const r = await render(); const before = mockFetch.mock.calls.length;
    expect(btn(r,'Tuần sau')).toHaveLength(1);
    await act(async () => btn(r,'Tuần sau')[0].props.onPress());
    expect(mockFetch).toHaveBeenCalledTimes(before);
    expect(visibleText(r)).toContain('Lịch hiển thị các đơn đã tải');
    await act(async () => r.unmount());
  });
  it('navigates to actual order detail on card press', async () => {
    const r = await render();
    const card = r.root.findAllByType(TouchableOpacity).find(x => String(x.props.accessibilityLabel ?? '').includes('Xem chi tiết công việc FH-REAL'));
    expect(card).toBeDefined();
    await act(async () => card!.props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianOrderDetail', { serviceOrderId: 'order-real-fixture' });
    await act(async () => r.unmount());
  });
  it('keeps 44pt back target and true navigation', async () => {
    const r = await render();
    const back = btn(r,'Quay lại'); expect(back).toHaveLength(1);
    const h = styleList(back[0].props.style).map(s => Math.max(typeof s.height === 'number' ? s.height : 0, typeof s.minHeight === 'number' ? s.minHeight : 0));
    expect(Math.max(0,...h)).toBeGreaterThanOrEqual(44);
    await act(async () => back[0].props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  it('shows loading without invented orders', async () => {
    mockFetch.mockImplementation(() => new Promise(() => undefined));
    const r = await render(); const t = visibleText(r);
    expect(t).not.toContain('FH-REAL');
    await act(async () => r.unmount());
  });
  it('shows fail-closed error and genuine retry when source unavailable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const r = await render(); const t = visibleText(r);
    expect(t).toContain('Không thể tải lịch');
    expect(t).not.toContain('FH-REAL');
    await act(async () => r.unmount());
  });
  it('renders a real time-off only when server reports one', async () => {
    const key = today();
    profileApi.getMyTimeOff.mockResolvedValue([{ id:'leave-fixture', startAt:isoOnDay(key), endAt:isoOnDay(key), reason:'Nghỉ cá nhân' }]);
    const r = await render(); const t = visibleText(r);
    expect(t).toContain('Nghỉ cá nhân');
    await act(async () => r.unmount());
  });
});
