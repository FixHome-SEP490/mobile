import { orderDetailTarget } from './customer-order-detail';

export interface CustomerCompletionGate {
  id: string;
  status: unknown;
  completionRequestedAt?: unknown;
  customerConfirmed?: unknown;
  historical?: unknown;
}

export interface CustomerConfirmCompletionState {
  confirming: boolean;
  busy: boolean;
  error: string | null;
  needsVerify: boolean;
  confirmed: boolean;
}

export const initialCustomerConfirmCompletionState: CustomerConfirmCompletionState = {
  confirming: false,
  busy: false,
  error: null,
  needsVerify: false,
  confirmed: false,
};

export const CUSTOMER_CONFIRM_COMPLETION_COPY =
  'Xác nhận công việc đã hoàn tất không đồng nghĩa đã thanh toán. Thanh toán là bước riêng và trạng thái COMPLETED chỉ do Backend xác nhận khi đủ điều kiện.';

export interface CustomerConfirmCompletionDeps {
  getOrder: () => CustomerCompletionGate | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  confirmCompletion: (orderId: string) => Promise<unknown>;
  refreshDetail: () => Promise<void>;
  refreshInvoice: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function isDefinitiveRejection(error: unknown): boolean {
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

export function customerConfirmCompletionTarget(
  order: CustomerCompletionGate | null,
): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!order.completionRequestedAt) return null;
  if (order.customerConfirmed === true) return null;
  return target;
}

export function createCustomerConfirmCompletionController(
  deps: CustomerConfirmCompletionDeps,
  write: (state: CustomerConfirmCompletionState) => void,
) {
  let state = { ...initialCustomerConfirmCompletionState };
  let submitting = false;

  const publish = (patch: Partial<CustomerConfirmCompletionState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  const sameSession = (
    customerId: string,
    orderId: string,
  ) =>
    deps.isFocused() &&
    deps.getCustomerId() === customerId &&
    deps.getOrder()?.id === orderId;

  async function refreshAndRead(
    customerId: string,
    orderId: string,
  ): Promise<CustomerCompletionGate | null> {
    try {
      await deps.refreshDetail();
      if (!sameSession(customerId, orderId)) return null;
      await deps.refreshInvoice();
      if (!sameSession(customerId, orderId)) return null;
      return deps.getOrder();
    } catch {
      return sameSession(customerId, orderId) ? deps.getOrder() : null;
    }
  }

  function markFromFreshOrder(
    order: CustomerCompletionGate | null,
    keepUnknownLock: boolean,
  ): boolean {
    if (!order) return false;
    const confirmed =
      order.customerConfirmed === true ||
      String(order.status).toUpperCase() === 'COMPLETED';

    if (confirmed) {
      publish({
        confirming: false,
        busy: false,
        error: null,
        needsVerify: false,
        confirmed: true,
      });
      return true;
    }

    publish({
      confirming: false,
      busy: false,
      confirmed: false,
      needsVerify: keepUnknownLock,
      error: keepUnknownLock
        ? 'Chưa xác minh được kết quả. Không gửi xác nhận lại; hãy kiểm tra trạng thái bằng GET.'
        : null,
    });
    return false;
  }

  function requestConfirm() {
    if (state.busy || state.needsVerify || state.confirmed) return;
    const customerId = deps.getCustomerId();
    const order = deps.getOrder();
    const target = customerConfirmCompletionTarget(order);
    if (!customerId || !target || !deps.isFocused()) return;
    publish({ confirming: true, error: null });
  }

  function cancelConfirm() {
    if (state.busy) return;
    publish({ confirming: false, error: null });
  }

  async function reconcile(): Promise<void> {
    if (state.busy) return;
    const customerId = deps.getCustomerId();
    const order = deps.getOrder();
    if (!customerId || !order || !deps.isFocused()) return;
    const orderId = orderDetailTarget(order.id);
    if (!orderId) return;

    publish({ busy: true, error: null });
    const fresh = await refreshAndRead(customerId, orderId);
    if (!sameSession(customerId, orderId)) return;
    markFromFreshOrder(fresh, state.needsVerify);
  }

  async function submit(): Promise<void> {
    if (submitting || state.busy || !state.confirming || state.needsVerify) {
      return;
    }

    const customerId = deps.getCustomerId();
    const order = deps.getOrder();
    const orderId = customerConfirmCompletionTarget(order);
    if (!customerId || !orderId || !deps.isFocused()) {
      publish({ confirming: false });
      return;
    }

    submitting = true;
    publish({ busy: true, error: null });

    try {
      try {
        await deps.confirmCompletion(orderId);
      } catch (error) {
        if (!sameSession(customerId, orderId)) return;

        if (isDefinitiveRejection(error)) {
          const status = statusOf(error);
          if (status === 401 || status === 403) {
            state = { ...initialCustomerConfirmCompletionState };
            write(state);
            deps.onAccessDenied();
            deps.notify(
              'Phiên đăng nhập đã hết',
              'Vui lòng đăng nhập lại để tiếp tục.',
            );
            return;
          }

          const fresh = await refreshAndRead(customerId, orderId);
          if (!sameSession(customerId, orderId)) return;
          markFromFreshOrder(fresh, false);
          publish({
            error:
              'Backend đã từ chối xác nhận' +
              (typeof status === 'number' ? ' (mã ' + status + ')' : '') +
              '. Hãy kiểm tra trạng thái mới nhất.',
          });
          return;
        }

        publish({
          confirming: false,
          busy: true,
          needsVerify: true,
          error: null,
        });
        const fresh = await refreshAndRead(customerId, orderId);
        if (!sameSession(customerId, orderId)) return;
        const confirmed = markFromFreshOrder(fresh, true);
        if (!confirmed) {
          deps.notify(
            'Chưa xác minh nghiệm thu',
            'Không gửi lại xác nhận. Hãy kiểm tra trạng thái đơn bằng GET.',
          );
        }
        return;
      }

      if (!sameSession(customerId, orderId)) return;

      // Even a successful POST is reconciled against fresh authoritative detail
      // and invoice. Work confirmation is distinct from payment/COMPLETED.
      publish({
        confirming: false,
        busy: true,
        needsVerify: true,
        error: null,
      });
      const fresh = await refreshAndRead(customerId, orderId);
      if (!sameSession(customerId, orderId)) return;

      const confirmed = markFromFreshOrder(fresh, true);
      if (confirmed) {
        deps.notify(
          'Đã xác nhận công việc',
          'Công việc đã được nghiệm thu. Thanh toán vẫn là bước riêng.',
        );
      } else {
        deps.notify(
          'Đang xác minh nghiệm thu',
          'POST đã phản hồi nhưng GET chưa xác nhận. Không gửi lại.',
        );
      }
    } finally {
      submitting = false;
      if (state.busy && deps.getCustomerId() === customerId) {
        publish({ busy: false });
      }
    }
  }

  function reset() {
    state = { ...initialCustomerConfirmCompletionState };
    write(state);
  }

  return {
    requestConfirm,
    cancelConfirm,
    submit,
    reconcile,
    reset,
  };
}
