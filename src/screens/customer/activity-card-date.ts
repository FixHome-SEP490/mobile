import { vnDateString, vnTimeString } from '../../utils/vn-time';

const valid = (iso: string | null | undefined): iso is string => !!iso && Number.isFinite(Date.parse(iso));

/**
 * The date on an Activity card is the appointment, as on the booking request card ("14/11/2026 · 09:00"),
 * not the day the order was created. Without an appointment the creation day is the honest fallback.
 */
export function activityCardWhen(scheduledAt: string | null | undefined, createdAt: string | null | undefined, missing: string): string {
  if (valid(scheduledAt)) return `${vnDateString(scheduledAt)} · ${vnTimeString(scheduledAt, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  return valid(createdAt) ? vnDateString(createdAt) : missing;
}
