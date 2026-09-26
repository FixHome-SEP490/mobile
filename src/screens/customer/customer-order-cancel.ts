import type { ServiceOrderItem } from '../../api/orders.api';

export type CustomerOrderCancelStatus =
  | 'idle'
  | 'confirming'
  | 'cancelled'
  | 'protected';

export interface CustomerOrderCancelState {
  status: CustomerOrderCancelStatus;
  reason: string;
  busy: boolean;
  needsVerify: boolean;
  error: string | null;
}

export const initialCustomerOrderCancelState: CustomerOrderCancelState = {
  status: 'idle',
  reason: '',
  busy: false,
  needsVerify: false,
  error: null,
};

export interface CustomerOrderCancelDeps {
  getOrder: () => ServiceOrderItem | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  cancelOrder: (orderId: string, reason: string) => Promise<unknown>;
  getOrderById: (orderId: string) => Promise<ServiceOrderItem>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function definitiveRejection(error: unknown): boolean {
  const status = statusOf(error);
  return (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 422
  );
}

export function customerOrderCancelTarget(
  order: ServiceOrderItem | null,
): string | null {
  if (!order || order.historical === true) return null;
  const status = String(order.status).toUpperCase();
  if (!['ACCEPTED', 'EN_ROUTE'].includes(status)) return null;
  return order.id;
}

export function createCustomerOrderCancelController(
  deps: CustomerOrderCancelDeps,
  write: (state: CustomerOrderCancelState) => void,
) {
  let state = { ...initialCustomerOrderCancelState };
  let submitting = false;

  const publish = (patch: Partial<CustomerOrderCancelState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  const context = () => {
    const customerId = deps.getCustomerId();
    const target = customerOrderCancelTarget(deps.getOrder());
    return customerId && target && deps.isFocused()
      ? { customerId, orderId: target }
      : null;
  };

  const same = (customerId: string, orderId: string) =>
    deps.isFocused() &&
    deps.getCustomerId() === customerId &&
    deps.getOrder()?.id === orderId;

  function setReason(reason: string) {
    if (state.busy || state.needsVerify || state.status === 'cancelled') return;
    publish({ reason: reason.slice(0, 2000), error: null });
  }

  function requestConfirm() {
    if (!context() || state.busy || state.needsVerify) return;
    const reason = state.reason.trim();
    if (!reason) {
      publish({ error: 'Vui lòng nhập lý do hủy.' });
      return;
    }
    publish({ status: 'confirming', error: null });
  }

  function cancelConfirm() {
    if (state.busy) return;
    publish({ status: 'idle', error: null });
  }

  function applyFresh(
    fresh: ServiceOrderItem,
    ambiguous: boolean,
  ): 'cancelled' | 'protected' | 'still-open' {
    const status = String(fresh.status).toUpperCase();
    if (status === 'CANCELLED') {
      publish({
        status: 'cancelled',
        busy: false,
        needsVerify: false,
        error: null,
      });
      return 'cancelled';
    }
    if (!['ACCEPTED', 'EN_ROUTE'].includes(status)) {
      publish({
        status: 'protected',
        busy: false,
        needsVerify: false,
        error:
          status === 'UNDER_REPAIR'
            ? 'Đơn đã bắt đầu sửa. Hủy thông thường bị khóa; hãy liên hệ Service Manager/Support.'
            : 'Trạng thái đơn đã thay đổi và không còn cho phép hủy từ màn hình này.',
      });
      return 'protected';
    }
    publish({
      status: 'idle',
      busy: false,
      needsVerify: ambiguous,
      error: ambiguous
        ? 'Kết quả lần hủy trước chưa xác định. Không gửi POST lại; hãy kiểm tra trạng thái bằng GET.'
        : 'Backend chưa hủy đơn theo trạng thái mới nhất. Bạn có thể tạo một yêu cầu hủy mới.',
    });
    return 'still-open';
  }

  async function readFresh(
    customerId: string,
    orderId: string,
    ambiguous: boolean,
  ): Promise<'cancelled' | 'protected' | 'still-open' | 'unknown'> {
    try {
      const fresh = await deps.getOrderById(orderId);
      if (!same(customerId, orderId)) return 'unknown';
      return applyFresh(fresh, ambiguous);
    } catch (error) {
      if (!same(customerId, orderId)) return 'unknown';
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        state = { ...initialCustomerOrderCancelState };
        write(state);
        deps.onAccessDenied();
        return 'unknown';
      }
      publish({
        status: 'idle',
        busy: false,
        needsVerify: ambiguous,
        error: ambiguous
          ? 'Chưa GET được trạng thái sau lần hủy không rõ kết quả. Không gửi POST lại.'
          : 'Không tải được trạng thái đơn mới nhất.',
      });
      return 'unknown';
    }
  }

  async function submit(): Promise<void> {
    if (
      submitting ||
      state.busy ||
      state.needsVerify ||
      state.status !== 'confirming'
    ) {
      return;
    }
    const ctx = context();
    const reason = state.reason.trim();
    if (!ctx || !reason) return;

    submitting = true;
    publish({ busy: true, error: null });
    let ambiguous = false;
    try {
      try {
        await deps.cancelOrder(ctx.orderId, reason);
      } catch (error) {
        if (!same(ctx.customerId, ctx.orderId)) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          state = { ...initialCustomerOrderCancelState };
          write(state);
          deps.onAccessDenied();
          return;
        }
        ambiguous = !definitiveRejection(error);
      }

      if (!same(ctx.customerId, ctx.orderId)) return;
      const result = await readFresh(ctx.customerId, ctx.orderId, ambiguous);
      if (result === 'cancelled') {
        deps.notify(
          'Đã hủy đơn',
          'Backend GET đã xác nhận ServiceOrder ở trạng thái CANCELLED.',
        );
      }
    } finally {
      submitting = false;
      if (state.busy && deps.getCustomerId() === ctx.customerId) {
        publish({ busy: false });
      }
    }
  }

  async function reconcile(): Promise<void> {
    const customerId = deps.getCustomerId();
    const order = deps.getOrder();
    if (!customerId || !order || !deps.isFocused()) return;
    const orderId = order.id;
    publish({ busy: true, error: null });
    const result = await readFresh(customerId, orderId, false);
    if (result === 'still-open') {
      publish({
        needsVerify: false,
        error:
          'GET mới nhất xác nhận đơn vẫn có thể hủy. Nếu cần, hãy tạo một yêu cầu hủy mới.',
      });
    }
  }

  function reset() {
    state = { ...initialCustomerOrderCancelState };
    write(state);
  }

  return {
    setReason,
    requestConfirm,
    cancelConfirm,
    submit,
    reconcile,
    reset,
  };
}
