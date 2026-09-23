import {
  bookingResumeTarget,
  createBookingsHistoryLoader,
  customerBookingsUserId,
  initialHistoryState,
  mergeHistory,
  orderTotalText,
  resolveBookingsView,
  resumeTargetFor,
  type BookingsHistoryState,
} from './customer-bookings-history';
import { UserRole, type UserInfo } from '../../types/auth.types';
import type { BookingItem, BookingsPage } from '../../api/bookings.api';
import type { OrdersPage, ServiceOrderItem } from '../../api/orders.api';

const booking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
  id: 'booking-1', customerId: 'customer-1', serviceId: 'service-1', addressId: 'address-1',
  description: 'Leaking tap', status: 'SUBMITTED', urgency: 'NORMAL',
  preferredStartAt: '2030-10-21T10:00:00Z', preferredEndAt: '2030-10-21T12:00:00Z',
  createdAt: '2030-10-20T08:00:00Z',
  ...overrides,
} as BookingItem);

const order = (overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Tap repair',
  status: 'ACCEPTED', customerName: 'An', customerPhone: '090', addressSummary: 'HCM',
  scheduledAt: '2030-10-21T10:00:00Z', laborTotal: 100, partsTotal: 0, grandTotal: 100,
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
function setup(pagedOrders = false) {
  let userId: string | null = `customer-${++userSequence}`;
  const listeners = new Set<() => void>();
  const session = {
    getUserId: () => userId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change(id: string | null) { userId = id; listeners.forEach((listener) => listener()); },
  };
  const getPage = jest.fn<Promise<BookingsPage>, [number, number]>()
    .mockResolvedValue({ data: [], total: 0 });
  const getOrders = jest.fn<Promise<ServiceOrderItem[]>, []>().mockResolvedValue([]);
  const getOrdersPage = jest.fn<Promise<OrdersPage>, [number, number]>()
    .mockResolvedValue({ data: [], total: 0 });
  const write = jest.fn<void, [BookingsHistoryState]>();
  const loader = pagedOrders
    ? createBookingsHistoryLoader(getPage, getOrders, write, session, { getOrdersPage })
    : createBookingsHistoryLoader(getPage, getOrders, write, session);
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { getPage, getOrders, getOrdersPage, write, loader, state, session };
}

it('shows a submitted Booking with no ServiceOrder as a resume candidate', async () => {
  const h = setup();
  h.getPage.mockResolvedValue({ data: [booking()], total: 1 });
  await h.loader.focus();
  expect(h.state()).toMatchObject({ bookings: [expect.objectContaining({ id: 'booking-1' })], total: 1, page: 1 });
  const cards = mergeHistory(h.state().bookings, h.state().orders);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ kind: 'booking', order: null });
  expect(bookingResumeTarget(booking())).toBe('booking-1');
});

it('crosswalks an assigned Booking to its real order without duplicate cards', async () => {
  const h = setup();
  h.getPage.mockResolvedValue({ data: [booking({ status: 'MATCHED', serviceOrderId: 'order-1' })], total: 1 });
  h.getOrders.mockResolvedValue([order()]);
  await h.loader.focus();
  const cards = mergeHistory(h.state().bookings, h.state().orders);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ kind: 'booking', order: expect.objectContaining({ id: 'order-1' }) });
  expect(bookingResumeTarget(booking({ status: 'MATCHED', serviceOrderId: 'order-1' }))).toBeNull();
});

it('keeps a ServiceOrder whose Booking page is not loaded as an honest standalone card', async () => {
  const h = setup();
  h.getPage.mockResolvedValue({ data: [], total: 5 });
  h.getOrders.mockResolvedValue([order({ bookingId: 'booking-elsewhere' })]);
  await h.loader.focus();
  const cards = mergeHistory(h.state().bookings, h.state().orders);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ kind: 'order', order: expect.objectContaining({ id: 'order-1' }) });
});

