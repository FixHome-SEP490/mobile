import type { TechnicianOrderItem } from '../../api/orders.api';
import { delayDraftErrors, delayReportErrorText, isReleaseCandidate, loadReleasable, overrunBlockText, type DelayDraft } from './technician-overrun-release';

const job = (id: string, status: string, extra: object = {}) => ({ id, code: id.toUpperCase(), status, ...extra }) as unknown as TechnicianOrderItem;
const ok = (eligible: boolean) => ({ eligible, block: eligible ? null : 'NOT_STARTING_SOON' as const, currentOrderCode: 'CUR', currentOrderId: 'cur', currentOrderStatus: 'UNDER_REPAIR', windowMinutes: 180, delayNotice: null });

describe('delay report draft', () => {
  const full: DelayDraft = { orderId: 'o', reasonCode: 'new_fault_found', reason: 'Phát sinh lỗi thêm cần thay linh kiện', photoCount: 1, confirmed: true, minutes: 60 };

  it('has no error only with the order, a reason group, a described reason, the minutes, 1-3 photos and the confirmation', () => {
    expect(delayDraftErrors(full)).toEqual({});
  });

  it('names each missing piece on its own field so the message sits next to it', () => {
    expect(delayDraftErrors({ ...full, orderId: null }).order).toContain('đơn kế tiếp');
    expect(delayDraftErrors({ ...full, reasonCode: null }).reasonCode).toContain('nhóm lý do');
    expect(delayDraftErrors({ ...full, reason: '  ngắn  ' }).reason).toContain('10');
    expect(delayDraftErrors({ ...full, reason: 'x'.repeat(2001) }).reason).toContain('2.000');
    expect(delayDraftErrors({ ...full, minutes: null }).minutes).toContain('phút');
    expect(delayDraftErrors({ ...full, minutes: 45 }).minutes).toContain('phút');
    expect(delayDraftErrors({ ...full, photoCount: 0 }).photos).toContain('ảnh');
    expect(delayDraftErrors({ ...full, photoCount: 4 }).photos).toContain('Tối đa 3');
    expect(delayDraftErrors({ ...full, confirmed: false }).confirm).toContain('xác nhận');
  });

  it('reports every missing piece at once, not only the first', () => {
    const empty: DelayDraft = { orderId: null, reasonCode: null, reason: '', photoCount: 0, confirmed: false, minutes: null };
    expect(Object.keys(delayDraftErrors(empty)).sort()).toEqual(['confirm', 'minutes', 'order', 'photos', 'reason', 'reasonCode']);
  });
});

describe('technician delay report helpers', () => {
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

  it('explains every block in terms of reporting a delay', () => {
    expect(overrunBlockText('ALREADY_ARRIVED')).toContain('check-in');
    expect(overrunBlockText('ALREADY_ARRIVED')).toContain('báo trễ');
    expect(overrunBlockText(null)).toBe('Đơn này chưa thể báo trễ.');
  });

  it('prefers the Backend block over a generic message', () => {
    const err = { response: { data: { error: { message: 'x', details: { block: 'NOT_STARTING_SOON' } } } } };
    expect(delayReportErrorText(err)).toBe('Đơn này chưa sắp tới giờ hẹn.');
    expect(delayReportErrorText(new Error('boom'))).toBe('Chưa gửi được báo trễ. Vui lòng thử lại.');
  });
});
