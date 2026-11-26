import { type PartCustodyReturnRecord } from '../../api/part-requests.api';

/**
 * Group of one open line, the same as the server's: outstanding needs declaring; declared or
 * partially received waits for the manager, even when more could still be declared. A reported
 * mismatch is in neither.
 */
export function openReturnGroup(row: PartCustodyReturnRecord): 'declare' | 'waiting' | null {
  switch (row.returnStatus) {
    case 'outstanding': return 'declare';
    case 'declared': case 'partially_received': return 'waiting';
    case undefined: return row.declaredQty > 0 || row.managerAcceptedQty > 0 ? 'waiting' : 'declare';
    default: return null;
  }
}

export interface PartReturnGroup {
  orderId: string;
  /** Short code the technician can match against the job; the full id is only for navigation. */
  label: string;
  rows: PartCustodyReturnRecord[];
  /** Quantity still owed across the order, declared-but-unaccepted included. */
  owedQty: number;
  /** Some line is still "Cần khai trả": nothing declared yet (BUG DETECTOR 302, PO). */
  needsDeclare: boolean;
  /** Some line was declared and the manager has not received it all ("Chờ quản lý nhận"). */
  awaitingManager: boolean;
  /** Earliest handover, to tell how long the parts have been held. */
  since: string | null;
}

export type PartReturnFilter = 'all' | 'declare' | 'waiting';

/**
 * Lines the technician still owes, grouped by order: orders with something left to declare first, then oldest handover.
 * Lines without an order cannot be opened, so they are left out.
 */
export function groupPartReturns(records: PartCustodyReturnRecord[]): PartReturnGroup[] {
  const groups = new Map<string, PartReturnGroup>();
  for (const row of records) {
    if (!row.orderId || row.outstandingQty <= 0) continue;
    const group = groups.get(row.orderId) ?? { orderId: row.orderId, label: `#${row.orderId.slice(0, 8).toUpperCase()}`, rows: [], owedQty: 0, needsDeclare: false, awaitingManager: false, since: null };
    group.rows.push(row);
    group.owedQty += row.outstandingQty;
    const kind = openReturnGroup(row);
    group.needsDeclare ||= kind === 'declare';
    group.awaitingManager ||= kind === 'waiting';
    if (row.handedOverAt && (!group.since || Date.parse(row.handedOverAt) < Date.parse(group.since))) group.since = row.handedOverAt;
    groups.set(row.orderId, group);
  }
  const time = (g: PartReturnGroup) => (g.since ? Date.parse(g.since) : Infinity);
  return [...groups.values()].sort((a, b) => Number(b.needsDeclare) - Number(a.needsDeclare) || time(a) - time(b));
}

export function filterPartReturns(groups: PartReturnGroup[], filter: PartReturnFilter): PartReturnGroup[] {
  if (filter === 'all') return groups;
  return groups.filter(g => (filter === 'declare' ? g.needsDeclare : g.awaitingManager && !g.needsDeclare));
}
