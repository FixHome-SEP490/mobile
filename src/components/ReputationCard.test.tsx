import React from 'react';
import { act, create } from 'react-test-renderer';
import { reputationApi } from '../api/reputation.api';
import ReputationCard from './ReputationCard';

jest.mock('../api/reputation.api', () => ({ reputationApi: { mine: jest.fn() } }));
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
    act(() => r.root.findByProps({ testID: 'reputation-history-toggle' }).props.onPress());
    expect(text(r)).toContain('Trừ điểm');
    expect(text(r)).toContain('-10');
    expect(text(r)).toContain('Lý do riêng');
    act(() => r.unmount());
  });

  it('shows a retry when loading fails', async () => {
    api.mine.mockRejectedValue(new Error('x'));
    const r = await mount('customer');
    expect(text(r)).toContain('Chưa tải được điểm uy tín');
    act(() => r.unmount());
  });
});
