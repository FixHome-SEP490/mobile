import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer';
import { reputationApi } from '../api/reputation.api';
import ReputationCard from './ReputationCard';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

jest.mock('../api/reputation.api', () => ({ reputationApi: { mine: jest.fn() } }));
jest.mock('@gorhom/bottom-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const BottomSheetModal = ReactModule.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    const [presented, setPresented] = ReactModule.useState(false);
    ReactModule.useImperativeHandle(ref, () => ({
      present: () => setPresented(true),
      dismiss: () => setPresented(false),
    }));
    return presented ? ReactModule.createElement(Native.View, { testID: 'mock-reputation-sheet' }, props.children) : null;
  });
  return { BottomSheetBackdrop: () => null, BottomSheetModal, BottomSheetScrollView: Native.ScrollView };
});
const api = reputationApi as jest.Mocked<typeof reputationApi>;
const text = (r: ReturnType<typeof create>) => {
  const read = (node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string => {
    if (node === null) return '';
    if (typeof node === 'string') return node;
    return (Array.isArray(node) ? node : node.children ?? []).map(read).join('');
  };
  return read(r.toJSON());
};
const mounted: ReturnType<typeof create>[] = [];

async function mount(role: 'customer' | 'technician') {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<ReputationCard role={role} />); });
  mounted.push(r);
  await act(async () => { await Promise.resolve(); });
  return r;
}

beforeEach(() => jest.resetAllMocks());
afterEach(() => {
  act(() => { mounted.splice(0).forEach((r) => r.unmount()); });
});

