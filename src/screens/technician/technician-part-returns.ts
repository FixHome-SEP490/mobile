import { canDeclareMoreQty, type PartCustodyReturnRecord } from '../../api/part-requests.api';

export interface PartReturnGroup {
  orderId: string;
  /** Short code the technician can match against the job; the full id is only for navigation. */
  label: string;
  rows: PartCustodyReturnRecord[];
  /** Quantity still owed across the order, declared-but-unaccepted included. */
  owedQty: number;
  /** Some line still has quantity the technician has not declared. */
  needsDeclare: boolean;
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
    const group = groups.get(row.orderId) ?? { orderId: row.orderId, label: `#${row.orderId.slice(0, 8).toUpperCase()}`, rows: [], owedQty: 0, needsDeclare: false, since: null };
    group.rows.push(row);
    group.owedQty += row.outstandingQty;
    group.needsDeclare ||= canDeclareMoreQty(row) > 0;
    if (row.handedOverAt && (!group.since || Date.parse(row.handedOverAt) < Date.parse(group.since))) group.since = row.handedOverAt;
    groups.set(row.orderId, group);
  }
  const time = (g: PartReturnGroup) => (g.since ? Date.parse(g.since) : Infinity);
  return [...groups.values()].sort((a, b) => Number(b.needsDeclare) - Number(a.needsDeclare) || time(a) - time(b));
}

export function filterPartReturns(groups: PartReturnGroup[], filter: PartReturnFilter): PartReturnGroup[] {
  return filter === 'all' ? groups : groups.filter(g => g.needsDeclare === (filter === 'declare'));
}
