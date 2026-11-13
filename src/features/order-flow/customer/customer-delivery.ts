import type { PartRequest } from '../../../api/part-requests.api';
import type { CustomerDeliveryState, DeliveryStatus } from '../../../api/w3-delivery.api';
import { formatVnd } from '../../../utils/format';

/** W3 only covers delivery of an additional-cost part request that carries a server shipping fee. */
export function isW3DeliveryRequest(request: Pick<PartRequest, 'fulfillmentMethod' | 'requestType' | 'shippingFee' | 'status'>): boolean {
  return request.fulfillmentMethod === 'delivery' && request.requestType === 'additional'
    && typeof request.shippingFee === 'number' && Number.isSafeInteger(request.shippingFee) && request.shippingFee >= 0
    && request.status !== 'cancelled';
}

/** 0đ proposal uses the base delivery route; a positive fee uses the 70/30 terms route. */
export function deliveryKind(request: Pick<PartRequest, 'shippingFee'>): 'free' | 'paid' {
  return request.shippingFee > 0 ? 'paid' : 'free';
}

export function canCustomerConsent(state: CustomerDeliveryState | null, sourceShippingFee: number): boolean {
  if (!state?.quote || state.invalidated || state.customerConsented) return false;
  if (state.kind === 'free') return state.quote.totalShippingFee === 0;
  return state.quote.totalShippingFee > 0 && state.quote.totalShippingFee <= sourceShippingFee;
}

/** Split preview shown before consent: 0đ => 100/0 (nobody pays), paid => 70/30 from the server quote. */
export function splitPreview(state: CustomerDeliveryState): { title: string; rows: [string, string][] } | null {
  const q = state.quote;
  if (!q) return null;
  if (state.kind === 'free') {
    return { title: 'Phí giao 0 ₫ (FixHome chịu 100%)', rows: [['Bạn trả', formatVnd(0)], ['Kỹ thuật viên chịu', formatVnd(0)]] };
  }
  return { title: 'Phí giao chia 70/30', rows: [
    ['Tổng phí giao tối đa', formatVnd(q.totalShippingFee)],
    ['Bạn trả (70%)', formatVnd(q.customerShippingShare)],
    ['Kỹ thuật viên chịu (30%)', formatVnd(q.technicianShippingShare)],
  ] };
}

/** The four recorded ceilings of the paid terms (count + shipping/customer/technician). */
export function ceilingRows(state: CustomerDeliveryState): [string, string][] {
  const c = state.ceilings;
  if (!c) return [];
  const money = (value: string) => formatVnd(Number(value));
  return [
    ['Số lần giao đã ghi', String(c.count)],
    ['Trần phí giao', money(c.shipping)],
    ['Trần phần bạn trả', money(c.customer)],
    ['Trần phần kỹ thuật viên', money(c.technician)],
  ];
}

const STEPS: { status: DeliveryStatus; label: string }[] = [
  { status: 'RESERVED', label: 'Kho đã giữ linh kiện' },
  { status: 'ISSUED_TO_COURIER', label: 'Đã giao cho đơn vị vận chuyển' },
  { status: 'DISPATCH_RECORDED', label: 'Linh kiện đã rời kho' },
  { status: 'TECHNICIAN_RECEIVED', label: 'Kỹ thuật viên đã nhận' },
];

/** Progress steps; a released reservation shows no completed step. */
export function deliveryProgress(state: CustomerDeliveryState): { label: string; done: boolean }[] {
  const reached = state.physicalStatus ? STEPS.findIndex(step => step.status === state.physicalStatus) : -1;
  return STEPS.map((step, index) => ({ label: step.label, done: reached >= 0 && index <= reached }));
}

export function consentSummary(state: CustomerDeliveryState): string {
  if (state.invalidated) return 'Đề xuất phí giao đã thay đổi. Vui lòng chờ đề xuất mới.';
  if (!state.quote) return 'Đang chờ quản lý dịch vụ đề xuất phí giao.';
  if (state.customerConsented && state.technicianConsented) return 'Bạn và kỹ thuật viên đã đồng ý điều khoản giao.';
  if (state.customerConsented) return 'Bạn đã đồng ý. Đang chờ kỹ thuật viên đồng ý.';
  return 'Vui lòng xem và đồng ý điều khoản giao linh kiện.';
}
