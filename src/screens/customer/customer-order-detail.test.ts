import {
  createOrderDetailLoader,
  initialOrderDetailState,
  orderDetailTarget,
  quotationItemsList,
  resolveOrderDetailSections,
  type OrderDetailState,
} from './customer-order-detail';
import { customerBookingsUserId } from './customer-bookings-history';
import { UserRole, type UserInfo } from '../../types/auth.types';
import type { ServiceOrderItem } from '../../api/orders.api';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';

const order = (overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: ORDER_ID, code: 'SO-1', bookingId: BOOKING_ID, serviceName: 'Tap repair',
  status: 'EN_ROUTE', customerName: 'An', customerPhone: '090', addressSummary: 'HCM',
  scheduledAt: '2030-10-21T10:00:00Z', laborTotal: 100000, partsTotal: 50000, grandTotal: 150000,
  paymentStatus: 'UNPAID', createdAt: '2030-10-20T09:00:00Z',
  ...overrides,
} as ServiceOrderItem);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let userSequence = 0;
function setup() {
  let userId: string | null = `customer-${++userSequence}`;
  const listeners = new Set<() => void>();
  const session = {
    getUserId: () => userId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change(id: string | null) { userId = id; listeners.forEach((listener) => listener()); },
  };
  const getOrder = jest.fn<Promise<ServiceOrderItem>, [string]>().mockResolvedValue(order());
  const write = jest.fn<void, [OrderDetailState]>();
  const loader = createOrderDetailLoader(getOrder, write, session);
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { getOrder, write, loader, state, session };
}

it('loads the real order detail for the requested serviceOrderId', async () => {
  const h = setup();
  await h.loader.focus(ORDER_ID);
  expect(h.getOrder).toHaveBeenCalledWith(ORDER_ID);
  expect(h.state()).toMatchObject({ order: expect.objectContaining({ id: ORDER_ID }), error: null, loading: false });
});

it('passes only the authoritative order.id, never a booking id or fake route', () => {
  expect(orderDetailTarget(ORDER_ID)).toBe(ORDER_ID);
  expect(orderDetailTarget('')).toBeNull();
  expect(orderDetailTarget('not-a-uuid')).toBeNull();
  expect(orderDetailTarget(undefined)).toBeNull();
  // A booking UUID is well-formed but must never reach this loader as an order id:
  // the history call site passes order.id; a mismatched payload is rejected below.
});

it('rejects a mismatched payload instead of showing another order', async () => {
  const h = setup();
  h.getOrder.mockResolvedValue(order({ id: '33333333-3333-4333-8333-333333333333' }));
  await h.loader.focus(ORDER_ID);
  expect(h.state().order).toBeNull();
  expect(h.state().error).toBeTruthy();
});

it('never requests an invalid id from the backend', async () => {
  const h = setup();
  await h.loader.focus('not-a-uuid');
  expect(h.getOrder).not.toHaveBeenCalled();
  expect(h.state().order).toBeNull();
  expect(h.state().error).toContain('không hợp lệ');
});

it.each([401, 403])('clears private detail on access denial %s', async (status) => {
  const h = setup();
  await h.loader.focus(ORDER_ID);
  h.getOrder.mockRejectedValue({ response: { status } });
  await h.loader.refresh(true);
  expect(h.state().order).toBeNull();
  expect(h.state().error).toContain('quyền');
});

it('shows a safe not-found message on 404 without leaking other orders', async () => {
  const h = setup();
  h.getOrder.mockRejectedValue({ response: { status: 404 } });
  await h.loader.focus(ORDER_ID);
  expect(h.state().order).toBeNull();
  expect(h.state().error).toContain('Không tìm thấy');
});

