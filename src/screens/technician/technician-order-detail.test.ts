import {
  createTechOrderDetailLoader,
  historicalSummaryDates,
  isHistoricalOrder,
  resolveJobsView,
  techOrderDetailTarget,
} from './technician-order-detail';
import { technicianJobsUserId } from './technician-jobs-loader';
import { resolveOrderDetailSections } from '../customer/customer-order-detail';
import { UserRole, type UserInfo } from '../../types/auth.types';
import type { ServiceOrderItem } from '../../api/orders.api';
import type { OrderDetailState } from '../customer/customer-order-detail';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';

const order = (overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: ORDER_ID, code: 'SO-1', bookingId: BOOKING_ID, serviceName: 'Tap repair',
  status: 'EN_ROUTE', customerName: 'An', customerPhone: '090', addressSummary: 'HCM',
  scheduledAt: '2030-10-21T10:00:00Z', laborTotal: 100000, partsTotal: 50000, grandTotal: 150000,
  paymentStatus: 'UNPAID', createdAt: '2030-10-20T09:00:00Z',
  ...overrides,
} as ServiceOrderItem);

const historicalRow = () => ({
  id: ORDER_ID, code: 'SO-1', status: 'COMPLETED', createdAt: '2030-10-20T09:00:00Z',
  completedAt: '2030-10-21T12:00:00Z', cancelledAt: null, historical: true,
  customerName: 'LEAK', customerPhone: 'LEAK', addressSummary: 'LEAK', bookingId: 'LEAK',
  laborTotal: 999, grandTotal: 999,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let userSequence = 0;
function setup() {
  let userId: string | null = `technician-${++userSequence}`;
  const listeners = new Set<() => void>();
  const session = {
    getUserId: () => userId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change(id: string | null) { userId = id; listeners.forEach((listener) => listener()); },
  };
  const getOrder = jest.fn<Promise<ServiceOrderItem>, [string]>().mockResolvedValue(order());
  const write = jest.fn<void, [OrderDetailState]>();
  const loader = createTechOrderDetailLoader(getOrder, write, session);
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { getOrder, write, loader, state, session };
}

describe('active vs historical targeting (production helpers)', () => {
  it.each([
    ['active order id', { id: ORDER_ID }, ORDER_ID],
    ['historical row', { id: ORDER_ID, historical: true }, null],
    ['missing id', {}, null],
    ['malformed id', { id: 'not-a-uuid' }, null],
    ['null row', null, null],
  ])('techOrderDetailTarget %s', (_label, job, expected) => {
    expect(techOrderDetailTarget(job)).toBe(expected);
  });

  it('uses the job order id, never a booking id', () => {
    const job = { id: ORDER_ID, bookingId: BOOKING_ID } as { id: string; bookingId: string };
    expect(techOrderDetailTarget(job)).toBe(ORDER_ID);
  });

  it.each([
    [{ historical: true }, true],
    [{ historical: false }, false],
    [{}, false],
    [null, false],
    ['order', false],
  ])('isHistoricalOrder %s', (value, expected) => {
    expect(isHistoricalOrder(value)).toBe(expected);
  });

  it('exposes only sanitized dates for historical cards', () => {
    expect(historicalSummaryDates(historicalRow())).toMatchObject({ created: expect.any(String), ended: expect.any(String) });
    expect(historicalSummaryDates({ createdAt: 'bad-date' })).toMatchObject({ created: null, ended: null });
    expect(historicalSummaryDates(null)).toMatchObject({ created: null, ended: null });
  });
});

describe('technician detail loader (production)', () => {
  it('loads an active assignment with the real order id', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    expect(h.getOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(h.state()).toMatchObject({ order: expect.objectContaining({ id: ORDER_ID }), error: null });
  });

  it('suppresses a historical GET response without rendering any private fields', async () => {
    const h = setup();
    h.getOrder.mockResolvedValue(historicalRow() as unknown as ServiceOrderItem);
    await h.loader.focus(ORDER_ID);
    expect(h.getOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(h.state().order).toBeNull();
    expect(h.state().error).toContain('tóm tắt lưu trữ');
    const rendered = JSON.stringify(h.state());
    expect(rendered).not.toMatch(/LEAK/);
  });

  it.each([401, 403])('purges private detail on denial %s', async (status) => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockRejectedValue({ response: { status } });
    await h.loader.refresh(true);
    expect(h.state().order).toBeNull();
    expect(h.state().error).toContain('quyền');
  });

  it('shows safe copy on 404 and invalid id without leaking orders', async () => {
    const h = setup();
    h.getOrder.mockRejectedValue({ response: { status: 404 } });
    await h.loader.focus(ORDER_ID);
    expect(h.state().order).toBeNull();
    expect(h.state().error).toContain('Không tìm thấy');
    await h.loader.focus('not-a-uuid');
    expect(h.state().error).toContain('không hợp lệ');
  });

  it('keeps last-good active detail on transient failure and recovers on retry', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockRejectedValueOnce(new Error('offline'));
    await h.loader.refresh(true);
    expect(h.state().order).toMatchObject({ id: ORDER_ID });
    expect(h.state().error).toBeTruthy();
    h.getOrder.mockResolvedValue(order({ status: 'UNDER_REPAIR' }));
    await h.loader.refresh(true);
    expect(h.state()).toMatchObject({ order: expect.objectContaining({ status: 'UNDER_REPAIR' }), error: null });
  });

  it('writes nothing after blur and refetches on same-technician refocus', async () => {
    const h = setup();
    const pending = deferred<ServiceOrderItem>();
    h.getOrder.mockReturnValueOnce(pending.promise).mockResolvedValue(order());
    const first = h.loader.focus(ORDER_ID);
    h.loader.blur();
    h.write.mockClear();
    pending.resolve(order());
    await first;
    expect(h.write).not.toHaveBeenCalled();
    await h.loader.focus(ORDER_ID);
    expect(h.getOrder).toHaveBeenCalledTimes(2);
  });

  it('account switch purges detail and invalidates the pending GET', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    const pending = deferred<ServiceOrderItem>();
    h.getOrder.mockReturnValueOnce(pending.promise);
    const request = h.loader.refresh(true);
    h.session.change(null);
    expect(h.state().order).toBeNull();
    h.session.change('other-technician');
    h.getOrder.mockResolvedValue(order());
    await h.loader.focus(ORDER_ID);
    h.write.mockClear();
    pending.resolve(order());
    await request;
    expect(h.write).not.toHaveBeenCalled();
  });

  it('denies customer, admin and unauthenticated sessions before any GET', async () => {
    const tech = { id: 'tech-1', role: UserRole.TECHNICIAN } as UserInfo;
    expect(technicianJobsUserId({ isAuthenticated: true, user: tech })).toBe('tech-1');
    for (const role of [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SERVICE_MANAGER]) {
      const user = { id: 'user-1', role } as UserInfo;
      expect(technicianJobsUserId({ isAuthenticated: true, user })).toBeNull();
    }
    expect(technicianJobsUserId({ isAuthenticated: false, user: tech })).toBeNull();
    const h = setup();
    h.session.change(null);
    await h.loader.focus(ORDER_ID);
    await h.loader.refresh();
    expect(h.getOrder).not.toHaveBeenCalled();
  });

  it('keeps SENT quotations text-only on the technician path', () => {
    const sections = resolveOrderDetailSections(order({
      quotation: { id: 'q1', status: 'sent', laborTotal: 1, partsTotal: 0, items: [] },
    }));
    expect(sections.hasQuotation).toBe(true);
    expect(sections.quotationStatus).toBe('SENT');
    expect(sections.quoteAwaitingDecision).toBe(true);
  });

  it('uses honest nulls for absent quote and pricing', () => {
    const sections = resolveOrderDetailSections({
      ...order(), quotation: undefined, laborTotal: undefined,
      partsTotal: undefined, grandTotal: undefined,
    } as unknown as ServiceOrderItem);
    expect(sections).toMatchObject({ hasQuotation: false, laborText: null, totalText: null });
  });
});

