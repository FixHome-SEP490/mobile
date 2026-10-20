import type { bookingsApi, InvitationItem } from '../../api/bookings.api';
import { isHistoricalOrder, type TechnicianOrderItem, type TechnicianOrdersPage } from '../../api/orders.api';
import { entryAttemptJournal, newEntryIntentId } from '../../features/order-flow/runtime/entry-attempt-production';
import type { EntryAttemptJournal } from '../../features/order-flow/runtime/entry-attempt-journal';

type Action = 'ACCEPT' | 'DECLINE';

/** Technician GETs accept sanitized history; never use the Customer full-order parser here. */
interface ReconciliationOrdersApi {
  getMyOrdersPage: (page: number, pageSize: number) => Promise<TechnicianOrdersPage>;
  getOrder: (id: string) => Promise<TechnicianOrderItem>;
}

interface TechnicianSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

interface PendingResponse {
  action: Action;
  bookingId: string;
  intentId: string;
  expectedOrderId?: string;
}

interface AccountResponses {
  pending: Map<string, PendingResponse>;
  completed: Set<string>;
}

// UI cache only. Durable journal below remains the authority across process restart.
// Retain only user/invitation/booking IDs and action, never tokens, previews or order data.
// Logout is not proof a POST stopped: do not erase uncertainty on logout/login.
// No startup/background POST replay.
const accountResponses = new Map<string, AccountResponses>();

function responsesFor(userId: string): AccountResponses {
  let responses = accountResponses.get(userId);
  if (!responses) {
    responses = { pending: new Map(), completed: new Set() };
    accountResponses.set(userId, responses);
  }
  return responses;
}

export interface InboxState {
  invitations: InvitationItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  actionInFlight: Record<string, Action>;
  acceptedOrderId: string | null;
  recoveryPending: boolean;
}

interface Notice {
  title: string;
  message: string;
  orderId?: string;
}