it('keeps last-good detail on transient failure and recovers on manual retry', async () => {
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

it('retries an initially failed GET without fabricating state', async () => {
  const h = setup();
  h.getOrder.mockRejectedValueOnce(new Error('offline'));
  await h.loader.focus(ORDER_ID);
  expect(h.state().order).toBeNull();
  expect(h.state().error).toBeTruthy();
  h.getOrder.mockResolvedValue(order());
  await h.loader.refresh();
  expect(h.state().order).toMatchObject({ id: ORDER_ID });
});

it('writes nothing after blur and refetches on same-user refocus', async () => {
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
  expect(h.state().order).toMatchObject({ id: ORDER_ID });
});

it('account switch clears private detail and invalidates the pending GET', async () => {
  const h = setup();
  await h.loader.focus(ORDER_ID);
  const pending = deferred<ServiceOrderItem>();
  h.getOrder.mockReturnValueOnce(pending.promise);
  const request = h.loader.refresh(true);
  h.session.change(null);
  expect(h.state().order).toBeNull();
  h.session.change('other-customer');
  h.getOrder.mockResolvedValue(order());
  await h.loader.focus(ORDER_ID);
  h.write.mockClear();
  pending.resolve(order());
  await request;
  expect(h.write).not.toHaveBeenCalled();
});

it('resets detail when focusing a different order id', async () => {
  const h = setup();
  await h.loader.focus(ORDER_ID);
  const other = '44444444-4444-4444-8444-444444444444';
  h.getOrder.mockResolvedValue(order({ id: other }));
  await h.loader.focus(other);
  expect(h.getOrder).toHaveBeenLastCalledWith(other);
  expect(h.state().order).toMatchObject({ id: other });
});

it.each([UserRole.TECHNICIAN, UserRole.ADMIN, UserRole.SERVICE_MANAGER])(
  'production selector rejects role %s before any detail GET',
  async (role) => {
    const user = { id: 'user-1', role } as UserInfo;
    const h = setup();
    h.session.change(customerBookingsUserId({ isAuthenticated: true, user }));
    await h.loader.focus(ORDER_ID);
    await h.loader.refresh();
    expect(h.getOrder).not.toHaveBeenCalled();
  },
);

describe('production detail sections (resolveOrderDetailSections)', () => {
  it('exposes real technician, pricing, quotation, timeline and evidence counts', () => {
    const sections = resolveOrderDetailSections(order({
      technician: { id: 't1', fullName: 'Tho A', phoneNumber: '091', averageRating: 4.5 },
      quotation: { id: 'q1', status: 'SENT', laborTotal: 100000, partsTotal: 50000, items: [] },
      timeline: [{ status: 'EN_ROUTE', title: 'Tech en route', timestamp: '2030-10-21T09:00:00Z', actor: 'technician' }],
      beforeEvidenceCount: 2, afterEvidenceCount: 0,
    }));
    expect(sections).toMatchObject({
      hasTechnician: true, technicianName: 'Tho A', technicianPhone: '091',
      laborText: expect.stringContaining('100'), partsText: expect.stringContaining('50'),
      totalText: expect.stringContaining('150'),
      hasQuotation: true, quotationStatus: 'SENT', quoteAwaitingDecision: true,
      hasTimeline: true, beforeCount: 2, afterCount: 0,
    });
  });

  it('marks a SENT quotation read-only with no decision affordance in the view-model', () => {
    const sections = resolveOrderDetailSections(order({
      quotation: { id: 'q1', status: 'sent', laborTotal: 1, partsTotal: 0, items: [] },
    }));
    expect(sections.quotationStatus).toBe('SENT');
    expect(sections.quoteAwaitingDecision).toBe(true);
    expect(sections).not.toHaveProperty('approveAction');
    expect(sections).not.toHaveProperty('rejectAction');
  });

  it('uses honest nulls for unknown technician, pricing, quotation and timeline', () => {
    const sections = resolveOrderDetailSections({ ...order(), technician: undefined, quotation: undefined, timeline: undefined,
      laborTotal: undefined, partsTotal: undefined, grandTotal: undefined } as unknown as ServiceOrderItem);
    expect(sections).toMatchObject({
      hasTechnician: false, technicianName: null,
      laborText: null, partsText: null, totalText: null,
      hasQuotation: false, quotationStatus: null, quoteAwaitingDecision: false,
      hasTimeline: false, beforeCount: null,
    });
  });

  it('returns empty sections for a null order', () => {
    expect(resolveOrderDetailSections(null)).toMatchObject({ hasTechnician: false, hasQuotation: false, hasTimeline: false, totalText: null });
  });
});

it('shares the initial state shape', () => {
  expect(initialOrderDetailState).toMatchObject({ order: null, loading: true, error: null });
});

describe('production quotation items guard (quotationItemsList)', () => {
  const line = { description: 'Thay tụ', quantity: 1, unitPrice: 180000, lineTotal: 180000, type: 'PARTS' as const };

  it.each([undefined, null, 'not-an-array'])(
    'returns an empty renderer list for absent items (%s) while keeping SENT read-only',
    (items) => {
      const quoted = order({ quotation: { id: 'q1', status: 'sent', laborTotal: 1, partsTotal: 0, items: items as unknown as [] } });
      expect(quotationItemsList(quoted)).toEqual([]);
      const sections = resolveOrderDetailSections(quoted);
      expect(sections.hasQuotation).toBe(true);
      expect(sections.quotationStatus).toBe('SENT');
      expect(sections.quoteAwaitingDecision).toBe(true);
    },
  );

  it('passes real line items through untouched', () => {
    const quoted = order({ quotation: { id: 'q1', status: 'SENT', laborTotal: 1, partsTotal: 0, items: [line] } });
    expect(quotationItemsList(quoted)).toEqual([line]);
  });

  it('returns an empty list for a null order', () => {
    expect(quotationItemsList(null)).toEqual([]);
  });
});

describe('refreshVerified receipt (ambiguous-retry remediation)', () => {
  it('resolves true only after a new forced GET publishes valid detail', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockResolvedValue(order({ status: 'UNDER_REPAIR' }));
    await expect(h.loader.refreshVerified()).resolves.toBe(true);
    expect(h.getOrder).toHaveBeenCalledTimes(2);
    expect(h.state()).toMatchObject({ order: expect.objectContaining({ status: 'UNDER_REPAIR' }), error: null });
  });

  it('resolves false on 503/offline and keeps last-good detail with an error', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockRejectedValueOnce(new Error('offline'));
    await expect(h.loader.refreshVerified()).resolves.toBe(false);
    expect(h.state().order).toMatchObject({ id: ORDER_ID });
    expect(h.state().error).toBeTruthy();
  });

  it('resolves false on 401/403 and purges private detail', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockRejectedValue({ response: { status: 401 } });
    await expect(h.loader.refreshVerified()).resolves.toBe(false);
    expect(h.state().order).toBeNull();
  });

  it('resolves false on 404, invalid id, and mismatched payload', async () => {
    const missing = setup();
    await missing.loader.focus(ORDER_ID);
    missing.getOrder.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(missing.loader.refreshVerified()).resolves.toBe(false);
    expect(missing.state().order).toBeNull();

    const invalid = setup();
    await invalid.loader.focus('not-a-uuid');
    const callsBefore = invalid.getOrder.mock.calls.length;
    await expect(invalid.loader.refreshVerified()).resolves.toBe(false);
    expect(invalid.getOrder.mock.calls.length).toBe(callsBefore);

    const mismatched = setup();
    await mismatched.loader.focus(ORDER_ID);
    mismatched.getOrder.mockResolvedValueOnce(order({ id: '33333333-3333-4333-8333-333333333333' }));
    await expect(mismatched.loader.refreshVerified()).resolves.toBe(false);
    expect(mismatched.state().order).toBeNull();
  });

  it('resolves false when blurred or the account switches mid-flight', async () => {
    const h = setup();
    const pending = deferred<ServiceOrderItem>();
    h.getOrder.mockReturnValueOnce(pending.promise);
    const first = h.loader.focus(ORDER_ID);
    h.loader.blur();
    pending.resolve(order());
    await first;
    await expect(h.loader.refreshVerified()).resolves.toBe(false);

    const switched = setup();
    await switched.loader.focus(ORDER_ID);
    const gate = deferred<ServiceOrderItem>();
    switched.getOrder.mockReturnValueOnce(gate.promise);
    const attempt = switched.loader.refreshVerified();
    switched.session.change('other-customer');
    gate.resolve(order());
    await expect(attempt).resolves.toBe(false);
  });

  it('resolves false for a reused in-flight GET, never a fresh verification', async () => {
    const h = setup();
    await h.loader.focus(ORDER_ID);
    const pending = deferred<ServiceOrderItem>();
    h.getOrder.mockReturnValueOnce(pending.promise);
    const first = h.loader.refreshVerified();
    await expect(h.loader.refreshVerified()).resolves.toBe(false);
    pending.resolve(order());
    await expect(first).resolves.toBe(true);
    expect(h.getOrder).toHaveBeenCalledTimes(2);
  });

  it('resolves false when the loader was never focused', async () => {
    const h = setup();
    await expect(h.loader.refreshVerified()).resolves.toBe(false);
    expect(h.getOrder).not.toHaveBeenCalled();
  });
});
