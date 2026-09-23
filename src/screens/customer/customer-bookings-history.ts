import type { BookingItem, BookingsPage } from '../../api/bookings.api';
import type { CanonicalOrderStatus, OrdersPage, ServiceOrderItem } from '../../api/orders.api';
import { UserRole, type UserInfo } from '../../types/auth.types';

export function customerBookingsUserId(session: { isAuthenticated: boolean; user: UserInfo | null }): string | null {
  return session.isAuthenticated && session.user?.role === UserRole.CUSTOMER
    ? session.user.id : null;
}

interface HistorySession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

export interface BookingsHistoryState {
  bookings: BookingItem[];
  orders: ServiceOrderItem[];
  total: number;
  page: number;
  ordersTotal: number;
  ordersPage: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  loadingMoreOrders: boolean;
  error: string | null;
  ordersError: string | null;
}

export const initialHistoryState: BookingsHistoryState = {
  bookings: [], orders: [], total: 0, page: 0, ordersTotal: 0, ordersPage: 0,
  loading: true, refreshing: false, loadingMore: false, loadingMoreOrders: false,
  error: null, ordersError: null,
};

export const BOOKINGS_PAGE_SIZE = 20;
/** Navigate to technician selection only for these list-known statuses without a linked order. */
const RESUMABLE_STATUSES = new Set(['SUBMITTED', 'CLOSED']);

const deniedMessage = 'Không có quyền xem lịch sử đặt lịch. Vui lòng kiểm tra đăng nhập.';

function accessDenied(error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}

/** Real bookingId for safe resume, or null when the row must stay read-only. Never invents IDs. */
export function bookingResumeTarget(booking: BookingItem): string | null {
  if (!booking || typeof booking.id !== 'string' || booking.id.length === 0) return null;
  if (booking.serviceOrderId) return null;
  return RESUMABLE_STATUSES.has(String(booking.status).toUpperCase()) ? booking.id : null;
}

export type HistoryCard =
  | { kind: 'booking'; booking: BookingItem; order: ServiceOrderItem | null }
  | { kind: 'order'; order: ServiceOrderItem };

/**
 * Merge customer-owned bookings with authoritative service orders.
 * An order links to at most one booking via order.bookingId; orders whose
 * booking is absent from loaded pages stay visible as honest standalone cards.
 */
export function mergeHistory(bookings: BookingItem[], orders: ServiceOrderItem[]): HistoryCard[] {
  const remaining = new Map(orders.map((order) => [order.id, order]));
  const cards: HistoryCard[] = bookings.map((booking) => {
    const order = orders.find((candidate) => candidate.bookingId === booking.id) ?? null;
    if (order) remaining.delete(order.id);
    return { kind: 'booking', booking, order };
  });
  for (const order of remaining.values()) cards.push({ kind: 'order', order });
  return cards;
}

function dedupeBookings(existing: BookingItem[], incoming: BookingItem[]): BookingItem[] {
  const seen = new Set(existing.map((booking) => booking.id));
  const merged = [...existing];
  for (const booking of incoming) {
    if (!seen.has(booking.id)) { seen.add(booking.id); merged.push(booking); }
  }
  return merged;
}

function dedupeOrders(existing: ServiceOrderItem[], incoming: ServiceOrderItem[]): ServiceOrderItem[] {
  const seen = new Set(existing.map((order) => order.id));
  const merged = [...existing];
  for (const order of incoming) {
    if (!seen.has(order.id)) { seen.add(order.id); merged.push(order); }
  }
  return merged;
}

/**
 * Merge one fetched orders page. An empty page clamps the total to what is actually
 * loaded so inconsistent metadata can never promise infinite further pages.
 */
function mergeOrdersPage(existing: ServiceOrderItem[], rows: ServiceOrderItem[], total: number, page: number): {
  orders: ServiceOrderItem[]; ordersTotal: number; ordersPage: number;
} {
  const orders = dedupeOrders(existing, rows);
  return {
    orders,
    ordersTotal: rows.length === 0 ? orders.length : total,
    ordersPage: page,
  };
}