describe('jobs list view-model (resolveJobsView production helper)', () => {
  const job = (id: string, status = 'ACCEPTED'): ServiceOrderItem =>
    ({ id, code: `SO-${id}`, status } as ServiceOrderItem);

  it('keeps load-more reachable when the active tab hides a partially loaded page', () => {
    const jobs = Array.from({ length: 20 }, (_, index) => job(`job-${index}`, 'UNDER_REPAIR'));
    const view = resolveJobsView({ jobs, jobsTotal: 40, loading: false, error: null }, 'pending');
    expect(view.filtered).toHaveLength(0);
    expect(view.showLoadMoreJobs).toBe(true);
    expect(view.emptyNote).toBe('more-pages');
    expect(view.jobsCoverageText).toBe('Đang hiển thị 20/40 việc');
  });

  it('filters tabs loaded-only and reports no-match on terminal pages', () => {
    const jobs = [job('a', 'ACCEPTED'), job('b', 'UNDER_REPAIR'), job('c', 'COMPLETED')];
    const pending = resolveJobsView({ jobs, jobsTotal: 3, loading: false, error: null }, 'pending');
    expect(pending.filtered.map((row) => row.id)).toEqual(['a']);
    expect(pending.showLoadMoreJobs).toBe(false);
    expect(pending.emptyNote).toBeNull();
    const repairing = resolveJobsView({ jobs: [job('a', 'ACCEPTED')], jobsTotal: 1, loading: false, error: null }, 'in_progress');
    expect(repairing.filtered).toHaveLength(0);
    expect(repairing.emptyNote).toBe('no-match');
  });

  it('never claims empty while an error banner is present', () => {
    const view = resolveJobsView({ jobs: [], jobsTotal: 0, loading: false, error: 'Lỗi mạng.' }, 'all');
    expect(view.emptyNote).toBeNull();
    expect(view.jobsCoverageText).toBeNull();
  });
});

