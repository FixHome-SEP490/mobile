import type { BookingItem } from '../../api/bookings.api';
import type { AddressData } from '../../api/users.api';

export type BookingCreatePostErrorClass = 'definitive' | 'ambiguous';

const DEFINITIVE_PRECOMMIT_STATUSES = new Set([400, 401, 403, 404, 422]);

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export function bookingCreateErrorStatus(error: unknown): number | undefined {
  return statusOf(error);
}

/**
 * Backend create currently rejects these statuses before entering the Booking
 * transaction. Anything else stays conservative because the transaction can
 * commit before a later audit/network failure becomes visible to the client.
 */
export function classifyBookingCreatePostError(
  error: unknown,
): BookingCreatePostErrorClass {
  const status = statusOf(error);
  return status !== undefined && DEFINITIVE_PRECOMMIT_STATUSES.has(status)
    ? 'definitive'
    : 'ambiguous';
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric >= min && numeric <= max
    ? numeric
    : null;
}

export function addressReadyForBooking(
  address: Pick<AddressData, 'lat' | 'lng'> | null | undefined,
): boolean {
  if (!address) return false;
  return (
    coordinate(address.lat, -90, 90) !== null &&
    coordinate(address.lng, -180, 180) !== null
  );
}

const DEFAULT_DESCRIPTION_SUGGESTIONS = [
  'Thiết bị không lên nguồn', 'Phát ra tiếng ồn lạ',
  'Cần bảo dưỡng vệ sinh', 'Hỏng linh kiện / cần thay mới',
] as const;
const COOLING_DESCRIPTION_SUGGESTIONS = [
  'Máy không mát / kém lạnh', 'Chảy nước dàn lạnh', 'Kêu to / rung lắc mạnh',
  'Mùi hôi ẩm mốc', 'Không nhận điều khiển', 'Bám tuyết ống đồng',
] as const;

/** Local editable symptoms; service-specific context takes precedence over Web category fallbacks. */
export function getBookingDescriptionSuggestions(serviceCode?: string, categoryName?: string): readonly string[] {
  const code = serviceCode?.trim().toLocaleUpperCase('en-US') ?? '';
  if (code.startsWith('VE_SINH_DIEU_HOA') || code === 'AC-02') {
    return ['Bụi bám dàn lạnh', 'Mùi hôi ẩm mốc', 'Luồng gió yếu', 'Lâu chưa vệ sinh'];
  }
  if (code.startsWith('SUA_DIEU_HOA') || code === 'AC-01') return COOLING_DESCRIPTION_SUGGESTIONS;
  if (code === 'SUA_RO_RI_NUOC' || code === 'PI-01') {
    return ['Rò rỉ lavabo / bồn rửa', 'Rò rỉ đường ống nước', 'Rò nước tại van / vòi', 'Tường / sàn bị thấm nước'];
  }
  if (code === 'LAP_TV_GIA_TREO' || code === 'TV-01') {
    return ['Đã có giá treo TV', 'Lắp trên tường bê tông', 'Lắp trên tường gạch', 'Lắp trên tường thạch cao'];
  }
  const category = categoryName?.toLocaleLowerCase('vi') ?? '';
  if (category.includes('lạnh') || category.includes('điều hòa')) return COOLING_DESCRIPTION_SUGGESTIONS;
  if (category.includes('nước') || category.includes('điện')) {
    return ['Rò rỉ lavabo / bồn rửa', 'Nghẹt cống / thoát sàn chậm', 'Mất nước / áp lực nước yếu', 'Chập điện / nhảy aptomat', 'Hỏng van vòi xịt / vòi sen'];
  }
  if (category.includes('bếp')) {
    return ['Bếp từ báo lỗi không nóng', 'Hút mùi kêu to / hút yếu', 'Bếp mất nguồn', 'Rò điện khi chạm vỏ', 'Nứt mặt kính / kẹt cảm ứng'];
  }
  if (category.includes('cửa') || category.includes('khóa')) {
    return ['Khóa vân tay không nhận', 'Hết pin / mất nguồn khóa', 'Kẹt chốt / khó đóng mở', 'Xệ bản lề / kêu cót két', 'Cần đổi mã số / thẻ từ'];
  }
  return DEFAULT_DESCRIPTION_SUGGESTIONS;
}

function sameDescriptionSuggestion(part: string, suggestion: string): boolean {
  return part.trim().toLocaleLowerCase('vi') === suggestion.trim().toLocaleLowerCase('vi');
}

export function hasBookingDescriptionSuggestion(description: string, suggestion: string): boolean {
  return Boolean(suggestion.trim()) && description.split(/[,\n]/).some((part) => sameDescriptionSuggestion(part, suggestion));
}

export function appendBookingDescriptionSuggestion(description: string, suggestion: string): string {
  if (!suggestion.trim() || hasBookingDescriptionSuggestion(description, suggestion)) return description;
  const separator = description.length === 0 ? '' : '\n';
  const next = `${description}${separator}${suggestion}`;
  return next.length <= 5000 ? next : description;
}

export function toggleBookingDescriptionSuggestion(description: string, suggestion: string): string {
  if (!hasBookingDescriptionSuggestion(description, suggestion)) {
    return appendBookingDescriptionSuggestion(description, suggestion);
  }
  // Retain the original freeform parts and separators; never substring-replace prose or AI text.
  const parts = description.split(/([,\n])/);
  for (let index = parts.length - 1; index >= 0; index -= 2) {
    if (!sameDescriptionSuggestion(parts[index], suggestion)) continue;
    if (index > 0) parts.splice(index - 1, 2);
    else {
      const comma = parts[1] === ',';
      parts.splice(0, 2);
      if (comma && parts[0]?.startsWith(' ')) parts[0] = parts[0].slice(1);
    }
  }
  return parts.join('');
}

export interface BookingCreationAttempt {
  ownerUserId: string;
  serviceId: string;
  addressId: string;
  description: string;
  preferredStartAt: string;
  preferredEndAt: string;
  baselineIds: readonly string[] | null;
  confirmedBookingId?: string;
}

/**
 * Only a real server-returned ID correlates this attempt. A unique history row
 * matching content/baseline can belong to another device's identical request.
 */
export function findCreatedBookingEvidence(
  attempt: BookingCreationAttempt,
  rows: readonly BookingItem[],
): BookingItem | null {
  if (!attempt.confirmedBookingId) return null;
  return rows.find(booking => booking.id === attempt.confirmedBookingId && booking.customerId === attempt.ownerUserId) ?? null;
}