it('loads more pages explicitly and dedupes repeated Booking IDs', async () => {
  const h = setup();
  h.getPage.mockResolvedValueOnce({ data: [booking()], total: 3 });
  await h.loader.focus();
  h.getPage.mockResolvedValueOnce({ data: [booking(), booking({ id: 'booking-2' })], total: 2 });
  await h.loader.loadMore();
  expect(h.getPage).toHaveBeenLastCalledWith(2, 20);
  expect(h.state().bookings.map((row) => row.id)).toEqual(['booking-1', 'booking-2']);
  expect(h.state().page).toBe(2);
  h.write.mockClear();
  await h.loader.loadMore();
  expect(h.getPage).toHaveBeenCalledTimes(2);
  expect(h.write).not.toHaveBeenCalled();
});

it('ignores duplicate load-more taps while a page is in flight', async () => {
  const h = setup();
  h.getPage.mockResolvedValue({ data: [booking()], total: 3 });
  await h.loader.focus();
  const next = deferred<BookingsPage>();
  h.getPage.mockReturnValueOnce(next.promise);
  const first = h.loader.loadMore();
  const second = h.loader.loadMore();
  expect(h.getPage).toHaveBeenCalledTimes(2);
  next.resolve({ data: [booking({ id: 'booking-2' })], total: 3 });
  await Promise.all([first, second]);
  expect(h.state().bookings.map((row) => row.id)).toEqual(['booking-1', 'booking-2']);
});

it('shows honest partial state when orders fail but bookings succeed', async () => {
  const h = setup();
  h.getPage.mockResolvedValue({ data: [booking()], total: 1 });
  h.getOrders.mockRejectedValueOnce(new Error('offline'));
  await h.loader.focus();
  expect(h.state()).toMatchObject({ bookings: [expect.objectContaining({ id: 'booking-1' })], error: null });
  expect(h.state().ordersError).toBeTruthy();
});

it('keeps previous good data on transient bookings failure instead of faking zero results', async () => {
  const h = setup();
  h.getPage.mockResolvedValueOnce({ data: [booking()], total: 1 });
  await h.loader.focus();
  h.getPage.mockRejectedValueOnce(new Error('offline'));
  await h.loader.refresh();
  expect(h.state().bookings).toHaveLength(1);
  expect(h.state().error).toBeTruthy();
});

it.each([401, 403])('clears prior-account cache when bookings history is denied with %s', async (status) => {
  const h = setup();
  h.getPage.mockResolvedValueOnce({ data: [booking()], total: 1 });
  h.getOrders.mockResolvedValueOnce([order()]);
  await h.loader.focus();
  h.getPage.mockRejectedValue({ response: { status } });
  await h.loader.refresh(true);
  expect(h.state().bookings).toEqual([]);
  expect(h.state().orders).toEqual([]);
  expect(h.state().error).toContain('quyền');
});

it.each([401, 403])('clears cache when the assigned-orders endpoint is denied with %s', async (status) => {
  const h = setup();
  h.getPage.mockResolvedValue({ data: [booking()], total: 1 });
  h.getOrders.mockResolvedValueOnce([order()]);
  await h.loader.focus();
  h.getOrders.mockRejectedValue({ response: { status } });
  await h.loader.refresh(true);
  expect(h.state().bookings).toEqual([]);
  expect(h.state().orders).toEqual([]);
});

it('ignores stale focus responses after blur and refocus', async () => {
  const h = setup();
  const oldPage = deferred<BookingsPage>();
  const oldOrders = deferred<ServiceOrderItem[]>();
  h.getPage.mockReturnValueOnce(oldPage.promise).mockResolvedValue({ data: [booking()], total: 1 });
  h.getOrders.mockReturnValueOnce(oldOrders.promise).mockResolvedValue([]);
  const first = h.loader.focus();
  h.loader.blur();
  await h.loader.focus();
  h.write.mockClear();
  oldPage.resolve({ data: [], total: 0 });
  oldOrders.resolve([order()]);
  await first;
  expect(h.write).not.toHaveBeenCalled();
});

