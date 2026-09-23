import type { bookingsApi, InvitationItem } from '../../api/bookings.api';

type Action = 'ACCEPT' | 'DECLINE';
interface TechnicianSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}
interface AccountResponses {
  pending: Map<string, Action>;
  completed: Set<string>;
}
// Process-local only: survives remount/logout, NOT app restart or another device.
// Retain only user/invitation IDs and action, never tokens, previews or order data.
// Logout is not proof a POST stopped: do not erase uncertainty on logout/login.
// No startup/background POST replay. Durable restart recovery needs a separate contract.
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
}
interface Notice { title: string; message: string; orderId?: string }
export const initialInboxState: InboxState = {
  invitations: [], loading: true, refreshing: false, error: null, actionInFlight: {},
};
export function isActionable(inv: InvitationItem): boolean {
  return inv.status === 'PENDING' && inv.expiresAt !== null
    && Date.parse(inv.expiresAt) > Date.now();
}
function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

// One instance per screen ref. Transport is injected so tests exercise this exact controller.
export function createInvitationInbox(
  api: Pick<typeof bookingsApi, 'getMyInvitations' | 'respondInvitation'>,
  write: (state: InboxState) => void,
  notify: (notice: Notice, isCurrent: () => boolean) => void,
  session: TechnicianSession,
) {
  let state = initialInboxState;
  let active = false;
  let focusGeneration = 0;
  let requestGeneration = 0;
  // Never release a submitted ID merely because a request settled. A live PENDING GET
  // cannot prove that a timed-out POST has stopped executing on the server.
  let ownerId: string | null = null;
  let unsubscribe: (() => void) | undefined;
  const current = () => active && ownerId !== null && session.getUserId() === ownerId;
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
  async function load(initial = false) {
    if (!current()) return;
    const responses = responsesFor(ownerId!);
    const generation = ++requestGeneration;
    const valid = () => current() && generation === requestGeneration;
    publish({ loading: initial, refreshing: !initial, error: null });
    try {
      const data = await api.getMyInvitations();
      if (!valid()) return;
      const invitations = data.filter(inv => isActionable(inv) && !responses.completed.has(inv.id));
      const actionInFlight: Record<string, Action> = {};
      for (const inv of invitations) {
        const action = responses.pending.get(inv.id);
        if (action) actionInFlight[inv.id] = action;
      }
      publish({ invitations, actionInFlight, error: null });
    } catch (error) {
      if (!valid()) return;
      publish({ invitations: [], error: statusOf(error) === 403
        ? 'Bạn không có quyền xem lời mời.'
        : 'Không thể tải danh sách lời mời. Vui lòng thử lại.' });
    } finally {
      if (valid()) publish({ loading: false, refreshing: false });
    }
  }
  async function respond(id: string, action: Action) {
    if (!current()) return;
    const responses = responsesFor(ownerId!);
    if (responses.pending.has(id) || responses.completed.has(id)) return;
    const invitation = state.invitations.find(inv => inv.id === id);
    if (!invitation || !isActionable(invitation)) {
      await load();
      return;
    }
    responses.pending.set(id, action); // Synchronous acquisition BEFORE any await or UI update.
    ++requestGeneration; // A pre-action GET must not restore the old row.
    const focus = focusGeneration;
    const valid = () => current() && focus === focusGeneration;
    publish({ actionInFlight: { ...state.actionInFlight, [id]: action }, loading: false, refreshing: false });
    try {
      const result = await api.respondInvitation(id, action);
      const orderId = result?.serviceOrder?.id;
      const hasOrder = typeof orderId === 'string' && orderId.trim().length > 0;
      // Resolved DECLINE is an acknowledged 2xx; ACCEPT needs an actual order id.
      // Clear the waiting action only on proof, retaining a terminal tombstone so
      // stale PENDING GETs can never revive it. Empty/PENDING GETs are not proof.
      // Capture the original account above: late completion cannot touch another account.
      if (action === 'DECLINE' || hasOrder) {
        responses.completed.add(id);
        responses.pending.delete(id);
      }
      if (!valid()) return;
      ++requestGeneration;
      publish({ invitations: state.invitations.filter(inv => inv.id !== id) });
      if (action === 'ACCEPT') {
        notify({
          title: hasOrder ? 'Đã nhận việc!' : 'Đang kiểm tra',
          message: hasOrder
            ? 'Bạn đã chấp nhận lời mời. Hãy xem đơn trong tab Công việc.'
            : 'Chưa xác nhận được mã đơn dịch vụ. Vui lòng kiểm tra tab Công việc và làm mới danh sách.',
          orderId: hasOrder ? orderId : undefined,
        }, valid);
      }
    } catch (error) {
      if (!valid()) return;
      const status = statusOf(error);
      notify({
        title: status === 403 ? 'Không có quyền' : status === 409 ? 'Lời mời đã thay đổi' : 'Chưa xác nhận phản hồi',
        message: status === 403 ? 'Bạn không có quyền phản hồi lời mời này.'
          : status === 409 ? 'Lời mời không còn khả dụng. Danh sách sẽ được làm mới.'
          : 'Không rõ yêu cầu đã được xử lý hay chưa. Đang kiểm tra lại; lời mời này tạm khóa để tránh gửi trùng.',
      }, valid);
    }
    // Reconcile both success and failure via GET only, never retry POST.
    if (valid()) await load();
  }
  return {
    load, respond,
    focus() {
      blur();
      ownerId = session.getUserId();
      active = ownerId !== null;
      // A different account may have signed in while this screen was blurred.
      state = { ...initialInboxState, loading: active };
      write(state);
      unsubscribe = session.subscribe(() => {
        if (session.getUserId() === ownerId) return;
        const wasActive = active;
        blur();
        state = { ...initialInboxState, loading: false };
        if (wasActive) write(state); // Synchronous auth invalidation clears old-account preview.
      });
      return load(true);
    },
    blur,
  };
}
