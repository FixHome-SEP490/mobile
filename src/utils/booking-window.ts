/** Allowed customer arrival-window start times, in local device time. */
export const BOOKING_START_TIMES = [
  '09:00',
  '10:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
] as const;

export type BookingStartTime = (typeof BOOKING_START_TIMES)[number];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Return local-midnight bounds for today and three days from today. */
export function getBookingDateRange(now = new Date()): {
  minimumDate: Date;
  maximumDate: Date;
} {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Vui lòng chọn ngày hẹn hợp lệ.');
  }

  const minimumDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maximumDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  maximumDate.setHours(23, 59, 59, 999);
  return { minimumDate, maximumDate };
}

/** Build the customer-create window from its selected local calendar date. */
export function buildCustomerBookingWindow({
  date,
  time,
  now = new Date(),
}: {
  date: Date;
  time: string;
  now?: Date;
}): { preferredStartAt: string; preferredEndAt: string } {
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) {
    throw new Error('Vui lòng chọn ngày hẹn hợp lệ.');
  }

  const { minimumDate, maximumDate } = getBookingDateRange(now);
  const calendarDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (calendarDate < minimumDate || calendarDate > maximumDate) {
    throw new Error('Vui lòng chọn ngày hẹn trong hôm nay đến 3 ngày tới.');
  }

  if (!BOOKING_START_TIMES.some((startTime) => startTime === time)) {
    throw new Error('Vui lòng chọn một trong các khung giờ có sẵn.');
  }

  const [hours, minutes] = time.split(':').map(Number);
  const start = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth(),
    calendarDate.getDate(),
    hours,
    minutes,
  );
  if (start.getHours() !== hours || start.getMinutes() !== minutes) {
    throw new Error('Khung giờ này không tồn tại trong múi giờ hiện tại.');
  }

  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  if (start.getTime() <= now.getTime() || end.getTime() <= start.getTime()) {
    throw new Error('Vui lòng chọn thời gian hẹn trong tương lai.');
  }

  return {
    preferredStartAt: start.toISOString(),
    preferredEndAt: end.toISOString(),
  };
}

/** Preserve the existing relative-window contract used by booking rescheduling. */
export function buildBookingWindow({
  dayOffset,
  time,
  now = new Date(),
}: {
  dayOffset: number;
  time: string;
  now?: Date;
}): { preferredStartAt: string; preferredEndAt: string } {
  if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 30) {
    throw new Error('Vui lòng chọn ngày hẹn hợp lệ.');
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match || Number.isNaN(now.getTime())) {
    throw new Error('Vui lòng chọn giờ hẹn hợp lệ.');
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes);
  if (start.getHours() !== hours || start.getMinutes() !== minutes) {
    throw new Error('Khung giờ này không tồn tại trong múi giờ hiện tại.');
  }
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  if (start.getTime() <= now.getTime() || end.getTime() <= start.getTime()) {
    throw new Error('Vui lòng chọn thời gian hẹn trong tương lai.');
  }
  return {
    preferredStartAt: start.toISOString(),
    preferredEndAt: end.toISOString(),
  };
}

export function validateBookingFields(fields: {
  serviceId: string;
  addressId: string;
  description: string;
  quantity?: number;
}): { serviceId: string; addressId: string; description: string; quantity?: number } {
  if (!UUID_PATTERN.test(fields.serviceId)) throw new Error('Vui lòng chọn dịch vụ thật từ danh sách.');
  if (!UUID_PATTERN.test(fields.addressId)) throw new Error('Vui lòng chọn địa chỉ đã lưu hợp lệ.');
  const description = fields.description.trim();
  if (!description) throw new Error('Vui lòng mô tả sự cố để tiếp tục.');
  if (description.length > 5000) {
    throw new Error('Vui lòng nhập mô tả sự cố tối đa 5000 ký tự.');
  }
  if (fields.quantity !== undefined && (!Number.isInteger(fields.quantity) || fields.quantity < 1 || fields.quantity > 1000)) {
    throw new Error('Số lượng thiết bị phải nằm trong khoảng 1–1000.');
  }
  return { ...fields, description };
}
