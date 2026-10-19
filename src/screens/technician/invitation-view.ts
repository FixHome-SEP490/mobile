// Pure display helpers for the Invitations tab (ordering + server-deadline countdown).
import type { InvitationItem } from '../../api/bookings.api';
import { isActionable } from './invitation-inbox';

const URGENT_MS = 15 * 60 * 1000;

/**
 * Live invitations first, soonest deadline on top (priorityOrder breaks ties);
 * expired/answered ones sink to the bottom in their original order. Display only:
 * nothing is filtered, and actionability is still decided by `isActionable`.
 */
export function sortInvitationsForDisplay(list: InvitationItem[]): InvitationItem[] {
  const live: InvitationItem[] = [];
  const rest: InvitationItem[] = [];
  for (const inv of list) (isActionable(inv) ? live : rest).push(inv);
  live.sort(
    (a, b) =>
      Date.parse(a.expiresAt as string) - Date.parse(b.expiresAt as string) ||
      a.priorityOrder - b.priorityOrder,
  );
  return [...live, ...rest];
}

/** Countdown from the server deadline; null when there is no deadline or it has passed. */
export function invitationCountdown(
  expiresAt: string | null | undefined,
  now: number,
): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.ceil(remaining / 60000);
  const label =
    minutes >= 60
      ? `Còn ${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`
      : `Còn ${minutes} phút`;
  return { label, urgent: remaining < URGENT_MS };
}

/** Label for a non-actionable invitation: answered ones say so, everything else is expired. */
export function invitationClosedLabel(status: InvitationItem['status']): string {
  if (status === 'ACCEPTED') return 'Đã nhận việc';
  if (status === 'DECLINED') return 'Đã từ chối';
  return 'Đã hết hạn';
}

/** "Cách bạn dưới 1 km" / "khoảng 3-5 km" / "hơn 40 km"; empty when the server could not measure (same wording as the web). */
export function invitationDistanceText(band: { minKm: number; maxKm: number | null } | null | undefined): string {
  if (!band) return '';
  if (band.minKm === 0 && band.maxKm != null) return `Cách bạn dưới ${band.maxKm} km`;
  if (band.maxKm == null) return `Cách bạn hơn ${band.minKm} km`;
  return `Cách bạn khoảng ${band.minKm}-${band.maxKm} km`;
}

/** The price basis the technician accepts: the listed price, or a quote after the visit. */
export function invitationPriceText(
  booking: { pricingMode?: string | null; fixedUnitPrice?: number | null; quantity?: number } | undefined,
  formatMoney: (n: number) => string,
): string {
  if (String(booking?.pricingMode ?? '').toLowerCase() === 'fixed_price' && booking?.fixedUnitPrice != null) {
    const qty = booking.quantity && booking.quantity > 1 ? ` × ${booking.quantity}` : '';
    return `Giá niêm yết ${formatMoney(booking.fixedUnitPrice)}${qty}`;
  }
  return 'Báo giá sau khi kiểm tra tại nhà khách';
}
