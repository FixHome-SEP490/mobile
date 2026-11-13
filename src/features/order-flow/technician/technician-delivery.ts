// W3 part delivery, technician side (web DeliveryOperationsPanel audience="technician" + DeliveryTermsPanel).
// Every amount comes from the server read; the client never computes a share.
import type { DeliveryState, DeliveryStatus } from '../../../api/w3-delivery.api';
import { formatVnd } from '../../../utils/format';

/** 0đ: the quote is 0. Paid: within the request's approved fee. Never twice, never on a changed quote. */
export function canTechnicianConsent(state: DeliveryState | null, sourceShippingFee: number): boolean {
  if (!state?.quote || state.invalidated || state.technicianConsented) return false;
  if (state.kind === 'free') return state.quote.totalShippingFee === 0;
  return state.quote.totalShippingFee > 0 && state.quote.totalShippingFee <= sourceShippingFee;
}

/** Physical steps open only when both parties consented and the SM recorded the actual fee. */
export function canOperatePhysical(state: DeliveryState | null): boolean {
  return !!state?.quote && !state.invalidated && state.customerConsented && state.technicianConsented
    && state.actualShippingFee !== null;
}

const RESERVABLE: (DeliveryStatus | null)[] = [null, 'INELIGIBLE', 'PENDING_ASSISTANCE', 'RELEASED'];
export function canReserve(state: DeliveryState | null): boolean {
  return canOperatePhysical(state) && RESERVABLE.includes(state!.physicalStatus);
}

/** Receipt needs the parts to have left the warehouse and the journal's warehouse for the evidence. */
export function canRecordReceipt(state: DeliveryState | null): boolean {
  return canOperatePhysical(state) && state!.physicalStatus === 'DISPATCH_RECORDED' && !!state!.physicalWarehouseId;
}

/** Preview of who pays before consent: 0đ is 100/0 (FixHome bears it), paid is 70/30 from the server quote. */
export function technicianSplitPreview(state: DeliveryState): { title: string; rows: [string, string][] } | null {
  const q = state.quote;
  if (!q) return null;
  if (state.kind === 'free') {
    return { title: 'Phí giao 0 ₫ (FixHome chịu 100%)', rows: [['Khách trả', formatVnd(0)], ['Bạn chịu', formatVnd(0)]] };
  }
  const rows: [string, string][] = [
    ['Tổng phí giao tối đa', formatVnd(q.totalShippingFee)],
    ['Khách trả (70%)', formatVnd(q.customerShippingShare)],
    ['Bạn chịu (30%)', formatVnd(q.technicianShippingShare)],
  ];
  if (state.actualTechnicianShare !== null && state.actualTechnicianShare !== undefined) {
    rows.push(['Bạn chịu thực tế (30%)', formatVnd(state.actualTechnicianShare)]);
  }
  return { title: 'Phí giao chia 70/30', rows };
}

/** Recorded ceilings of the paid terms, worded for the technician. */
export function technicianCeilingRows(state: DeliveryState): [string, string][] {
  const c = state.ceilings;
  if (!c) return [];
  const money = (value: string) => formatVnd(Number(value));
  return [
    ['Số lần giao đã ghi', String(c.count)],
    ['Trần phí giao', money(c.shipping)],
    ['Trần phần khách trả', money(c.customer)],
    ['Trần phần bạn chịu', money(c.technician)],
  ];
}

export function technicianDeliverySummary(state: DeliveryState): string {
  // Once received, a later source change (usage recorded) no longer matters to the technician.
  if (state.physicalStatus === 'TECHNICIAN_RECEIVED') return 'Bạn đã nhận linh kiện. Ghi số lượng thực dùng ở mục Linh kiện.';
  if (state.invalidated) return 'Đề xuất phí giao đã thay đổi. Chờ quản lý dịch vụ đề xuất lại.';
  if (!state.quote) return 'Đang chờ quản lý dịch vụ đề xuất phí giao.';
  if (state.customerConsented && state.technicianConsented) {
    return state.actualShippingFee === null ? 'Hai bên đã đồng ý. Chờ quản lý ghi phí giao thực tế.' : 'Hai bên đã đồng ý điều khoản giao.';
  }
  if (state.technicianConsented) return 'Bạn đã đồng ý. Đang chờ khách hàng đồng ý.';
  return 'Xem và đồng ý điều khoản giao linh kiện theo báo giá phí giao này.';
}

const STATUS_TEXT: Record<DeliveryStatus, string> = {
  INELIGIBLE: 'Chưa đủ điều kiện giao', PENDING_ASSISTANCE: 'Cần quản lý hỗ trợ', RESERVED: 'Kho đã giữ linh kiện',
  RELEASED: 'Kho đã bỏ giữ linh kiện', ISSUED_TO_COURIER: 'Đã giao cho đơn vị vận chuyển',
  DISPATCH_RECORDED: 'Linh kiện đã rời kho', TECHNICIAN_RECEIVED: 'Bạn đã nhận linh kiện',
};
export function physicalStatusText(state: DeliveryState): string {
  return state.physicalStatus ? STATUS_TEXT[state.physicalStatus] : 'Chưa có giao nhận';
}
