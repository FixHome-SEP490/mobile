import type { bookingsApi, InvitationItem } from '../../api/bookings.api';
import type { ordersApi, ServiceOrderItem } from '../../api/orders.api';

type Action = 'ACCEPT' | 'DECLINE';

interface TechnicianSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

interface PendingResponse {
  action: Action;
  bookingId: string;
}

interface AccountResponses {
  pending: Map<string, PendingResponse>;
  completed: Set<string>;
}

// Process-local only: survives remount/logout, NOT app restart or another device.
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

function isDefinitiveRespondRejection(error: unknown): boolean {
  const status = statusOf(error);
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422
  );
}

type OrderVerification =
  | { state: 'verified'; orderId: string }
  | { state: 'not-current' }
  | { state: 'unknown' };

function isCurrentAssignedOrder(
  order: ServiceOrderItem,
  orderId: string,
  bookingId: string,
  technicianId: string,
): boolean {
  return (
    order.id === orderId &&
    order.bookingId === bookingId &&
    order.historical !== true &&
    order.technician?.id === technicianId
  );
}

async function verifyOrderId(
  orderApi: Pick<typeof ordersApi, 'getOrder'>,
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
  orderApi: Pick<typeof ordersApi, 'getMyOrdersPage' | 'getOrder'>,
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
        row.historical === true ||
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
  orderApi: Pick<typeof ordersApi, 'getMyOrdersPage' | 'getOrder'>,
  write: (state: InboxState) => void,
  notify: (notice: Notice, isCurrent: () => boolean) => void,
  session: TechnicianSession,
) {
  let state = initialInboxState;
  let active = false;
  let focusGeneration = 0;
  let requestGeneration = 0;
  let ownerId: string | null = null;
  let unsubscribe: (() => void) | undefined;

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

  const markAccepted = (
    invitationId: string,
    orderId: string,
    valid: () => boolean,
  ) => {
    if (!ownerId || !valid()) return;
    const responses = responsesFor(ownerId);
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
      const orderId = await findCurrentAssignedOrderForBooking(
        orderApi,
        pending.bookingId,
        ownerId,
        valid,
      );
      if (!valid()) return;
      if (orderId) {
        markAccepted(invitationId, orderId, valid);
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
    const responses = responsesFor(ownerId);
    if (responses.pending.has(id) || responses.completed.has(id)) return;

    const invitation = state.invitations.find((item) => item.id === id);
    if (!invitation || !isActionable(invitation)) {
      await load();
      return;
    }

    responses.pending.set(id, {
      action,
      bookingId: invitation.bookingId,
    });
    ++requestGeneration;
    const focus = focusGeneration;
    const valid = () => current() && focus === focusGeneration;
    publish({
      actionInFlight: { ...state.actionInFlight, [id]: action },
      loading: false,
      refreshing: false,
      recoveryPending:
        action === 'ACCEPT' || state.recoveryPending,
    });

    try {
      const result = await api.respondInvitation(id, action);
      if (!valid() || !ownerId) return;

      if (action === 'DECLINE') {
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
            markAccepted(id, verification.orderId, valid);
          } else if (verification.state === 'not-current') {
            // The ACCEPT request settled but this technician is no longer the
            // current assignee. Never expose stale order details or re-POST.
            responses.completed.add(id);
            responses.pending.delete(id);
            const nextInFlight = { ...state.actionInFlight };
            delete nextInFlight[id];
            publish({
              invitations: state.invitations.filter(
                (item) => item.id !== id,
              ),
              actionInFlight: nextInFlight,
              recoveryPending: [...responses.pending.values()].some(
                (pending) => pending.action === 'ACCEPT',
              ),
            });
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
                  'Hệ thống đã phản hồi nhưng chưa xác minh được phân công hiện tại. Không gửi ACCEPT lại; hãy làm mới để kiểm tra Công việc.',
              },
              valid,
            );
          }
        } else {
          notify(
            {
              title: 'Đang xác minh phản hồi',
              message:
                'Chưa nhận được mã ServiceOrder hợp lệ. Không gửi ACCEPT lại; đang đối chiếu bằng danh sách Công việc.',
            },
            valid,
          );
        }
      }
    } catch (error) {
      if (!valid() || !ownerId) return;

      if (isDefinitiveRespondRejection(error)) {
        responses.completed.add(id);
        responses.pending.delete(id);
        const nextInFlight = { ...state.actionInFlight };
        delete nextInFlight[id];
        publish({
          invitations: state.invitations.filter(
            (item) => item.id !== id,
          ),
          actionInFlight: nextInFlight,
          recoveryPending: [...responses.pending.values()].some(
            (pending) => pending.action === 'ACCEPT',
          ),
        });

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
                : 'Backend đã từ chối phản hồi theo trạng thái mới nhất. Không gửi lại lời mời này.',
          },
          valid,
        );
      } else {
        notify(
          {
            title: 'Chưa xác nhận phản hồi',
            message:
              action === 'ACCEPT'
                ? 'Kết quả ACCEPT chưa xác định. Không gửi lại; đang kiểm tra đơn được giao bằng GET.'
                : 'Kết quả từ chối chưa xác định. Không gửi lại để tránh phản hồi trùng.',
          },
          valid,
        );
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
      state = { ...initialInboxState, loading: active };
      write(state);

      unsubscribe = session.subscribe(() => {
        if (session.getUserId() === ownerId) return;
        const wasActive = active;
        blur();
        state = { ...initialInboxState, loading: false };
        if (wasActive) write(state);
      });

      return load(true);
    },
    blur,
  };
}