describe('refreshVerified receipt on the tech loader (review remediation)', () => {
  it('resolves true on a fresh authorized success and keeps history suppression', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockResolvedValue(order({ status: 'UNDER_REPAIR' }));
    await expect(h.loader.refreshVerified()).resolves.toBe(true);
    expect(h.state().order).toMatchObject({ id: ORDER_ID, status: 'UNDER_REPAIR' });
  });

  it('resolves false on 503 and keeps last-good eligible detail with an error', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockRejectedValueOnce(new Error('offline'));
    await expect(h.loader.refreshVerified()).resolves.toBe(false);
    expect(h.state().order).toMatchObject({ id: ORDER_ID });
    expect(h.state().error).toBeTruthy();
  });

  it('resolves false for a historical GET response without leaking private fields', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockResolvedValueOnce(historicalRow() as unknown as ServiceOrderItem);
    await expect(h.loader.refreshVerified()).resolves.toBe(false);
    expect(h.state().order).toBeNull();
    expect(JSON.stringify(h.state())).not.toMatch(/LEAK/);
  });

  it('resolves false on 401 purge and on stale account switch', async () => {
    const denied = setup();
    await denied.loader.focus(ORDER_ID);
    denied.getOrder.mockRejectedValue({ response: { status: 403 } });
    await expect(denied.loader.refreshVerified()).resolves.toBe(false);
    expect(denied.state().order).toBeNull();

    const switched = setup();
    await switched.loader.focus(ORDER_ID);
    const gate = deferred<ServiceOrderItem>();
    switched.getOrder.mockReturnValueOnce(gate.promise);
    const attempt = switched.loader.refreshVerified();
    switched.session.change('other-technician');
    gate.resolve(order());
    await expect(attempt).resolves.toBe(false);
  });
});
