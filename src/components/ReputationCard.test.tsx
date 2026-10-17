import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
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
const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON()).replace(/","/g, '');

async function mount(role: 'customer' | 'technician') {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<ReputationCard role={role} />); });
  await act(async () => { await Promise.resolve(); });
  return r;
}

beforeEach(() => jest.clearAllMocks());

describe('ReputationCard', () => {
  it('shows score, ban and wording per role', async () => {
    api.mine.mockResolvedValue({ points: 60, resetsAt: null, suspendedUntil: '2030-10-21T03:00:00.000Z', locked: false, events: [] });
    const c = await mount('customer');
    expect(c.root.findByProps({ testID: 'reputation-points' }).props.children[0]).toBe(60);
    expect(text(c)).toContain('không thể đặt lịch');
    act(() => c.unmount());
    const t = await mount('technician');
    expect(text(t)).toContain('không thể nhận đơn');
    act(() => t.unmount());
  });

  it('says the account is locked at 0 and lists history on demand', async () => {
    api.mine.mockResolvedValue({
      points: 0, resetsAt: null, suspendedUntil: null, locked: true,
      events: [{ id: 'e1', kind: 'violation', delta: -10, pointsAfter: 0, reason: 'Lý do riêng', penalty: null, createdAt: '2030-10-01T00:00:00.000Z' }],
    });
    const r = await mount('customer');
    expect(text(r)).toContain('đã bị khoá');
    expect(text(r)).not.toContain('Lý do riêng');
    expect(r.root.findByProps({ testID: 'reputation-ban' }).props.accessibilityRole).toBe('alert');
    act(() => r.root.findByProps({ testID: 'reputation-info-open' }).props.onPress());
    expect(text(r)).toContain('Quy định mặc định');
    expect(text(r)).toContain('10 điểm');
    expect(text(r)).toContain('2 tháng');
    expect(text(r)).toContain('Trừ điểm');
    expect(text(r)).toContain('-10');
    expect(text(r)).toContain('Lý do riêng');
    act(() => r.unmount());
  });

  it('keeps the technician presentation and history toggle', async () => {
    api.mine.mockResolvedValue({
      points: 81, resetsAt: null, suspendedUntil: null, locked: false,
      events: [{ id: 'tech-e1', kind: 'violation', delta: -10, pointsAfter: 81, reason: 'Thay đổi thợ', penalty: null, createdAt: '2030-10-01T00:00:00.000Z' }],
    });
    const r = await mount('technician');
    expect(text(r)).toContain('tạm khoá nhận đơn');
    expect(r.root.findByProps({ testID: 'reputation-history-toggle' })).toBeDefined();
    expect(r.root.findAllByProps({ testID: 'reputation-info-open' })).toHaveLength(0);
    act(() => r.root.findByProps({ testID: 'reputation-history-toggle' }).props.onPress());
    expect(text(r)).toContain('Thay đổi thợ');
    act(() => r.unmount());
  });

  it('lets the customer close reputation details while keeping the server lock warning visible', async () => {
    api.mine.mockResolvedValue({ points: 0, resetsAt: null, suspendedUntil: null, locked: true, events: [] });
    const r = await mount('customer');
    try {
      act(() => r.root.findByProps({ testID: 'reputation-info-open' }).props.onPress());
      expect(r.root.findByType(BottomSheetModal).props.accessible).toBe(false);
      act(() => r.root.findByProps({ accessibilityLabel: 'Đóng thông tin điểm uy tín' }).props.onPress());
      expect(r.root.findAllByProps({ testID: 'mock-reputation-sheet' })).toHaveLength(0);
      expect(r.root.findByProps({ testID: 'reputation-ban' }).props.accessibilityRole).toBe('alert');
    } finally {
      act(() => r.unmount());
    }
  });

  it('renders the customer score as a compact meter with the server suspension alert visible', async () => {
    api.mine.mockResolvedValue({ points: 60, resetsAt: null, suspendedUntil: '2030-10-21T03:00:00.000Z', locked: false, events: [] });
    const r = await mount('customer');
    const meter = r.root.findByProps({ accessibilityRole: 'progressbar' });
    expect(StyleSheet.flatten(meter.props.style)).toMatchObject({ height: 4 });
    expect(r.root.findByProps({ testID: 'reputation-ban' }).props.accessibilityRole).toBe('alert');
    expect(r.root.findAllByProps({ testID: 'mock-reputation-sheet' })).toHaveLength(0);
    act(() => r.unmount());
  });

  it('shows a retry when loading fails', async () => {
    api.mine.mockRejectedValue(new Error('x'));
    const r = await mount('customer');
    expect(text(r)).toContain('Chưa tải được điểm uy tín');
    act(() => r.unmount());
  });
});