export type BookingsTab = 'all' | 'in_progress' | 'completed';
export type BookingsEmptyNote = 'no-match' | 'more-pages';

export interface BookingsView {
  cards: HistoryCard[];
  filtered: HistoryCard[];
  /** Scrollable list branch: cards, banners, or reachable load-more — never a false empty claim. */
  showList: boolean;
  /** Distinct inline note when the list branch has zero matching cards and no error banner. */
  emptyNote: BookingsEmptyNote | null;
  showLoadMore: boolean;
  showLoadMoreOrders: boolean;
  hasMoreOrders: boolean;
  /** Crosswalk complete for the current account: no resume gating needed beyond row data. */
  ordersCoverageComplete: boolean;
  /** Honest X/Y coverage line, or null when no orders are known at all. */
  ordersCoverageText: string | null;
}

function orderBucket(status: CanonicalOrderStatus): 'in_progress' | 'completed' | null {
  const s = String(status).toUpperCase();
  if (['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(s)) return 'in_progress';
  if (s === 'COMPLETED') return 'completed';
  return null;
}

function bookingBucket(status: BookingItem['status']): 'in_progress' | 'completed' | null {
  const s = String(status).toUpperCase();
  if (['SUBMITTED', 'MATCHING', 'MATCHED', 'PENDING', 'CONFIRMED', 'CLOSED'].includes(s)) return 'in_progress';
  if (s === 'CANCELLED') return 'completed';
  return null;
}

function cardBucket(card: HistoryCard): 'in_progress' | 'completed' | null {
  if (card.kind === 'order') return orderBucket(card.order.status);
  if (card.order) return orderBucket(card.order.status);
  return bookingBucket(card.booking.status);
}

function matchesSearch(card: HistoryCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (card.kind === 'order' || card.order) {
    const order = card.kind === 'order' ? card.order : card.order;
    if (order && (order.code?.toLowerCase().includes(q)
      || order.serviceName?.toLowerCase().includes(q)
      || order.technician?.fullName?.toLowerCase().includes(q)
      || order.id.toLowerCase().includes(q))) return true;
  }
  if (card.kind === 'booking') {
    if (card.booking.id.toLowerCase().includes(q)
      || card.booking.serviceName?.toLowerCase().includes(q)
      || card.booking.addressSummary?.toLowerCase().includes(q)
      || card.booking.description?.toLowerCase().includes(q)) return true;
  }
  return false;
}

/**
 * Production branch decisions for the history screen. The screen renders
 * exactly this: loading is handled by the caller; otherwise `showList`
 * selects the scrollable branch (cards and/or banners and/or load-more) and
 * only a truly empty, error-free, fully-loaded state falls to the empty branch.
 */
export function resolveBookingsView(
  state: Pick<BookingsHistoryState, 'bookings' | 'orders' | 'total' | 'loading' | 'error' | 'ordersError'
    | 'ordersTotal' | 'ordersPage' | 'loadingMoreOrders' | 'refreshing'>,
  searchQuery: string,
  activeTab: BookingsTab,
): BookingsView {
  const cards = mergeHistory(state.bookings, state.orders);
  const filtered = cards.filter((card) => {
    if (activeTab === 'in_progress' && cardBucket(card) !== 'in_progress') return false;
    if (activeTab === 'completed' && cardBucket(card) !== 'completed') return false;
    return matchesSearch(card, searchQuery);
  });
  const showLoadMore = state.bookings.length < state.total;
  const hasMoreOrders = state.orders.length < state.ordersTotal;
  const showLoadMoreOrders = hasMoreOrders;
  const ordersCoverageComplete = state.ordersPage >= 1 && !state.ordersError
    && !state.loading && !state.refreshing && !state.loadingMoreOrders && !hasMoreOrders;
  const ordersCoverageText = state.ordersTotal > 0 || state.orders.length > 0
    ? `Đang hiển thị ${state.orders.length}/${state.ordersTotal} đơn` : null;
  const hasFilter = searchQuery.trim().length > 0 || activeTab !== 'all';
  const showList = filtered.length > 0
    || !!state.error || !!state.ordersError || showLoadMore || showLoadMoreOrders || hasFilter;
  const emptyNote: BookingsEmptyNote | null = (!showList || filtered.length > 0
    || !!state.error || !!state.ordersError)
    ? null : (showLoadMore || showLoadMoreOrders ? 'more-pages' : 'no-match');
  return {
    cards, filtered, showList, emptyNote, showLoadMore,
    showLoadMoreOrders, hasMoreOrders, ordersCoverageComplete, ordersCoverageText,
  };
}

/**
 * Resume affordance with crosswalk awareness. When the orders endpoint state
 * is unknown (failed), no resume button is offered even if the row itself
 * looks resumable — the authoritative check happens on the Matching screen.
 */
export function resumeTargetFor(booking: BookingItem, ordersUnknown: boolean): string | null {
  if (ordersUnknown) return null;
  return bookingResumeTarget(booking);
}

/** Display total for an assigned order, or null when pricing is genuinely unknown (never a fake 0đ). */
export function orderTotalText(order: ServiceOrderItem): string | null {
  if (typeof order.grandTotal !== 'number'
    && typeof order.laborTotal !== 'number' && typeof order.partsTotal !== 'number') return null;
  const numberOrZero = (value: unknown) => (typeof value === 'number' ? value : 0);
  const value = numberOrZero(order.grandTotal)
    || numberOrZero(order.laborTotal) + numberOrZero(order.partsTotal);
  return `${value.toLocaleString('vi-VN')}đ`;
}

export interface BookingsHistoryOptions {
  pageSize?: number;
  getOrdersPage?: (page: number, pageSize: number) => Promise<OrdersPage>;
}

export function createBookingsHistoryLoader(
  getBookingsPage: (page: number, pageSize: number) => Promise<BookingsPage>,
  getOrders: () => Promise<ServiceOrderItem[]>,
  write: (state: BookingsHistoryState) => void,
  session: HistorySession,
  options: BookingsHistoryOptions = {},
) {
  const pageSize = options.pageSize ?? BOOKINGS_PAGE_SIZE;
  const getOrdersPage = options.getOrdersPage;
  let state = initialHistoryState;
  let active = false;
  let ownerId: string | null = null;
  let requestGeneration = 0;
  let loaded = false;
  let inFlight: Promise<void> | null = null;
  let unsubscribe: (() => void) | undefined;
  const authorized = () => ownerId !== null && session.getUserId() === ownerId;
  const publish = (patch: Partial<BookingsHistoryState>) => {
    state = { ...state, ...patch };
    if (active) write(state);
  };
  function invalidate() { ++requestGeneration; inFlight = null; }
  function denyAccess() {
    invalidate();
    loaded = false;
    publish({ ...initialHistoryState, loading: false, error: deniedMessage });
  }
  function refresh(force = false): Promise<void> {
    if (!active || !authorized()) return Promise.resolve();
    if (inFlight && !force) return inFlight;
    const generation = ++requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loading: !loaded, refreshing: loaded, loadingMore: false, loadingMoreOrders: false, error: null, ordersError: null });
    const request = (async () => {
      // Launch both endpoints together; a slow bookings page must not delay the orders fetch.
      const bookingsPending = getBookingsPage(1, pageSize).then(
        (page) => ({ ok: true as const, page }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const ordersPending = (getOrdersPage
        ? getOrdersPage(1, pageSize).then(
          (page) => ({ ok: true as const, rows: page.data, total: page.total }),
          (error: unknown) => ({ ok: false as const, error }),
        )
        : getOrders().then(
          (rows) => ({ ok: true as const, rows, total: rows.length }),
          (error: unknown) => ({ ok: false as const, error }),
        ));
      const bookingsOutcome = await bookingsPending;
      const ordersOutcome = await ordersPending;
      if (!valid()) return;
      if (!bookingsOutcome.ok) {
        if (accessDenied(bookingsOutcome.error)) { denyAccess(); return; }
        publish({ error: 'Không thể tải lịch sử đặt lịch. Vui lòng thử lại.' });
      } else {
        loaded = true;
        publish({
          bookings: dedupeBookings([], bookingsOutcome.page.data),
          total: bookingsOutcome.page.total,
          page: 1,
          error: null,
        });
      }
      if (!valid()) return;
      if (!ordersOutcome.ok) {
        if (accessDenied(ordersOutcome.error)) { denyAccess(); return; }
        publish({ ordersError: 'Chưa tải được danh sách đơn đã gán. Lịch Booking vẫn hiển thị; hãy thử lại.' });
      } else if (valid()) {
        const merged = mergeOrdersPage([], ordersOutcome.rows, ordersOutcome.total, 1);
        publish({ orders: merged.orders, ordersTotal: merged.ordersTotal, ordersPage: merged.ordersPage, ordersError: null });
      }
    })().finally(() => {
      if (valid()) publish({ loading: false, refreshing: false });
    });
    inFlight = request;
    void request.then(() => { if (valid()) inFlight = null; });
    return request;
  }
  function loadMore(): Promise<void> {
    if (!active || !authorized() || state.loading || state.refreshing || state.loadingMore) return Promise.resolve();
    if (state.bookings.length >= state.total) return Promise.resolve();
    const nextPage = state.page + 1;
    const generation = requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loadingMore: true });
    return (async () => {
      try {
        const result = await getBookingsPage(nextPage, pageSize);
        if (!valid()) return;
        publish({
          bookings: dedupeBookings(state.bookings, result.data),
          total: result.total,
          page: nextPage,
        });
      } catch (error) {
        if (!valid()) return;
        if (accessDenied(error)) { denyAccess(); return; }
        publish({ error: 'Không thể tải thêm lịch sử. Vui lòng thử lại.' });
      } finally {
        if (valid()) publish({ loadingMore: false });
      }
    })();
  }
  function loadMoreOrders(): Promise<void> {
    if (!active || !authorized() || !getOrdersPage) return Promise.resolve();
    if (state.loading || state.refreshing || state.loadingMoreOrders) return Promise.resolve();
    if (state.orders.length >= state.ordersTotal) return Promise.resolve();
    const nextPage = state.ordersPage + 1;
    const generation = requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loadingMoreOrders: true });
    return (async () => {
      try {
        const result = await getOrdersPage(nextPage, pageSize);
        if (!valid()) return;
        const merged = mergeOrdersPage(state.orders, result.data, result.total, nextPage);
        publish({ orders: merged.orders, ordersTotal: merged.ordersTotal, ordersPage: merged.ordersPage, ordersError: null });
      } catch (error) {
        if (!valid()) return;
        if (accessDenied(error)) { denyAccess(); return; }
        publish({ ordersError: 'Không thể tải thêm đơn đã nhận. Danh sách đã tải được giữ lại; hãy thử lại.' });
      } finally {
        if (valid()) publish({ loadingMoreOrders: false });
      }
    })();
  }
  function blur() {
    active = false;
    invalidate();
    unsubscribe?.();
    unsubscribe = undefined;
  }
  return {
    refresh, blur, loadMore, loadMoreOrders,
    focus() {
      blur();
      const nextOwner = session.getUserId();
      if (nextOwner !== ownerId) { state = initialHistoryState; loaded = false; }
      ownerId = nextOwner;
      active = true;
      unsubscribe = session.subscribe(() => {
        if (session.getUserId() === ownerId) return;
        ownerId = null;
        denyAccess();
      });
      if (!authorized()) { denyAccess(); return Promise.resolve(); }
      return refresh();
    },
  };
}
