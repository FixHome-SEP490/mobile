/**
 * S2 invoice READ-ONLY controller. Fetches `GET /service-orders/:id/invoice`
 * only after the caller confirms an authorized full order detail for the same
 * ServiceOrder UUID (never historical technician summaries). Displays
 * server-derived totals/status/item lines only — never commission fields,
 * provider/bank ids, raw JSON, payment actions, or money writes.
 */

export type InvoicePaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED' | 'UNKNOWN';

export interface InvoiceItemView {
  id: string;
  description: string;
  quantity: number;
  lineTotalText: string | null;
}

export interface InvoiceView {
  id: string;
  paymentStatus: InvoicePaymentStatus;
  laborText: string | null;
  partsText: string | null;
  totalText: string | null;
  issuedText: string | null;
  paidText: string | null;
  items: InvoiceItemView[];
}

export interface InvoiceState {
  invoice: InvoiceView | null;
  /** Server returned null (or safe 404): truthful absent state, not an error. */
  absent: boolean;
  loading: boolean;
  error: string | null;
  /** Real read-only retry affordance; false when unauthorized (button disabled). */
  canRetry: boolean;
}

export const initialInvoiceState: InvoiceState = {
  invoice: null,
  absent: false,
  loading: false,
  error: null,
  canRetry: false,
};

const deniedMessage = 'Không có quyền xem hóa đơn.';
const failedMessage = 'Không thể tải hóa đơn. Vui lòng thử lại.';
const unavailableMessage = 'Dịch vụ hóa đơn tạm thời không khả dụng. Vui lòng thử lại.';

/** Human-readable payment status; UNKNOWN stays neutral, never implies payment. */
export function invoicePaymentLabel(status: InvoicePaymentStatus): string {
  switch (status) {
    case 'UNPAID':
      return 'Chưa thanh toán';
    case 'PAID':
      return 'Đã thanh toán';
    case 'REFUNDED':
      return 'Đã hoàn tiền';
    case 'UNKNOWN':
      return 'Không rõ';
  }
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/** Valid money only: finite numbers >= 0 render; negative/NaN/unknown fall back. */
function moneyText(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${value.toLocaleString('vi-VN')}đ`
    : null;
}

function dateText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleString('vi-VN');
}

function paymentStatusOf(value: unknown): InvoicePaymentStatus {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'UNPAID' || normalized === 'PAID' || normalized === 'REFUNDED'
    ? normalized
    : 'UNKNOWN';
}

function itemsList(value: unknown): InvoiceItemView[] {
  if (!Array.isArray(value)) return [];
  const items: InvoiceItemView[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id) continue;
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    if (!description) continue;
    const quantity = typeof record.quantity === 'number'
      && Number.isInteger(record.quantity) && record.quantity > 0
      ? record.quantity
      : 0;
    if (quantity <= 0) continue;
    items.push({ id, description, quantity, lineTotalText: moneyText(record.lineTotal) });
  }
  return items;
}

/**
 * Validate a raw /invoice payload into a renderable view. Returns null for
 * absent (server null) and for top-level mismatches that must never render
 * (wrong order, blank id); only allowlisted display fields enter the view, so
 * commission/provider internals can never leak into state, logs, or UI.
 */
export function sanitizeInvoice(
  serviceOrderId: string,
  payload: unknown,
): InvoiceView | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  if (record.serviceOrderId !== serviceOrderId) return null;
  return {
    id,
    paymentStatus: paymentStatusOf(record.paymentStatus),
    laborText: moneyText(record.laborTotal),
    partsText: moneyText(record.partsTotal),
    totalText: moneyText(record.grandTotal),
    issuedText: dateText(record.issuedAt),
    paidText: dateText(record.paidAt),
    items: itemsList(record.items),
  };
}

export function createOrderInvoiceController(
  getInvoice: (id: string) => Promise<unknown>,
  write: (state: InvoiceState) => void,
) {
  let state: InvoiceState = { ...initialInvoiceState };
  let activeOrderId: string | null = null;
  let loadedFor: string | null = null;
  let generation = 0;
  let inFlight: Promise<void> | null = null;

  const isClean =
    () =>
      activeOrderId === null &&
      loadedFor === null &&
      inFlight === null &&
      state.invoice === null &&
      !state.absent &&
      !state.loading &&
      state.error === null &&
      !state.canRetry;

  const publish = (patch: Partial<InvoiceState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function purge() {
    generation += 1;
    inFlight = null;
    activeOrderId = null;
    loadedFor = null;
    if (isClean()) return;
    state = { invoice: null, absent: false, loading: false, error: null, canRetry: false };
    write(state);
  }

  async function load(
    target: string,
    gen: number,
    isReadable: () => boolean,
  ): Promise<void> {
    publish({ loading: true, error: null });
    try {
      const payload = await getInvoice(target);
      if (gen !== generation || activeOrderId !== target) return;
      if (!isReadable()) {
        purge();
        return;
      }
      loadedFor = target;
      const invoice = sanitizeInvoice(target, payload);
      // Null invoice is normal until a completion request: truthful absent
      // state with no fake 0đ paid status. Top-level mismatch sanitizes to
      // null as well and must never render as valid money.
      publish({ invoice, absent: invoice === null, loading: false, error: null, canRetry: false });
    } catch (error) {
      if (gen !== generation || activeOrderId !== target) return;
      if (!isReadable()) {
        purge();
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        generation += 1;
        inFlight = null;
        activeOrderId = null;
        loadedFor = null;
        state = { invoice: null, absent: false, loading: false, error: deniedMessage, canRetry: false };
        write(state);
        return;
      }
      if (status === 404) {
        loadedFor = target;
        publish({ invoice: null, absent: true, loading: false, error: null, canRetry: false });
        return;
      }
      loadedFor = null;
      publish({
        loading: false,
        error: status === 503 ? unavailableMessage : failedMessage,
        canRetry: true,
      });
    }
  }

  function startLoad(target: string, isReadable: () => boolean): Promise<void> {
    const gen = ++generation;
    const request = load(target, gen, isReadable).then(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    return request;
  }

  return {
    focusInvoice(orderId: string, isReadable: () => boolean): Promise<void> {
      if (!isReadable()) {
        purge();
        return Promise.resolve();
      }
      if (activeOrderId === orderId && inFlight) return inFlight;
      // One GET per successful focus; blur purges so refocus always refetches.
      if (activeOrderId === orderId && loadedFor === orderId) {
        return Promise.resolve();
      }
      activeOrderId = orderId;
      return startLoad(orderId, isReadable);
    },
    /** Parent pull-to-refresh may refetch invoice once for the same order. */
    refreshInvoice(isReadable: () => boolean): Promise<void> {
      const target = activeOrderId;
      if (!target) return Promise.resolve();
      if (inFlight) return inFlight;
      if (!isReadable()) {
        purge();
        return Promise.resolve();
      }
      return startLoad(target, isReadable);
    },
    blurInvoice(): void {
      purge();
    },
  };
}