export const initialInboxState: InboxState = {
  invitations: [],
  loading: true,
  refreshing: false,
  error: null,
  actionInFlight: {},
  acceptedOrderId: null,
  recoveryPending: false,
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;
const MAX_RECONCILIATION_PAGES = 100;

export function isActionable(inv: InvitationItem): boolean {
  return (
    inv.status === 'PENDING' &&
    inv.expiresAt !== null &&
    Date.parse(inv.expiresAt) > Date.now()
  );
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response
    ?.status;
}

type OrderVerification =
  | { state: 'verified'; orderId: string }
  | { state: 'not-current' }
  | { state: 'unknown' };

function isCurrentAssignedOrder(
  order: TechnicianOrderItem,
  orderId: string,
  bookingId: string,
  technicianId: string,
): boolean {
  return (
    !isHistoricalOrder(order) && order.id === orderId &&
    order.bookingId === bookingId &&

    order.technician?.id === technicianId
  );
}

async function verifyOrderId(
  orderApi: ReconciliationOrdersApi,
  orderId: string,
  bookingId: string,
  technicianId: string,
  stillCurrent: () => boolean,
): Promise<OrderVerification> {
  if (!UUID.test(orderId)) return { state: 'unknown' };
  if (!stillCurrent()) return { state: 'unknown' };

  try {
    const detail = await orderApi.getOrder(orderId);
    if (!stillCurrent()) return { state: 'unknown' };
    if (
      isCurrentAssignedOrder(detail, orderId, bookingId, technicianId)
    ) {
      return { state: 'verified', orderId };
    }
    return { state: 'not-current' };
  } catch {
    return { state: 'unknown' };
  }
}

async function findCurrentAssignedOrderForBooking(
  orderApi: ReconciliationOrdersApi,
  bookingId: string,
  technicianId: string,
  stillCurrent: () => boolean,
): Promise<string | null> {
  let seen = 0;

  for (let page = 1; page <= MAX_RECONCILIATION_PAGES; page += 1) {
    if (!stillCurrent()) return null;

    let result;
    try {
      result = await orderApi.getMyOrdersPage(page, PAGE_SIZE);
    } catch {
      return null;
    }
    if (!stillCurrent()) return null;

    for (const row of result.data) {
      if (
        isHistoricalOrder(row) ||
        row.bookingId !== bookingId ||
        !UUID.test(row.id)
      ) {
        continue;
      }

      const verified = await verifyOrderId(
        orderApi,
        row.id,
        bookingId,
        technicianId,
        stillCurrent,
      );
      if (verified.state === 'verified') return verified.orderId;
      if (!stillCurrent()) return null;
    }

    seen += result.data.length;
    if (result.data.length === 0 || seen >= result.total) break;
  }

  // Absence from the paginated Jobs list is NOT proof that an ambiguous
  // ACCEPT failed; the caller keeps the no-repost lock.
  return null;
}

// One instance per screen ref. Transport is injected so tests exercise this exact controller.
export function createInvitationInbox(
  api: Pick<typeof bookingsApi, 'getMyInvitations' | 'respondInvitation'>,
  orderApi: ReconciliationOrdersApi,
  write: (state: InboxState) => void,
  notify: (notice: Notice, isCurrent: () => boolean) => void,
  session: TechnicianSession,
  journal: EntryAttemptJournal = entryAttemptJournal,
) {
  let state = initialInboxState;
  let active = false;
  let focusGeneration = 0;
  let requestGeneration = 0;
  let ownerId: string | null = null;
  let unsubscribe: (() => void) | undefined;
  // Owner whose list is already on screen: coming back to the tab keeps it and reads quietly instead of blanking it.
  let shownOwnerId: string | null = null;

  const current = () =>
    active && ownerId !== null && session.getUserId() === ownerId;

  function blur() {
    active = false;
    ++focusGeneration;
    ++requestGeneration;
    unsubscribe?.();
    unsubscribe = undefined;
  }

  const publish = (patch: Partial<InboxState>) => {
    if (!current()) return;
    state = { ...state, ...patch };
    write(state);
  };

  const markAccepted = async (
    invitationId: string,
    orderId: string,
    valid: () => boolean,
  ) => {
    if (!ownerId || !valid()) return;
    const acceptedOwner = ownerId;
    const responses = responsesFor(ownerId);
    const pending = responses.pending.get(invitationId);
    if (!pending) return;
    await journal.recordId(acceptedOwner, pending.intentId, orderId);
    await journal.resolve(acceptedOwner, pending.intentId);
    if (!valid()) return;
    responses.completed.add(invitationId);
    responses.pending.delete(invitationId);

    const nextInFlight = { ...state.actionInFlight };
    delete nextInFlight[invitationId];

    publish({
      invitations: state.invitations.filter(
        (invitation) => invitation.id !== invitationId,
      ),
      actionInFlight: nextInFlight,
      acceptedOrderId: orderId,
      recoveryPending: [...responses.pending.values()].some(
        (pending) => pending.action === 'ACCEPT',
      ),
    });
    notify(
      {
        title: 'Đã nhận việc',
        message:
          'Đã xác minh đơn dịch vụ đang được giao cho tài khoản kỹ thuật viên hiện tại.',
        orderId,
      },
      valid,
    );
  };

  async function reconcilePendingAccepts(valid: () => boolean) {
    if (!ownerId || !valid()) return;
    const responses = responsesFor(ownerId);
    const pendingAccepts = [...responses.pending.entries()].filter(
      ([, pending]) => pending.action === 'ACCEPT',
    );

    if (pendingAccepts.length === 0) {
      publish({ recoveryPending: false });
      return;
    }

    publish({ recoveryPending: true });

    for (const [invitationId, pending] of pendingAccepts) {
      if (!valid() || !ownerId) return;
      const known = pending.expectedOrderId ? await verifyOrderId(orderApi, pending.expectedOrderId, pending.bookingId, ownerId, valid) : null;
      const orderId = known?.state === 'verified' ? known.orderId : await findCurrentAssignedOrderForBooking(
        orderApi,
        pending.bookingId,
        ownerId,
        valid,
      );
      if (!valid()) return;
      if (orderId) {
        await markAccepted(invitationId, orderId, valid);
      }
    }

    if (!valid() || !ownerId) return;
    publish({
      recoveryPending: [...responsesFor(ownerId).pending.values()].some(
        (pending) => pending.action === 'ACCEPT',
      ),
    });
  }

  async function load(initial = false) {
    if (!current()) return;
    const responses = responsesFor(ownerId!);
    const generation = ++requestGeneration;
    const valid = () => current() && generation === requestGeneration;

    publish({
      loading: initial,
      refreshing: !initial,
      error: null,
      recoveryPending: [...responses.pending.values()].some(
        (pending) => pending.action === 'ACCEPT',
      ),
    });

    try {
      await journal.restore();
      if (!valid() || !ownerId) return;
      for (const marker of journal.list(ownerId)) {
        if (marker.kind !== 'invitation') continue;
        if (!marker.resolved) responses.pending.set(marker.invitationId, { action: marker.action, bookingId: marker.bookingId, intentId: marker.intentId, expectedOrderId: marker.confirmedId });
        else if (marker.confirmedId) responses.completed.add(marker.invitationId);
      }
      const data = await api.getMyInvitations();
      if (!valid()) return;

      const invitations = data.filter(
        (invitation) =>
          isActionable(invitation) &&
          !responses.completed.has(invitation.id),
      );
      const actionInFlight: Record<string, Action> = {};
      for (const invitation of invitations) {
        const pending = responses.pending.get(invitation.id);
        if (pending) actionInFlight[invitation.id] = pending.action;
      }

      publish({ invitations, actionInFlight, error: null });
      await reconcilePendingAccepts(valid);
    } catch (error) {
      if (!valid()) return;
      publish({
        invitations: [],
        error:
          statusOf(error) === 403
            ? 'Bạn không có quyền xem lời mời.'
            : 'Không thể tải danh sách lời mời. Vui lòng thử lại.',
      });
    } finally {
      if (valid()) publish({ loading: false, refreshing: false });
    }
  }

  async function respond(id: string, action: Action) {
    if (!current() || !ownerId) return;
    const respondingOwner = ownerId;
    const responses = responsesFor(ownerId);
    if (responses.pending.has(id) || responses.completed.has(id)) return;

    const invitation = state.invitations.find((item) => item.id === id);
    if (!invitation || !isActionable(invitation)) {
      await load();
      return;
    }

    const intentId = newEntryIntentId();
    responses.pending.set(id, {
      action,
      bookingId: invitation.bookingId,
      intentId,
    });
    ++requestGeneration;
    const focus = focusGeneration;
    const valid = () => current() && focus === focusGeneration;
    let dispatched = false;
    publish({
      actionInFlight: { ...state.actionInFlight, [id]: action },
      loading: false,
      refreshing: false,
      recoveryPending:
        action === 'ACCEPT' || state.recoveryPending,
    });

    try {
      await journal.restore();
      if (!valid()) return;
      if (!await journal.begin({ kind: 'invitation', invitationId: id, bookingId: invitation.bookingId, action, ownerUserId: respondingOwner, intentId, createdAt: Date.now() })) return;
      if (!valid()) return;
      const fresh = await api.getMyInvitations();
      if (!valid()) return;
      if (!fresh.some(item => item.id === id && item.bookingId === invitation.bookingId && isActionable(item))) {
        if (action === 'ACCEPT') {
          const linked = await findCurrentAssignedOrderForBooking(orderApi, invitation.bookingId, respondingOwner, valid);
          if (!valid()) return;
          if (linked) { await markAccepted(id, linked, valid); return; }
        }
        // No response POST was sent. A stale invitation cannot authorize it.
        await load(); return;
      }
      if (!valid()) return;
      dispatched = true;
      const result = await api.respondInvitation(id, action);
      const returnedOrderId = result?.serviceOrder?.id;
      if (typeof returnedOrderId === 'string' && UUID.test(returnedOrderId)) {
        await journal.recordId(respondingOwner, intentId, returnedOrderId);
        const pending = responses.pending.get(id); if (pending) pending.expectedOrderId = returnedOrderId;
      }
      if (!valid() || !ownerId) return;

      if (action === 'DECLINE') {
        const returned = (result as unknown as { invitation?: { id?: string; bookingId?: string; status?: string } }).invitation;
        if (returned?.id !== id || returned.bookingId !== invitation.bookingId || returned.status?.toUpperCase() !== 'DECLINED') return;
        await journal.recordId(respondingOwner, intentId, id);
        await journal.resolve(respondingOwner, intentId);
        if (!valid()) return;
        responses.completed.add(id);
        responses.pending.delete(id);
        ++requestGeneration;
        publish({
          invitations: state.invitations.filter(
            (item) => item.id !== id,
          ),
          actionInFlight: Object.fromEntries(
            Object.entries(state.actionInFlight).filter(
              ([invitationId]) => invitationId !== id,
            ),
          ),
        });
      } else {
        const orderId = result?.serviceOrder?.id;
        if (typeof orderId === 'string' && UUID.test(orderId)) {
          const verification = await verifyOrderId(
            orderApi,
            orderId,
            invitation.bookingId,
            ownerId,
            valid,
          );
          if (!valid()) return;

          if (verification.state === 'verified') {
            await markAccepted(id, verification.orderId, valid);
          } else if (verification.state === 'not-current') {
            // The ACCEPT request settled but this technician is no longer the
            // current assignee. Never expose stale order details or re-POST.
            // Reassignment cannot release the durable intent or grant re-POST.
            notify(
              {
                title: 'Phân công đã thay đổi',
                message:
                  'Phản hồi đã được hệ thống xử lý nhưng đơn này không còn là phân công hiện tại của tài khoản.',
              },
              valid,
            );
          } else {
            // The POST ACK is real but active assignment readback is not yet
            // authoritative. Keep the no-repost lock and reconcile via GET.
            notify(
              {
                title: 'Đang xác minh đơn vừa nhận',
                message:
                  'Hệ thống đã phản hồi nhưng chưa xác minh được phân công hiện tại. Không gửi lại; hãy làm mới để kiểm tra Công việc.',
              },
              valid,
            );
          }
        } else {
          notify(
            {
              title: 'Đang xác minh phản hồi',
              message:
                'Chưa nhận được mã đơn hợp lệ. Không gửi lại; đang đối chiếu bằng danh sách Công việc.',
            },
            valid,
          );
        }
      }
    } catch (error) {
      if (!valid() || !ownerId) return;

      if (statusOf(error) === 401 || statusOf(error) === 403 || statusOf(error) === 409) {
        const status = statusOf(error);
        notify(
          {
            title:
              status === 401 || status === 403
                ? 'Không có quyền phản hồi'
                : 'Lời mời đã thay đổi',
            message:
              status === 401 || status === 403
                ? 'Phiên đăng nhập hoặc quyền truy cập không còn hợp lệ.'
                : 'Hệ thống đã từ chối phản hồi theo trạng thái mới nhất. Không gửi lại lời mời này.',
          },
          valid,
        );
      } else {
        notify(
          {
            title: 'Chưa xác nhận phản hồi',
            message:
              action === 'ACCEPT'
                ? 'Kết quả nhận việc chưa xác định. Không gửi lại; đang kiểm tra đơn được giao.'
                : 'Kết quả từ chối chưa xác định. Không gửi lại để tránh phản hồi trùng.',
          },
          valid,
        );
      }
    } finally {
      if (!dispatched) {
        try {
          const ownMarker = journal.list(respondingOwner).find(marker => marker.intentId === intentId);
          if (ownMarker && !ownMarker.resolved) await journal.resolve(respondingOwner, intentId);
          // A later attempt for this invitation must never be deleted by stale cleanup.
          if (responses.pending.get(id)?.intentId === intentId) {
            responses.pending.delete(id);
            if (valid()) {
              const actionInFlight = { ...state.actionInFlight }; delete actionInFlight[id];
              publish({ actionInFlight, recoveryPending: [...responses.pending.values()].some(pending => pending.action === 'ACCEPT') });
            }
          }
        } catch { /* Failed durable cleanup retains the barrier and cached uncertainty. */ }
      }
    }

    // Reconcile after any ACCEPT outcome using owner-scoped GET only.
    if (valid() && action === 'ACCEPT') {
      await reconcilePendingAccepts(valid);
    }
    if (valid()) await load();
  }

  return {
    load,
    respond,
    focus() {
      blur();
      ownerId = session.getUserId();
      active = ownerId !== null;
      const keep = ownerId !== null && ownerId === shownOwnerId && !state.loading && !state.error;
      state = keep ? state : { ...initialInboxState, loading: active };
      shownOwnerId = ownerId;
      write(state);

      unsubscribe = session.subscribe(() => {
        // Any auth session event fences awaited storage/GET/POST callbacks,
        // including renewal/logout-login of the same User ID.
        const wasActive = active;
        blur();
        shownOwnerId = null;
        state = { ...initialInboxState, loading: false };
        if (wasActive) write(state);
      });

      return load(!keep);
    },
    blur,
  };
}