it('account switch clears previous cache and invalidates pending responses', async () => {
  const h = setup();
  h.getPage.mockResolvedValueOnce({ data: [booking()], total: 1 });
  await h.loader.focus();
  const pending = deferred<BookingsPage>();
  h.getPage.mockReturnValueOnce(pending.promise);
  const request = h.loader.refresh(true);
  h.session.change(null);
  expect(h.state().bookings).toEqual([]);
  h.session.change('other-customer');
  h.getPage.mockResolvedValue({ data: [], total: 0 });
  await h.loader.focus();
  h.write.mockClear();
  pending.resolve({ data: [booking()], total: 1 });
  await request;
  expect(h.write).not.toHaveBeenCalled();
});

it('fetches both endpoints again when the history tab regains focus', async () => {
  const h = setup();
  await h.loader.focus();
  expect(h.getPage).toHaveBeenCalledTimes(1);
  expect(h.getOrders).toHaveBeenCalledTimes(1);
  h.loader.blur();
  await h.loader.focus();
  expect(h.getPage).toHaveBeenCalledTimes(2);
  expect(h.getOrders).toHaveBeenCalledTimes(2);
});

it.each([
  ['SUBMITTED', 'booking-1', 'booking-1'],
  ['CLOSED', 'booking-2', 'booking-2'],
  ['MATCHING', 'booking-3', null],
  ['MATCHED', 'booking-4', null],
  ['CANCELLED', 'booking-5', null],
])('resume target for status %s uses only the actual bookingId', (status, id, expected) => {
  expect(bookingResumeTarget(booking({ id, status: status as BookingItem['status'] }))).toBe(expected);
});

it('never resumes when the id is missing or an order is already linked', () => {
  expect(bookingResumeTarget(booking({ id: '' }))).toBeNull();
  expect(bookingResumeTarget(booking({ status: 'SUBMITTED', serviceOrderId: 'order-1' }))).toBeNull();
});

it.each([UserRole.TECHNICIAN, UserRole.ADMIN, UserRole.SERVICE_MANAGER])(
  'production session selector rejects role %s before any history GET',
  async (role) => {
    const user = { id: 'user-1', role } as UserInfo;
    const h = setup();
    h.session.change(customerBookingsUserId({ isAuthenticated: true, user }));
    await h.loader.focus();
    await h.loader.refresh();
    await h.loader.loadMore();
    expect(h.getPage).not.toHaveBeenCalled();
    expect(h.getOrders).not.toHaveBeenCalled();
    expect(customerBookingsUserId({ isAuthenticated: false, user: { ...user, role: UserRole.CUSTOMER } })).toBeNull();
    expect(customerBookingsUserId({ isAuthenticated: true, user: { ...user, role: UserRole.CUSTOMER } })).toBe('user-1');
  },
);

