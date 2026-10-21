import type { TechnicianOrderItem } from '../../api/orders.api';
import { isReleaseCandidate, loadReleasable, releaseConfirmText, releaseErrorText, overrunBlockText } from './technician-overrun-release';

const job = (id: string, status: string, extra: object = {}) => ({ id, code: id.toUpperCase(), status, ...extra }) as unknown as TechnicianOrderItem;
const ok = (eligible: boolean) => ({ eligible, block: eligible ? null : 'NOT_STARTING_SOON' as const, currentOrderCode: 'CUR', windowMinutes: 180 });

describe('technician overrun release', () => {
  it('only active ACCEPTED/EN_ROUTE orders are candidates', () => {
    expect(isReleaseCandidate(job('a', 'ACCEPTED'))).toBe(true);
    expect(isReleaseCandidate(job('b', 'EN_ROUTE'))).toBe(true);
    expect(isReleaseCandidate(job('c', 'UNDER_REPAIR'))).toBe(false);
    expect(isReleaseCandidate(job('d', 'ACCEPTED', { historical: true }))).toBe(false);
  });

  it('keeps eligible orders, drops ineligible ones and counts unreadable ones', async () => {
    const getStatus = jest.fn(async (id: string) => {
      if (id === 'x') throw new Error('offline');
      return ok(id === 'a');
    });
    const result = await loadReleasable([job('a', 'ACCEPTED'), job('b', 'EN_ROUTE'), job('x', 'ACCEPTED'), job('u', 'UNDER_REPAIR')], getStatus);
    expect(getStatus).toHaveBeenCalledTimes(3);
    expect(result.items.map((i) => i.job.id)).toEqual(['a']);
    expect(result.failed).toBe(1);
  });

  it('explains every block and the confirmation without a penalty', () => {
    expect(overrunBlockText('ALREADY_ARRIVED')).toContain('check-in');
    expect(overrunBlockText(null)).toBe('Đơn này chưa thể nhả.');
    expect(releaseConfirmText('A1', 'B2')).toContain('đơn #B2');
    expect(releaseConfirmText('A1', null)).toContain('không bị trừ điểm');
  });

  it('prefers the Backend block over a generic message', () => {
    const err = { response: { data: { error: { message: 'x', details: { block: 'NOT_STARTING_SOON' } } } } };
    expect(releaseErrorText(err)).toBe('Đơn này chưa sắp tới giờ hẹn.');
    expect(releaseErrorText(new Error('boom'))).toBe('Không thể nhả đơn lúc này. Vui lòng thử lại.');
  });
});
