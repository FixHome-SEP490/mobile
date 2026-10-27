// Pure rules for a technician working one device of a multi-device visit (web TechnicianJobDetailPage parity).
import type { VisitCheckout, VisitDeviceState } from '../../../api/visit-groups.api';

type Device = VisitCheckout['devices'][number];

export const visitDeviceLabel = (d: Pick<Device, 'serviceName' | 'deviceLabel'>): string =>
  d.serviceName && d.deviceLabel ? `${d.serviceName} · ${d.deviceLabel}` : d.serviceName || d.deviceLabel || 'Thiết bị';

const STATUS: Record<VisitDeviceState, string> = {
  succeeded: 'Đã sửa xong',
  failed: 'Không sửa được',
  quote_declined: 'Khách không duyệt báo giá',
  cancelled: 'Đã hủy',
  open: 'Đang xử lý',
};
export const visitDeviceTechnicianStatus = (state: VisitDeviceState): string => STATUS[state];

/** Suggest another open device only after the current one has its outcome. */
export function nextOpenVisitDevice(devices: Device[], activeOrderId: string): Device | null {
  const current = devices.find((d) => d.serviceOrderId === activeOrderId);
  if (!current || current.state === 'open') return null;
  return devices.find((d) => d.state === 'open' && !!d.serviceOrderId && d.serviceOrderId !== activeOrderId) ?? null;
}

/** "Không sửa được": only a device of a visit that is being repaired and not yet handed over. */
export const repairFailedAllowed = (order: { visitGroupId?: string | null; status: string; completionRequestedAt?: string | null }): boolean =>
  !!order.visitGroupId && order.status === 'UNDER_REPAIR' && !order.completionRequestedAt;

export type VisitCashStatus = 'waiting' | 'paid' | 'pending_cash' | 'zero_due' | 'ready';
export function visitCashStatus(c: Pick<VisitCheckout, 'paid' | 'waiting' | 'ready' | 'pendingCash' | 'total'>): VisitCashStatus {
  if (c.paid) return 'paid';
  if (c.waiting > 0 || !c.ready) return 'waiting';
  if (c.pendingCash) return 'pending_cash';
  if (c.total <= 0) return 'zero_due';
  return 'ready';
}
export const canDeclareVisitCash = (c: Parameters<typeof visitCashStatus>[0]): boolean => visitCashStatus(c) === 'ready';
