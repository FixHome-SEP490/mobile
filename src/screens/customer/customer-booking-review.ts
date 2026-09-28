import type { CreateBookingDto } from '../../api/bookings.api';
import type { ServiceItem } from '../../api/services.api';
import type { AddressData } from '../../api/users.api';
import { resolveServicePrice } from './service-catalog';
import { addressReadyForBooking } from './customer-booking-create';
import { buildCustomerBookingWindow, validateBookingFields } from '../../utils/booking-window';

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export interface BookingReviewSnapshot {
  readonly ownerUserId: string;
  readonly request: Readonly<CreateBookingDto>;
  readonly serviceName: string;
  readonly addressLabel: string;
  readonly addressDescription: string;
  readonly scheduleLabel: string;
  readonly pricingLabel: string;
}

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
  now,
}: {
  ownerUserId: string;
  service: ServiceItem;
  address: AddressData;
  description: string;
  date: Date;
  time: string;
  now?: Date;
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

  const window = buildCustomerBookingWindow({ date, time, now });
  const request: Readonly<CreateBookingDto> = Object.freeze({
    ...fields,
    ...window,
    urgency: 'NORMAL',
  });
  const price = resolveServicePrice(service);
  const pricingLabel =
    service.pricingMode === 'fixed_price'
      ? `Giá cố định: ${price.text}`
      : service.pricingMode === 'inspection_required'
        ? `Cần khảo sát/báo giá: ${price.text}`
        : price.text;
  const [startHour, startMinute] = time.split(':').map(Number);
  const endHour = String(startHour + 2).padStart(2, '0');
  const endMinute = String(startMinute).padStart(2, '0');

  return Object.freeze({
    ownerUserId,
    request,
    serviceName: service.name,
    addressLabel: address.label || 'Địa chỉ sửa chữa',
    addressDescription: [address.line1, address.ward, address.district, address.province]
      .filter(Boolean)
      .join(', '),
    scheduleLabel: `${formatBookingDate(date)} · ${time}–${endHour}:${endMinute}`,
    pricingLabel,
  });
}
