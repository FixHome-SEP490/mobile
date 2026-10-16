import { startOfWeekVn } from './technician-home';
import { dayKeyVn } from './technician-schedule';

const DAY_MS = 24 * 60 * 60 * 1000;

export type EarningsPeriod = 'day' | 'week' | 'month';

const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Vietnam calendar range (yyyy-MM-dd, inclusive) of the day / Mon–Sun week / month `offset` units before the current one. */
export function periodRange(period: EarningsPeriod, offset: number, now: number): { from: string; to: string } {
  const today = dayKeyVn(now)!;
  if (period === 'day') {
    const day = addDays(today, -offset);
    return { from: day, to: day };
  }
  if (period === 'week') {
    const from = addDays(dayKeyVn(startOfWeekVn(now))!, -7 * offset);
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = today.split('-').map(Number);
  const idx = y * 12 + (m - 1) - offset;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${pad(mm + 1)}-01`;
  return { from: `${yy}-${pad(mm)}-01`, to: addDays(next, -1) };
}
