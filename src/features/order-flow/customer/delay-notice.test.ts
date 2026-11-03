import { DELAY_CHOICES, delayNoticeState, delayReasonText } from './delay-notice';

const order = (status: string, delayNotice: object | null | undefined) => ({ status, delayNotice }) as never;
const notice = (decision: string | null) => ({ minutes: 60, noticedAt: '2026-10-31T03:00:00Z', decision, reasonCode: 'new_fault_found' });

describe('customer delay notice', () => {
  it('asks the customer while the order still waits for the technician and nobody answered', () => {
    expect(delayNoticeState(order('ACCEPTED', notice(null)))).toEqual({ kind: 'ask', minutes: 60, reason: 'phát sinh lỗi thêm' });
    expect(delayNoticeState(order('EN_ROUTE', notice(null)))?.kind).toBe('ask');
  });

  it('shows only a reminder after "wait" and nothing after switch or cancel (the order itself changed)', () => {
    expect(delayNoticeState(order('ACCEPTED', notice('wait')))).toEqual({ kind: 'waiting', minutes: 60 });
    expect(delayNoticeState(order('ACCEPTED', notice('switch')))).toBeNull();
    expect(delayNoticeState(order('CANCELLED', notice('cancel')))).toBeNull();
  });

  it('shows nothing without a notice or once the technician is working', () => {
    expect(delayNoticeState(order('ACCEPTED', null))).toBeNull();
    expect(delayNoticeState(order('ACCEPTED', undefined))).toBeNull();
    expect(delayNoticeState(order('UNDER_REPAIR', notice(null)))).toBeNull();
  });

  it('names the reason, and falls back for one it does not know', () => {
    expect(delayReasonText('waiting_parts')).toBe('chờ linh kiện');
    expect(delayReasonText(null)).toBe('lý do khác');
    expect(delayReasonText('whatever' as never)).toBe('lý do khác');
  });

  it('asks twice before the two choices that end the technician or the order, never for waiting', () => {
    const by = Object.fromEntries(DELAY_CHOICES.map((c) => [c.decision, c]));
    expect(by.wait.confirmText).toBeNull();
    expect(by.switch.confirmText).toContain('giá và lịch hẹn giữ nguyên');
    expect(by.cancel.confirmText).toContain('không mất phí');
  });
});
