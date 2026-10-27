// Pure draft rules for booking several devices in one visit (web NewBookingWizardPage parity).
import type { ServicePriceSummary } from '../../utils/service-price-summary';
import type { SummaryPrice } from '../../utils/visit-device-pricing';
import { VISIT_DEVICE_LIMIT, type CreateVisitDto, type VisitDeviceInput } from '../../api/visit-groups.api';
import type { BookingSchedule } from '../../utils/booking-session';
import type { BookingDeviceAttributes, CatalogPricingPreview } from '../../api/catalog-pricing.api';

export const VISIT_DESCRIPTION_MAX = 5000;
export const VISIT_PHOTOS_PER_DEVICE = 5;

export interface VisitPhotoDraft { uri: string; name: string; type: 'image/jpeg' | 'image/png' | 'image/webp'; uploadId?: string; assetId?: string; sizeBytes?: number }

/**
 * Identity of a photo across devices. The picker copies a library photo to a new file each time, so the uri of the same
 * photo differs between picks: compare the library asset id, else file name plus size, and the uri only as the last resort.
 */
export const photoKey = (p: { uri: string; name?: string; assetId?: string | null; sizeBytes?: number | null }): string =>
  p.assetId ? `a:${p.assetId}` : p.name && p.sizeBytes ? `n:${p.name}:${p.sizeBytes}` : `u:${p.uri}`;
export interface VisitDeviceDraft {
  key: string;
  serviceId: string;
  serviceName: string;
  priceSummary?: ServicePriceSummary | null;
  description: string;
  photos: VisitPhotoDraft[];
  /** Catalog code of the service: tells whether the device facts (type, size...) are asked for. */
  serviceCode?: string | null;
  /** Device facts and the price variant they pick, asked for like Máy 1 (catalog v2 services). */
  deviceAttributes?: BookingDeviceAttributes;
  selectedVariantCode?: string | null;
  preview?: CatalogPricingPreview | null;
  /** Suggested by the assistant: the customer must check and confirm it before the visit can be sent. */
  unconfirmed?: boolean;
}

export function addDevice(devices: VisitDeviceDraft[], device: VisitDeviceDraft, limit = VISIT_DEVICE_LIMIT): VisitDeviceDraft[] {
  return devices.length >= limit ? devices : [...devices, device];
}

/** Why a device cannot be saved into the visit yet, or null. */
export function deviceProblem(device: Pick<VisitDeviceDraft, 'serviceId' | 'description'>): string | null {
  if (!device.serviceId) return 'Chọn dịch vụ cho thiết bị này.';
  if (!device.description.trim()) return 'Mô tả tình trạng của thiết bị này.';
  if (device.description.length > VISIT_DESCRIPTION_MAX) return `Mô tả tối đa ${VISIT_DESCRIPTION_MAX} ký tự.`;
  return null;
}

/** Filled in and, for an assistant suggestion, confirmed: what the device chip marks as done. */
export const deviceComplete = (d: VisitDeviceDraft): boolean => !deviceProblem(d) && !d.unconfirmed;

/** A photo may belong to one device only. */
export function duplicatePhoto(devices: Pick<VisitDeviceDraft, 'photos'>[]): boolean {
  const keys = devices.flatMap((d) => d.photos.map(photoKey));
  return new Set(keys).size !== keys.length;
}

/** Why the visit cannot be sent yet, or null. A single device goes as a normal booking, so a visit needs 2 or more. */
export function visitProblem(devices: VisitDeviceDraft[], addressReady: boolean, schedule: BookingSchedule | null): string | null {
  if (devices.length < 2) return 'Lượt sửa cần từ 2 đến 3 thiết bị.';
  if (devices.length > VISIT_DEVICE_LIMIT) return `Mỗi lượt chỉ nhận tối đa ${VISIT_DEVICE_LIMIT} thiết bị.`;
  for (const [i, d] of devices.entries()) {
    const bad = deviceProblem(d) ?? (d.unconfirmed ? 'Kiểm tra và xác nhận thiết bị trợ lý AI gợi ý.' : null);
    if (bad) return `Máy ${i + 1}: ${bad}`;
  }
  if (duplicatePhoto(devices)) return 'Ảnh của mỗi thiết bị phải riêng biệt. Hãy sửa ảnh trùng trước khi gửi.';
  if (!addressReady) return 'Chọn địa chỉ có vị trí hợp lệ.';
  if (!schedule) return 'Chọn thời gian hẹn.';
  return null;
}

/** The per-device price the summary adds up; survey-only services are never counted as zero. */
export function devicePrice(summary: ServicePriceSummary | null | undefined): SummaryPrice {
  if (!summary) return { kind: 'none' };
  const { kind, minLaborVnd: min, maxLaborVnd: max } = summary;
  if (kind === 'fixed_range' && typeof min === 'number' && typeof max === 'number' && max >= min) {
    return min === max ? { kind: 'firm', amount: min } : { kind: 'range', min, max };
  }
  return { kind: 'survey', from: summary.suggestedLaborVnd ?? min ?? null, to: null };
}

export function buildVisitDto(args: {
  devices: VisitDeviceDraft[];
  addressId: string;
  schedule: BookingSchedule;
  note: string;
  idempotencyKey: string;
  aiSessionId?: string;
}): CreateVisitDto {
  const { devices, addressId, schedule, note, idempotencyKey, aiSessionId } = args;
  const items: VisitDeviceInput[] = devices.map((d, i) => ({
    serviceId: d.serviceId,
    deviceLabel: `Máy ${i + 1}`,
    description: d.description.trim(),
    photoUploadIds: d.photos.flatMap((p) => (p.uploadId ? [p.uploadId] : [])),
    ...(d.deviceAttributes && Object.keys(d.deviceAttributes).length > 0 ? { deviceAttributes: { ...d.deviceAttributes } } : {}),
    ...(d.selectedVariantCode ? { selectedVariantCode: d.selectedVariantCode } : {}),
  }));
  return {
    addressId,
    mode: schedule.mode,
    ...(schedule.mode === 'scheduled' ? { date: schedule.date, slot: schedule.slot } : {}),
    ...(note.trim() ? { customerNote: note.trim() } : {}),
    urgency: 'NORMAL',
    idempotencyKey,
    ...(aiSessionId ? { aiSessionId } : {}),
    items,
  };
}