describe('production history view branches (resolveBookingsView)', () => {
  const pageOf = (count: number) =>
    Array.from({ length: count }, (_, index) => booking({ id: `booking-${index}` }));

  it('keeps load-more reachable when the filter hides a partially loaded first page', () => {
    const view = resolveBookingsView(
      { ...initialHistoryState, bookings: pageOf(20), total: 50, loading: false },
      'zzz-no-match',
      'all',
    );
    expect(view.filtered).toHaveLength(0);
    expect(view.showList).toBe(true);
    expect(view.emptyNote).toBe('more-pages');
    expect(view.showLoadMore).toBe(true);
  });

  it('selects the truly-empty branch only with no data, no errors and no pages left', () => {
    const view = resolveBookingsView({ ...initialHistoryState, loading: false }, '', 'all');
    expect(view.cards).toHaveLength(0);
    expect(view.showList).toBe(false);
    expect(view.emptyNote).toBeNull();
    expect(view.showLoadMore).toBe(false);
  });

  it('shows a distinct no-match note for search-only empty on a fully loaded list', () => {
    const view = resolveBookingsView(
      { ...initialHistoryState, bookings: pageOf(3), total: 3, loading: false },
      'zzz-no-match',
      'all',
    );
    expect(view.showList).toBe(true);
    expect(view.emptyNote).toBe('no-match');
    expect(view.showLoadMore).toBe(false);
  });

  it('shows a distinct no-match note when a tab alone filters out a fully loaded list', () => {
    const view = resolveBookingsView(
      { ...initialHistoryState, bookings: pageOf(2), total: 2, loading: false },
      '',
      'completed',
    );
    expect(view.filtered).toHaveLength(0);
    expect(view.showList).toBe(true);
    expect(view.emptyNote).toBe('no-match');
  });

  it('never claims empty when zero bookings coincide with an orders partial failure', () => {
    const view = resolveBookingsView(
      { ...initialHistoryState, loading: false, ordersError: 'Chưa tải được danh sách đơn đã gán.' },
      '',
      'all',
    );
    expect(view.showList).toBe(true);
    expect(view.emptyNote).toBeNull();
  });

  it('keeps the retry-visible list branch on primary bookings failure without cards', () => {
    const view = resolveBookingsView(
      { ...initialHistoryState, loading: false, error: 'Không thể tải lịch sử đặt lịch.' },
      '',
      'all',
    );
    expect(view.showList).toBe(true);
    expect(view.emptyNote).toBeNull();
  });

  it('stops offering load-more on the terminal page', () => {
    const view = resolveBookingsView(
      { ...initialHistoryState, bookings: pageOf(50), total: 50, loading: false },
      '',
      'all',
    );
    expect(view.showLoadMore).toBe(false);
    expect(view.filtered).toHaveLength(50);
    expect(view.emptyNote).toBeNull();
  });
});

describe('resume guard and honest pricing (production helpers)', () => {
  it('suppresses resume while the orders crosswalk is unknown', () => {
    expect(resumeTargetFor(booking({ status: 'SUBMITTED' }), true)).toBeNull();
    expect(resumeTargetFor(booking({ status: 'SUBMITTED' }), false)).toBe('booking-1');
    expect(resumeTargetFor(booking({ status: 'MATCHING' }), false)).toBeNull();
  });

  it('formats real order totals without fabricating 0đ for unknown pricing', () => {
    expect(orderTotalText(order({ grandTotal: 250000 }))).toContain('250');
    expect(orderTotalText(order({ grandTotal: 0, laborTotal: 100000, partsTotal: 0 }))).toContain('100');
    expect(orderTotalText({} as ServiceOrderItem)).toBeNull();
  });
});

