import type { CreateBookingDto } from '../../api/bookings.api';
import type { BookingDeviceAttributes } from '../../api/catalog-pricing.api';
import type { MediaUploadImage } from '../../api/media.api';
import type { ServiceItem } from '../../api/services.api';
import type { AddressData } from '../../api/users.api';
import { resolveServicePrice } from './service-catalog';
import { addressReadyForBooking } from './customer-booking-create';
import { buildCustomerBookingWindow, validateBookingFields } from '../../utils/booking-window';
import { buildScheduleWindow, scheduleSummary, type BookingSchedule } from '../../utils/booking-session';

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export interface BookingReviewSnapshot {
  readonly ownerUserId: string;
  readonly request: Readonly<CreateBookingDto>;
  readonly serviceName: string;
  readonly addressLabel: string;
  readonly addressDescription: string;
  readonly scheduleLabel: string;
  readonly pricingLabel: string;
  readonly photos: readonly BookingPhotoPreview[];
  /** The booking carries an assistant conversation the technician will see. */
  readonly hasAiSummary: boolean;
}

export interface BookingPhotoPreview extends MediaUploadImage {
  readonly sizeBytes?: number;
}

const AI_SESSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function formatBookingDate(date: Date): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${weekday}, ${day}/${month}`;
}

export function buildBookingReviewSnapshot({
  ownerUserId,
  service,
  address,
  description,
  date,
  time,
  schedule,
  customerNote,
  now,
  aiSessionId,
  photos = [],
  deviceAttributes,
  selectedVariantCode,
}: {
  ownerUserId: string;
  service: ServiceItem;
  address: AddressData;
  description: string;
  /** Legacy picker (date + start time); ignored when `schedule` is given. */
  date?: Date;
  time?: string;
  schedule?: BookingSchedule;
  customerNote?: string;
  now?: Date;
  aiSessionId?: string | null;
  photos?: readonly BookingPhotoPreview[];
  deviceAttributes?: BookingDeviceAttributes;
  selectedVariantCode?: string | null;
}): BookingReviewSnapshot {
  if (!ownerUserId || address.userId !== ownerUserId) {
    throw new Error('Vui lòng chọn địa chỉ đã lưu của tài khoản này.');
  }
  if (!service.isActive) {
    throw new Error('Dịch vụ đã chọn không còn khả dụng. Vui lòng tải lại danh sách.');
  }

  const fields = validateBookingFields({
    serviceId: service.id,
    addressId: address.id,
    description,
    quantity: 1,
  });
  if (!addressReadyForBooking(address)) {
    throw new Error(
      'Địa chỉ này chưa có vị trí hợp lệ. Hãy cập nhật địa chỉ trong Hồ sơ trước khi đặt lịch.',
    );
  }

  if (!schedule && (!date || !time)) throw new Error('Vui lòng chọn ngày và buổi (sáng hoặc chiều).');
  const window = schedule ? buildScheduleWindow(schedule, now) : buildCustomerBookingWindow({ date: date!, time: time!, now });
  const note = customerNote?.trim() ?? '';
  if (note.length > 1000) throw new Error('Ghi chú cho thợ tối đa 1000 ký tự.');
  // Only a session id the assistant could have issued; anything else is dropped
  // and the booking goes through as a plain one.
  const session = aiSessionId && AI_SESSION_PATTERN.test(aiSessionId) ? aiSessionId : null;
  const request: Readonly<CreateBookingDto> = Object.freeze({
    ...fields,
    ...window,
    urgency: 'NORMAL',
    ...(note ? { customerNote: note } : {}),
    ...(session ? { aiSessionId: session } : {}),
    ...(deviceAttributes && Object.keys(deviceAttributes).length > 0 ? { deviceAttributes: { ...deviceAttributes } } : {}),
    ...(selectedVariantCode ? { selectedVariantCode } : {}),
  });
  const price = resolveServicePrice(service);
  const pricingLabel =
    service.pricingMode === 'fixed_price'
      ? `Giá cố định: ${price.text}`
      : service.pricingMode === 'inspection_required'
        ? `Cần khảo sát/báo giá: ${price.text}`
        : price.text;
  let scheduleLabel: string;
  if (schedule) {
    scheduleLabel = scheduleSummary(schedule);
  } else {
    const [startHour, startMinute] = time!.split(':').map(Number);
    const endHour = String(startHour + 2).padStart(2, '0');
    const endMinute = String(startMinute).padStart(2, '0');
    scheduleLabel = `${formatBookingDate(date!)} · ${time}–${endHour}:${endMinute}`;
  }

  return Object.freeze({
    ownerUserId,
    request,
    serviceName: service.name,
    addressLabel: address.label || 'Địa chỉ sửa chữa',
    addressDescription: [address.line1, address.ward, address.district, address.province]
      .filter(Boolean)
      .join(', '),
    scheduleLabel,
    pricingLabel,
    photos: Object.freeze(photos.map((photo) => Object.freeze({ ...photo }))),
    hasAiSummary: session !== null,
  });
}
