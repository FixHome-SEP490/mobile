// src/services/live-kinds.ts
//
// What an `order:updated` push says it touched (PO 18/10/2026), the same words as the backend's realtime
// listener, and which part of an order screen each kind concerns, so a screen reads only that part again.

export type OrderChangeKind =
  | 'order'
  | 'status'
  | 'invoice'
  | 'quotation'
  | 'additional_cost'
  | 'cash'
  | 'evidence'
  | 'arrival'
  | 'part'
  | 'warranty'
  | 'assignment';

const ALL_KINDS: ReadonlySet<string> = new Set<OrderChangeKind>([
  'order', 'status', 'invoice', 'quotation', 'additional_cost', 'cash', 'evidence', 'arrival', 'part', 'warranty', 'assignment',
]);

/** Kinds that change what an order list or a counter shows. */
const LIST_KINDS: ReadonlySet<OrderChangeKind> = new Set(['status', 'order', 'assignment', 'invoice', 'cash', 'warranty']);

/** The kinds in a payload, or undefined when it names none (an older server: anything may have changed). */
export function kindsOf(payload: Record<string, unknown> | undefined): OrderChangeKind[] | undefined {
  const raw = payload?.kinds;
  if (!Array.isArray(raw)) return undefined;
  const known = raw.filter((k): k is OrderChangeKind => typeof k === 'string' && ALL_KINDS.has(k));
  return known.length ? known : undefined;
}

/** Every kind announced within a burst; unknown on either side means "anything". */
export function mergeKinds(a: OrderChangeKind[] | undefined, b: OrderChangeKind[] | undefined): OrderChangeKind[] | undefined {
  if (!a || !b) return undefined;
  return [...new Set([...a, ...b])].sort();
}

/** True when this change can move an order between list tabs or change a counter. */
export function touchesLists(kinds: OrderChangeKind[] | undefined): boolean {
  return !kinds || kinds.some((kind) => LIST_KINDS.has(kind));
}

/** Whether a burst can change what a list or a counter shows: any non-order event, a resync, or an order change that touches lists. */
export function listsNeedRead(batch: { events: { name: string }[]; kinds: OrderChangeKind[] | undefined; resync: boolean }): boolean {
  return batch.resync || batch.events.some((event) => event.name !== 'order:updated') || touchesLists(batch.kinds);
}

export interface OrderPartsToRead {
  /** The order itself: status, holder, quotation, arrival, warranty. */
  detail: boolean;
  evidence: boolean;
  invoice: boolean;
  costs: boolean;
  parts: boolean;
}

/** Which parts of one order screen a change touches; unknown kinds read everything. */
export function orderPartsFor(kinds: OrderChangeKind[] | undefined): OrderPartsToRead {
  if (!kinds) return { detail: true, evidence: true, invoice: true, costs: true, parts: true };
  const has = (...wanted: OrderChangeKind[]) => wanted.some((k) => kinds.includes(k));
  return {
    detail: has('order', 'status', 'assignment', 'quotation', 'arrival', 'warranty', 'cash'),
    evidence: has('evidence', 'status'),
    invoice: has('invoice', 'cash', 'status'),
    costs: has('additional_cost', 'status'),
    parts: has('part'),
  };
}