describe('independent assigned-orders pagination (P3B1b production loader)', () => {
  const pageOfBookings = (count: number, prefix = 'booking') =>
    Array.from({ length: count }, (_, index) => booking({ id: `${prefix}-${index}` }));
  const pageOfOrders = (count: number, bookingPrefix = 'elsewhere') =>
    Array.from({ length: count }, (_, index) => order({
      id: `order-${index}`, code: `SO-${index}`, bookingId: `${bookingPrefix}-${index}`,
    }));

  it('completes the crosswalk when the matching order arrives on orders page 2', async () => {
    const h = setup(true);
    const bookings = pageOfBookings(20);
    bookings[5] = booking({ id: 'booking-target', status: 'SUBMITTED' });
    h.getPage.mockResolvedValue({ data: bookings, total: 25 });
    h.getOrdersPage
      .mockResolvedValueOnce({ data: pageOfOrders(20), total: 40 })
      .mockResolvedValueOnce({
        data: [order({ id: 'order-target', code: 'SO-T', bookingId: 'booking-target' })],
        total: 40,
      });
    await h.loader.focus();
    expect(h.getOrdersPage).toHaveBeenCalledWith(1, 20);
    expect(h.state()).toMatchObject({ ordersPage: 1 });
    let cards = mergeHistory(h.state().bookings, h.state().orders);
    expect(cards.find((card) => card.kind === 'booking'
      && card.booking.id === 'booking-target')).toMatchObject({ order: null });
    await h.loader.loadMoreOrders();
    expect(h.getOrdersPage).toHaveBeenLastCalledWith(2, 20);
    expect(h.state().ordersPage).toBe(2);
    cards = mergeHistory(h.state().bookings, h.state().orders);
    expect(cards.find((card) => card.kind === 'booking'
      && card.booking.id === 'booking-target')).toMatchObject({
        order: expect.objectContaining({ id: 'order-target' }),
      });
  });

  it('dedupes repeated order ids across pages and ignores duplicate taps', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfOrders(20), total: 40 });
    await h.loader.focus();
    const next = deferred<OrdersPage>();
    h.getOrdersPage.mockReturnValueOnce(next.promise);
    const first = h.loader.loadMoreOrders();
    const second = h.loader.loadMoreOrders();
    expect(h.getOrdersPage).toHaveBeenCalledTimes(2);
    next.resolve({ data: [...pageOfOrders(20), order({ id: 'order-new', bookingId: 'booking-new' })], total: 40 });
    await Promise.all([first, second]);
    const ids = h.state().orders.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('order-new');
  });

  it('stops on the terminal orders page', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfOrders(20), total: 20 });
    await h.loader.focus();
    h.write.mockClear();
    await h.loader.loadMoreOrders();
    expect(h.getOrdersPage).toHaveBeenCalledTimes(1);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('clamps inconsistent metadata when a page returns zero rows', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: [], total: 50 });
    await h.loader.focus();
    expect(h.state().orders).toEqual([]);
    const view = resolveBookingsView(h.state(), '', 'all');
    expect(view.showLoadMoreOrders).toBe(false);
    expect(view.ordersCoverageText).toBeNull();
    h.write.mockClear();
    await h.loader.loadMoreOrders();
    expect(h.getOrdersPage).toHaveBeenCalledTimes(1);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('keeps page-1 orders on transient page-2 failure with honest retry', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfOrders(20), total: 40 });
    await h.loader.focus();
    h.getOrdersPage.mockRejectedValueOnce(new Error('offline'));
    await h.loader.loadMoreOrders();
    expect(h.state().orders).toHaveLength(20);
    expect(h.state().ordersError).toBeTruthy();
    expect(h.state().ordersPage).toBe(1);
    h.getOrdersPage.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, index) => order({
        id: `order-p2-${index}`, code: `SO-P2-${index}`, bookingId: `booking-p2-${index}`,
      })),
      total: 40,
    });
    await h.loader.loadMoreOrders();
    expect(h.state().orders).toHaveLength(25);
    expect(h.state().ordersError).toBeNull();
  });

  it.each([401, 403])('purges private rows on orders page-2 denial %s', async (status) => {
    const h = setup(true);
    h.getPage.mockResolvedValue({ data: pageOfBookings(2), total: 2 });
    h.getOrdersPage.mockResolvedValue({ data: pageOfOrders(20), total: 40 });
    await h.loader.focus();
    h.getOrdersPage.mockRejectedValue({ response: { status } });
    await h.loader.loadMoreOrders();
    expect(h.state().bookings).toEqual([]);
    expect(h.state().orders).toEqual([]);
    expect(h.state().error).toContain('quyền');
  });

  it('discards a stale loadMoreOrders response after blur and refocus', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfOrders(20), total: 40 });
    await h.loader.focus();
    const pending = deferred<OrdersPage>();
    h.getOrdersPage.mockReturnValueOnce(pending.promise);
    const request = h.loader.loadMoreOrders();
    h.loader.blur();
    await h.loader.focus();
    h.write.mockClear();
    pending.resolve({ data: pageOfOrders(20, 'stale'), total: 40 });
    await request;
    expect(h.write).not.toHaveBeenCalled();
  });

  it('account switch clears paged orders and invalidates the pending page', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfOrders(20), total: 40 });
    await h.loader.focus();
    const pending = deferred<OrdersPage>();
    h.getOrdersPage.mockReturnValueOnce(pending.promise);
    const request = h.loader.loadMoreOrders();
    h.session.change(null);
    expect(h.state().orders).toEqual([]);
    h.session.change('other-customer');
    h.getOrdersPage.mockResolvedValue({ data: [], total: 0 });
    await h.loader.focus();
    h.write.mockClear();
    pending.resolve({ data: pageOfOrders(20, 'stale'), total: 40 });
    await request;
    expect(h.write).not.toHaveBeenCalled();
  });
});

