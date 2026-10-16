// Pure layout of one day of the technician schedule as an hour grid (6:00–22:00, widened to fit).
import type { ServiceOrderItem } from '../../api/orders.api';
import type { TechnicianTimeOff } from '../../api/technician-profile.api';
import { vnParts } from '../../utils/vn-time';
import { dayKeyVn, type ScheduleDay } from './technician-schedule';

export const ORDER_BLOCK_MIN = 120; // orders only carry a start; the booking window is 2 h
const MINUTES_PER_DAY = 24 * 60;

export interface TimelineBlock {
  id: string;
  kind: 'order' | 'timeoff';
  startMin: number;
  endMin: number;
  /** Column among overlapping orders and how many columns the day needs. */
  col: number;
  cols: number;
  order?: ServiceOrderItem;
  timeOff?: TechnicianTimeOff;
}

export interface DayTimeline {
  startHour: number;
  endHour: number;
  blocks: TimelineBlock[];
  /** Minutes from midnight when the day is today, else null. */
  nowMin: number | null;
}

const minuteOfDay = (iso: string) => {
  const p = vnParts(Date.parse(iso));
  return p.hour * 60 + p.minute;
};

export function buildDayTimeline(day: ScheduleDay, now: number): DayTimeline {
  const orders: TimelineBlock[] = day.orders.map((order) => {
    const startMin = minuteOfDay(order.scheduledAt);
    return { id: order.id, kind: 'order', startMin, endMin: Math.min(MINUTES_PER_DAY, startMin + ORDER_BLOCK_MIN), col: 0, cols: 1, order };
  });
  // Greedy columns: an order goes in the first column whose last block has ended.
  const colEnds: number[] = [];
  for (const b of [...orders].sort((a, c) => a.startMin - c.startMin)) {
    let col = colEnds.findIndex((end) => end <= b.startMin);
    if (col === -1) col = colEnds.length;
    colEnds[col] = b.endMin;
    b.col = col;
  }
  for (const b of orders) b.cols = Math.max(1, colEnds.length);

  const off: TimelineBlock[] = day.timeOff.map((t) => ({
    id: t.id,
    kind: 'timeoff',
    startMin: dayKeyVn(t.startAt) === day.key ? minuteOfDay(t.startAt) : 0,
    endMin: dayKeyVn(t.endAt) === day.key ? minuteOfDay(t.endAt) : MINUTES_PER_DAY,
    col: 0,
    cols: 1,
    timeOff: t,
  }));

  const blocks = [...off, ...orders];
  let startHour = 6;
  let endHour = 22;
  for (const b of blocks) {
    startHour = Math.min(startHour, Math.floor(b.startMin / 60));
    endHour = Math.max(endHour, Math.ceil(b.endMin / 60));
  }
  return { startHour, endHour, blocks, nowMin: day.key === dayKeyVn(now) ? minuteOfDay(new Date(now).toISOString()) : null };
}
