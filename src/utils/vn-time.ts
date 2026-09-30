/**
 * Vietnam time, whatever time zone the phone is set to.
 *
 * FixHome only operates in Vietnam, and Vietnam has kept a fixed UTC+07:00
 * offset with no daylight saving since 1975, so the wall clock is the instant
 * shifted by seven hours. Display goes through Intl with an explicit zone so
 * the wording stays exactly what the screens already showed.
 */
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type DateInput = Date | string | number;

export interface VnParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
}

export function vnParts(input: DateInput): VnParts {
  const shifted = new Date(new Date(input).getTime() + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant at which Vietnam clocks read the given date and time. */
export function vnWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS);
}

/**
 * Today's date in Vietnam as a calendar Date (local midnight of that day),
 * the shape date pickers take and return.
 */
export function vnTodayCalendarDate(now: DateInput = new Date(), plusDays = 0): Date {
  const p = vnParts(new Date(now).getTime() + plusDays * DAY_MS);
  return new Date(p.year, p.month - 1, p.day);
}

export function isSameVnDay(a: DateInput, b: DateInput): boolean {
  const x = vnParts(a);
  const y = vnParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

const withZone = (options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({
  ...options,
  timeZone: VN_TIME_ZONE,
});

export function vnDateString(input: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleDateString('vi-VN', withZone(options));
}

export function vnTimeString(input: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleTimeString('vi-VN', withZone(options));
}

export function vnDateTimeString(input: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleString('vi-VN', withZone(options));
}