describe.each([
  {
    role: 'customer' as const,
    warning: 'Bạn tạm thời không thể đặt lịch đến 10:00 21/10/2030.',
    violation: 'Hủy lịch sau khi kỹ thuật viên đã nhận lời mời',
    otherViolation: 'Hủy đơn khi đã có khách đặt',
    restriction: 'tạm khóa đặt lịch',
  },
  {
    role: 'technician' as const,
    warning: 'Bạn tạm thời không thể nhận việc đến 10:00 21/10/2030.',
    violation: 'Hủy đơn khi đã có khách đặt',
    otherViolation: 'Hủy lịch sau khi kỹ thuật viên đã nhận lời mời',
    restriction: 'tạm khóa nhận việc',
  },
])('ReputationCard $role', ({ role, warning, violation, otherViolation, restriction }) => {
  it('renders the compact score and keeps the server suspension outside the info sheet', async () => {
    api.mine.mockResolvedValue({ points: 60, resetsAt: null, suspendedUntil: '2030-10-21T03:00:00.000Z', locked: false, events: [] });
    const r = await mount(role);
    const score = r.root.findByProps({ testID: 'reputation-points' });
    expect(score.props.children[0]).toBe(60);
    expect(text(r)).toContain('/100');
    expect(StyleSheet.flatten(score.props.style)).toMatchObject({ fontSize: 24, lineHeight: 30 });
    const meter = r.root.findByProps({ accessibilityRole: 'progressbar' });
    expect(StyleSheet.flatten(meter.props.style)).toMatchObject({ height: 4 });
    expect(StyleSheet.flatten(meter.props.children.props.style)).toMatchObject({ height: 4, width: '60%' });
    expect(meter.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 60 });
    const info = r.root.findByProps({ testID: 'reputation-info-open' });
    expect(info.props.accessibilityLabel).toBe('Thông tin điểm uy tín');
    expect(info.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(info.props.style)).toMatchObject({ width: 44, height: 44 });
    expect(r.root.findByProps({ testID: 'reputation-ban' }).props.children.join('')).toBe(warning);
    expect(r.root.findByProps({ testID: 'reputation-ban' }).props.accessibilityRole).toBe('alert');
    expect(text(r)).not.toContain('Quy định mặc định');
    expect(text(r)).not.toContain('Lịch sử điểm');
    expect(r.root.findAllByProps({ testID: 'reputation-history-toggle' })).toHaveLength(0);
    act(() => info.props.onPress());
    expect(text(r)).toContain('Quy định mặc định');
    act(() => r.root.findByProps({ accessibilityLabel: 'Đóng thông tin điểm uy tín' }).props.onPress());
    expect(text(r)).not.toContain('Quy định mặc định');
    expect(r.root.findByProps({ testID: 'reputation-ban' }).props.children.join('')).toBe(warning);
  });

  it('shows the correct default policy and actual server events only inside the accessible sheet', async () => {
    api.mine.mockResolvedValue({
      points: 81, resetsAt: '2031-02-03T00:00:00.000Z', suspendedUntil: null, locked: false,
      events: [
        { id: 'e1', kind: 'violation', delta: -19, pointsAfter: 81, reason: 'Lý do từ máy chủ', penalty: 'Tạm khóa theo quyết định đã lưu.', createdAt: '2030-10-01T00:00:00.000Z' },
        { id: 'e2', kind: 'adjustment', delta: 7, pointsAfter: 100, reason: 'Điều chỉnh từ máy chủ', penalty: null, createdAt: '2030-09-30T00:00:00.000Z' },
        { id: 'e3', kind: 'reset', delta: 12, pointsAfter: 100, reason: 'Làm mới từ máy chủ', penalty: null, createdAt: '2030-09-01T00:00:00.000Z' },
      ],
    });
    const r = await mount(role);
    expect(text(r)).not.toContain('Lý do từ máy chủ');
    act(() => r.root.findByProps({ testID: 'reputation-info-open' }).props.onPress());
    expect(r.root.findByType(BottomSheetModal).props.accessible).toBe(false);
    expect(r.root.findByType(BottomSheetModal).props.enablePanDownToClose).toBe(true);
    const details = text(r);
    expect(details).toContain('Quy định mặc định');
    expect(details).toContain(violation);
    expect(details).not.toContain(otherViolation);
    expect(details).toContain('mặc định là 10 điểm');
    expect(details).toContain(`Dưới 70 điểm: ${restriction} 72 giờ. Dưới 40 điểm: 7 ngày. Từ 20 điểm trở xuống: 30 ngày. Hết điểm: khóa tài khoản.`);
    expect(details).toContain('Chu kỳ mặc định là 2 tháng');
    expect(details).toContain('Lần làm mới tiếp theo: 3/2/2031.');
    if (role === 'technician') {
      expect(details).toContain('Cần thay đổi thợ');
      expect(details).toContain('không bị trừ điểm uy tín');
      expect(details).toContain('quản lý dịch vụ xem xét');
    } else {
      expect(details).not.toContain('Cần thay đổi thợ');
    }
    for (const label of ['Trừ điểm', 'Quản lý điều chỉnh', 'Làm mới định kỳ', 'Lý do từ máy chủ', 'Tạm khóa theo quyết định đã lưu.', '07:00 01/10/2030', '-19', '+7', '+12']) {
      expect(details).toContain(label);
    }
    expect(details).not.toContain('Chưa có sự kiện');
    act(() => r.root.findByProps({ accessibilityLabel: 'Đóng thông tin điểm uy tín' }).props.onPress());
    expect(text(r)).not.toContain('Lý do từ máy chủ');
  });

  it('keeps the server lock alert visible before and after dismissing details, even if points are positive', async () => {
    api.mine.mockResolvedValue({ points: 81, resetsAt: null, suspendedUntil: '2030-10-21T03:00:00.000Z', locked: true, events: [] });
    const r = await mount(role);
    const lockWarning = 'Tài khoản đã bị khoá vì hết điểm uy tín. Vui lòng liên hệ bộ phận hỗ trợ.';
    expect(text(r)).toContain(lockWarning);
    expect(text(r)).not.toContain('Bạn tạm thời');
    act(() => r.root.findByProps({ testID: 'reputation-info-open' }).props.onPress());
    expect(text(r)).toContain(lockWarning);
    act(() => r.root.findByProps({ accessibilityLabel: 'Đóng thông tin điểm uy tín' }).props.onPress());
    expect(text(r)).toContain(lockWarning);
    expect(r.root.findByProps({ testID: 'reputation-ban' }).props.accessibilityRole).toBe('alert');
    expect(text(r)).not.toContain('Lịch sử điểm');
  });

  it('does not infer a suspension, reset date or history from points', async () => {
    api.mine.mockResolvedValue({ points: 0, resetsAt: null, suspendedUntil: null, locked: false, events: [] });
    const r = await mount(role);
    expect(r.root.findAllByProps({ testID: 'reputation-ban' })).toHaveLength(0);
    act(() => r.root.findByProps({ testID: 'reputation-info-open' }).props.onPress());
    expect(text(r)).toContain('Chưa có sự kiện thay đổi điểm.');
    expect(text(r)).not.toContain('Lần làm mới tiếp theo');
    expect(text(r)).not.toContain('Trừ điểm ·');
  });

  it('shows loading without inventing a score or event', async () => {
    api.mine.mockReturnValue(new Promise(() => undefined));
    const r = await mount(role);
    expect(text(r)).toContain('Đang tải điểm uy tín...');
    expect(r.root.findAllByProps({ testID: 'reputation-points' })).toHaveLength(0);
    act(() => r.root.findByProps({ testID: 'reputation-info-open' }).props.onPress());
    expect(text(r)).toContain('Chưa tải được lịch sử điểm.');
    expect(text(r)).not.toContain('Chưa có sự kiện');
  });

  it('recovers the actual score after a failed load and explicit retry', async () => {
    api.mine.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ points: 90, resetsAt: null, suspendedUntil: null, locked: false, events: [] });
    const r = await mount(role);
    expect(text(r)).toContain('Chưa tải được điểm uy tín.');
    expect(r.root.findAllByProps({ testID: 'reputation-points' })).toHaveLength(0);
    const retry = r.root.findByProps({ accessibilityLabel: 'Thử lại điểm uy tín' });
    expect(retry.props.accessibilityRole).toBe('button');
    await act(async () => { await retry.props.onPress(); });
    expect(r.root.findByProps({ testID: 'reputation-points' }).props.children[0]).toBe(90);
    expect(text(r)).not.toContain('Chưa tải được điểm uy tín.');
  });
});
