// Pure rules for the multi-device visit screens (web CustomerVisitPage / CustomerOrdersPage parity).
import type { ToneName } from '../../constants/theme';
import type { Visit, VisitCheckout, VisitDeviceState, VisitGroupReadStatus } from '../../api/visit-groups.api';

/** Label and tone of a visit row in a list; same wording as the web. */
export const VISIT_STATUS: Record<VisitGroupReadStatus, { label: string; tone: ToneName }> = {
  submitted: { label: 'Đang chờ xử lý', tone: 'info' },
  matching: { label: 'Đang tìm thợ', tone: 'warning' },
  no_technician: { label: 'Chưa có thợ phù hợp', tone: 'neutral' },
  accepted: { label: 'Đã nhận lịch', tone: 'violet' },
  en_route: { label: 'Đang di chuyển', tone: 'warning' },
  under_repair: { label: 'Đang sửa chữa', tone: 'repair' },
  completed: { label: 'Hoàn thành', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'neutral' },
  failed: { label: 'Có thiết bị chưa sửa', tone: 'danger' },
  quote_declined: { label: 'Có báo giá chưa được nhận', tone: 'neutral' },
  mixed: { label: 'Kết quả nhiều trạng thái', tone: 'info' },
};

export const UNKNOWN_VISIT_STATUS = { label: 'Trạng thái chưa xác định', tone: 'neutral' } as const;

export function visitStatusView(status: string): { label: string; tone: ToneName } {
  return VISIT_STATUS[status as VisitGroupReadStatus] ?? UNKNOWN_VISIT_STATUS;
}

export const VISIT_DEVICE_STATE_LABEL: Record<VisitDeviceState, string> = {
  succeeded: 'Đã sửa xong',
  failed: 'Không sửa được, không tính tiền sửa',
  quote_declined: 'Bạn không duyệt báo giá, không tính tiền',
  cancelled: 'Đã hủy',
  open: 'Đang xử lý',
};

/** Same gate as the order screen: the technician is on the way and an official quotation waits for the customer. */
export function needsQuoteDecision(order: { status?: string; quotation?: { status?: string } | null } | null | undefined): boolean {
  return !!order && String(order.status).toUpperCase() === 'EN_ROUTE' && String(order.quotation?.status).toUpperCase() === 'SENT';
}

export interface VisitActionInput {
  visit: Visit;
  checkout: VisitCheckout | null;
  /** Status of each device's order, read one by one; null while they are still being read. */
  orderStatuses: Record<string, string> | null;
  /** True when at least one device order could not be read. */
  orderReadIncomplete: boolean;
}

export interface VisitActions {
  canChooseTechnician: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  /** Some technician already holds the visit (an order exists for a device). */
  held: boolean;
}

/** Decides what the customer may try; the server repeats every check. Unknown order progress blocks reschedule and cancel. */
export function visitActions({ visit, checkout, orderStatuses, orderReadIncomplete }: VisitActionInput): VisitActions {
  const cancelled = visit.status === 'cancelled';
  const held = (checkout?.devices ?? []).some((device) => device.serviceOrderId);
  const lead = visit.items.find((item) => item.booking?.id === visit.leadBookingId)?.booking ?? null;
  const matchingState = String(lead?.status ?? 'SUBMITTED').toUpperCase();
  const rescheduled = visit.items.some((item) => (item.booking?.rescheduleCount ?? 0) >= 1);
  const repairStarted = (checkout?.devices ?? []).some((device) => device.state !== 'open')
    || orderStatuses === null
    || orderReadIncomplete
    || Object.values(orderStatuses).some((status) => String(status).toUpperCase() === 'UNDER_REPAIR');
  return {
    held,
    canChooseTechnician: !cancelled && !held && ['SUBMITTED', 'CLOSED'].includes(matchingState),
    canReschedule: !cancelled && !rescheduled && !repairStarted,
    canCancel: !cancelled && !repairStarted,
  };
}

/** Label of one device on the visit screen. `quoteWaiting` = its quotation waits for the customer. */
export function visitDeviceStatusText(args: {
  visit: Visit;
  deviceState: VisitDeviceState | undefined;
  hasOrder: boolean;
  quoteWaiting: boolean;
  leadStatus: string | undefined;
}): string {
  const { visit, deviceState, hasOrder, quoteWaiting, leadStatus } = args;
  // The child outcome is more specific than the parent: a failed repair is not a customer cancellation.
  if (deviceState && deviceState !== 'open') return VISIT_DEVICE_STATE_LABEL[deviceState];
  if (deviceState === 'open' && quoteWaiting) return 'Chờ bạn duyệt báo giá';
  if (visit.status === 'cancelled') return 'Đã hủy';
  if (hasOrder) return VISIT_DEVICE_STATE_LABEL.open;
  const state = String(leadStatus ?? 'SUBMITTED').toUpperCase();
  if (state === 'MATCHING') return 'Đang chờ thợ nhận';
  if (state === 'MATCHED') return 'Đã ghép kỹ thuật viên cho lượt';
  if (state === 'CLOSED') return 'Chưa có thợ nhận';
  return 'Chưa chọn thợ';
}

export type VisitPayMethod = 'wallet' | 'vnpay' | 'cash';
export type VisitCheckoutState = 'waiting' | 'paid' | 'pending_cash' | 'zero_due' | 'wallet_short' | 'vnpay' | 'ready';

/** VNPay takes at least 5.000 ₫. */
export const VNPAY_MIN_VND = 5000;
export const vnpayAllowed = (total: number): boolean => total >= VNPAY_MIN_VND;

export function visitPayMethods(total: number): VisitPayMethod[] {
  return vnpayAllowed(total) ? ['wallet', 'vnpay', 'cash'] : ['wallet', 'cash'];
}

export function resolveVisitCheckoutState(checkout: VisitCheckout | null, method: VisitPayMethod, walletBalance: number | null): VisitCheckoutState {
  if (checkout?.paid) return 'paid';
  if (!checkout || checkout.waiting > 0 || !checkout.ready) return 'waiting';
  if (checkout.pendingCash) return 'pending_cash';
  if (checkout.total <= 0) return 'zero_due';
  if (method === 'wallet' && walletBalance !== null && walletBalance < checkout.total) return 'wallet_short';
  if (method === 'vnpay' && vnpayAllowed(checkout.total)) return 'vnpay';
  return 'ready';
}

/** Whole-visit payment can start only when every device has its result and nothing else is pending. */
export const canStartVisitPayment = (state: VisitCheckoutState): boolean => state === 'ready' || state === 'vnpay' || state === 'wallet_short';

/**
 * Where the whole visit is on the five steps shared with a single order: choosing the technician, waiting for them,
 * repairing, then paying once for every device.
 */
export function visitStep(input: { payState: string; orderStatuses: Record<string, string> | null }): 2 | 3 | 4 | 5 {
  if (['ready', 'vnpay', 'wallet_short', 'pending_cash', 'paid', 'zero_due'].includes(input.payState)) return 5;
  const statuses = Object.values(input.orderStatuses ?? {}).map((status) => String(status).toUpperCase());
  if (statuses.some((status) => status === 'UNDER_REPAIR')) return 4;
  return statuses.length > 0 ? 3 : 2;
}
