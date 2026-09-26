/** Convert a customer-selected LOCAL arrival window to Backend ISO timestamps. */
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
  return { preferredStartAt: start.toISOString(), preferredEndAt: end.toISOString() };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UI boundary only; Backend remains authoritative for catalog and ownership. */
export function validateBookingFields(fields: {
  serviceId: string;
  addressId: string;
  description: string;
  quantity?: number;
}): { serviceId: string; addressId: string; description: string; quantity?: number } {
  if (!UUID_PATTERN.test(fields.serviceId) || !UUID_PATTERN.test(fields.addressId)) {
    throw new Error('Vui lòng chọn dịch vụ và địa chỉ đã lưu hợp lệ.');
  }
  const description = fields.description.trim();
  if (!description || description.length > 5000) {
    throw new Error('Vui lòng nhập mô tả sự cố tối đa 5000 ký tự.');
  }
  if (fields.quantity !== undefined && (!Number.isInteger(fields.quantity) || fields.quantity < 1 || fields.quantity > 1000)) {
    throw new Error('Số lượng thiết bị phải nằm trong khoảng 1–1000.');
  }
  return { ...fields, description };
}