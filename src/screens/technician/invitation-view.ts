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
