// Display-only formatters (DS §11). No business rounding: backend owns money math.

const NBSP = ' ';

/** `1.250.000 ₫`; 0 → `0 ₫`; negative → `-50.000 ₫`; null/invalid → `—` (never 0). */
export function formatVnd(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${digits}${NBSP}₫`;
}

const pad = (n: number) => String(n).padStart(2, '0');

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
