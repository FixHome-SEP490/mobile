export interface TechnicianCashOrderGate {
  id: string;
  status: unknown;
  paymentStatus: unknown;
  completionRequestedAt?: unknown;
  grandTotal?: unknown;
  historical?: unknown;
}

export interface TechnicianCashState {
  loading: boolean;
  busy: boolean;
  needsVerify: boolean;
  error: string | null;
  status: 'NONE' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'DISPUTED';
  declaredAmount: number | null;
}

export const initialTechnicianCashState: TechnicianCashState = {
  loading: false,
  busy: false,
  needsVerify: false,
  error: null,
  status: 'NONE',
  declaredAmount: null,
};

export interface TechnicianCashDeps {
  getOrder: () => TechnicianCashOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  getCashSettlement: (orderId: string) => Promise<unknown>;
  declareCashSettlement: (
    orderId: string,
    body: { declaredAmount: number; technicianNotes?: string },
  ) => Promise<unknown>;
  refreshDetail: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function parseSettlement(payload: unknown): {
  status: TechnicianCashState['status'];
  declaredAmount: number | null;
} {
  if (!payload || typeof payload !== 'object') {
    return { status: 'NONE', declaredAmount: null };
  }
  const value = payload as Record<string, unknown>;
  const status = String(value.status ?? '').toUpperCase();
  if (!['PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED'].includes(status)) {
    return { status: 'NONE', declaredAmount: null };
  }
  const amount =
    typeof value.declaredAmount === 'number' &&
    Number.isSafeInteger(value.declaredAmount) &&
    value.declaredAmount >= 0
      ? value.declaredAmount
      : null;
  return {
    status: status as TechnicianCashState['status'],
    declaredAmount: amount,
  };
}

export function technicianCashTarget(order: TechnicianCashOrderGate | null) {
  if (!order || order.historical === true) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!order.completionRequestedAt) return null;
  if (String(order.paymentStatus).toUpperCase() !== 'UNPAID') return null;
  if (
    typeof order.grandTotal !== 'number' ||
    !Number.isSafeInteger(order.grandTotal) ||
    order.grandTotal <= 0
  ) {
    return null;
  }
  return { orderId: order.id, amount: order.grandTotal };
}

export function createTechnicianCashController(
  deps: TechnicianCashDeps,
  write: (state: TechnicianCashState) => void,
) {
  let state = { ...initialTechnicianCashState };
  let submitting = false;
  const publish = (patch: Partial<TechnicianCashState>) => {
    state = { ...state, ...patch };
    write(state);
  };
  const context = () => {
    const technicianId = deps.getTechnicianId();
    const target = technicianCashTarget(deps.getOrder());
    return technicianId && target && deps.isFocused()
      ? { technicianId, ...target }
      : null;
  };
  const same = (tech: string, orderId: string) =>
    deps.isFocused() &&
    deps.getTechnicianId() === tech &&
    deps.getOrder()?.id === orderId;

  async function load(): Promise<void> {
    const ctx = context();
    if (!ctx) {
      state = { ...initialTechnicianCashState };
      write(state);
      return;
    }
    publish({ loading: true, error: null });
    try {
      const parsed = parseSettlement(
        await deps.getCashSettlement(ctx.orderId),
      );
      if (!same(ctx.technicianId, ctx.orderId)) return;
      publish({
        loading: false,
        status: parsed.status,
        declaredAmount: parsed.declaredAmount,
        needsVerify: false,
        error: null,
      });
    } catch (error) {
      if (!same(ctx.technicianId, ctx.orderId)) return;
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        state = { ...initialTechnicianCashState };
        write(state);
        deps.onAccessDenied();
        return;
      }
      if (status === 404) {
        publish({
          loading: false,
          status: 'NONE',
          declaredAmount: null,
          error: null,
        });
        return;
      }
      publish({
        loading: false,
        error: 'Không thể tải trạng thái tiền mặt.',
      });
    }
  }

  async function reconcile(
    tech: string,
    orderId: string,
  ): Promise<boolean> {
    try {
      await deps.refreshDetail();
      if (!same(tech, orderId)) return false;
      const parsed = parseSettlement(
        await deps.getCashSettlement(orderId),
      );
      if (!same(tech, orderId)) return false;
      if (parsed.status !== 'NONE') {
        publish({
          busy: false,
          needsVerify: false,
          status: parsed.status,
          declaredAmount: parsed.declaredAmount,
          error: null,
        });
        return true;
      }
      publish({
        busy: false,
        needsVerify: true,
        error:
          'Chưa xác minh được lần khai báo tiền mặt trước. Không gửi POST lại.',
      });
      return false;
    } catch {
      if (!same(tech, orderId)) return false;
      publish({
        busy: false,
        needsVerify: true,
        error:
          'Chưa thể đối chiếu khai báo tiền mặt bằng GET. Không gửi POST lại.',
      });
      return false;
    }
  }

  async function declare(notes?: string): Promise<void> {
    if (submitting || state.busy || state.needsVerify || state.status !== 'NONE') {
      return;
    }
    const ctx = context();
    if (!ctx) return;
    submitting = true;
    publish({ busy: true, error: null });
    try {
      try {
        await deps.declareCashSettlement(ctx.orderId, {
          declaredAmount: ctx.amount,
          ...(notes?.trim() ? { technicianNotes: notes.trim().slice(0, 500) } : {}),
        });
      } catch (error) {
        if (!same(ctx.technicianId, ctx.orderId)) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          state = { ...initialTechnicianCashState };
          write(state);
          deps.onAccessDenied();
          return;
        }
      }
      if (!same(ctx.technicianId, ctx.orderId)) return;
      const verified = await reconcile(ctx.technicianId, ctx.orderId);
      if (!verified) {
        deps.notify(
          'Chưa xác minh khai báo tiền mặt',
          'Không gửi lại; hãy kiểm tra trạng thái bằng GET.',
        );
      }
    } finally {
      submitting = false;
      if (state.busy && deps.getTechnicianId() === ctx.technicianId) {
        publish({ busy: false });
      }
    }
  }

  function reset() {
    state = { ...initialTechnicianCashState };
    write(state);
  }

  return {
    load,
    declare,
    reconcile: async () => {
      const ctx = context();
      if (ctx) await reconcile(ctx.technicianId, ctx.orderId);
    },
    reset,
  };
}