describe('orders coverage view-model (resolveBookingsView)', () => {
  const pageOfBookings = (count: number) =>
    Array.from({ length: count }, (_, index) => booking({ id: `booking-${index}` }));

  it('keeps order load-more reachable when filtered cards are empty and Booking pages are exhausted', () => {
    const view = resolveBookingsView(
      {
        ...initialHistoryState, loading: false, bookings: pageOfBookings(20), total: 20,
        orders: [], ordersTotal: 40, ordersPage: 1, loadingMoreOrders: false,
      },
      'zzz-no-match',
      'all',
    );
    expect(view.filtered).toHaveLength(0);
    expect(view.showList).toBe(true);
    expect(view.emptyNote).toBe('more-pages');
    expect(view.showLoadMore).toBe(false);
    expect(view.showLoadMoreOrders).toBe(true);
    expect(view.ordersCoverageText).toBe('Đang hiển thị 0/40 đơn');
  });

  it('reports complete coverage only with all order pages loaded and no pending or failed state', () => {
    const view = resolveBookingsView(
      {
        ...initialHistoryState, loading: false, bookings: pageOfBookings(2), total: 2,
        orders: [order()], ordersTotal: 1, ordersPage: 1, loadingMoreOrders: false,
      },
      '',
      'all',
    );
    expect(view.hasMoreOrders).toBe(false);
    expect(view.ordersCoverageComplete).toBe(true);
    expect(view.ordersCoverageText).toBe('Đang hiển thị 1/1 đơn');
    expect(resumeTargetFor(booking({ status: 'SUBMITTED' }), !view.ordersCoverageComplete))
      .toBe('booking-1');
  });

  it.each([
    ['more order pages remain', { ordersTotal: 40, ordersPage: 1, loadingMoreOrders: false as boolean, ordersError: null as string | null, loading: false, refreshing: false }],
    ['orders failed', { ordersTotal: 20, ordersPage: 1, loadingMoreOrders: false, ordersError: 'Lỗi.', loading: false, refreshing: false }],
    ['orders page in flight', { ordersTotal: 20, ordersPage: 1, loadingMoreOrders: true, ordersError: null, loading: false, refreshing: false }],
    ['refresh in flight', { ordersTotal: 1, ordersPage: 1, loadingMoreOrders: false, ordersError: null, loading: false, refreshing: true }],
    ['orders never loaded', { ordersTotal: 0, ordersPage: 0, loadingMoreOrders: false, ordersError: null, loading: false, refreshing: false }],
  ])('withholds early resume while %s', (_label, ordersStream) => {
    const view = resolveBookingsView(
      {
        ...initialHistoryState, bookings: pageOfBookings(1), total: 1,
        orders: ordersStream.ordersPage >= 1 && !ordersStream.ordersError ? [order()] : [],
        ...ordersStream,
      },
      '',
      'all',
    );
    expect(view.ordersCoverageComplete).toBe(false);
    expect(resumeTargetFor(booking({ status: 'SUBMITTED' }), !view.ordersCoverageComplete)).toBeNull();
  });
});
