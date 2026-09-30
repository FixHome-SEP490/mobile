// Display-only formatters (DS §11). No business rounding: backend owns money math.

const NBSP = ' ';
// Vietnam has no DST, so a fixed +7h shift is exact and independent of Intl/device timezone.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `1.250.000 ₫`; 0 → `0 ₫`; negative → `-50.000 ₫`; null/invalid → `—` (never 0). */
export function formatVnd(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${digits}${NBSP}₫`;
}

const pad = (n: number) => String(n).padStart(2, '0');

function vnParts(iso: string | Date | null | undefined) {
  if (iso == null || iso === '') return null;
  const time = (iso instanceof Date ? iso : new Date(iso)).getTime();
  if (Number.isNaN(time)) return null;
  const d = new Date(time + VN_OFFSET_MS);
  return {
    date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

/** `dd/MM/yyyy` in Asia/Ho_Chi_Minh, `—` when missing/invalid. */
export const formatDate = (iso: string | Date | null | undefined) => vnParts(iso)?.date ?? '—';

/** `HH:mm` (24h) in Asia/Ho_Chi_Minh. */
export const formatTime = (iso: string | Date | null | undefined) => vnParts(iso)?.time ?? '—';

/** `HH:mm, dd/MM/yyyy` in Asia/Ho_Chi_Minh. */
export function formatDateTime(iso: string | Date | null | undefined): string {
  const p = vnParts(iso);
  return p ? `${p.time}, ${p.date}` : '—';
}

/**
 * Parse a user-typed `dd/MM/yyyy` (also `-` or `.` separators, 1–2 digit day/month) into the
 * calendar-date string `yyyy-MM-dd`. Returns null for anything that is not a real date.
 */
export function parseVnDateInput(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Re-render an already formatted `1.250.000đ` string (shared helpers) as `1.250.000 ₫`. */
export function vndText<T extends string | null | undefined>(text: T): T {
  return (typeof text === 'string' ? text.replace(/(\d)\s?đ$/, `$1${NBSP}₫`) : text) as T;
}
