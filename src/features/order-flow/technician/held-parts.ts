import type { OrderQuotation } from '../domain/order-session.types';
import type { PartRequestItem } from '../../../api/part-requests.api';

export interface HeldPart { key: string; name: string; quantity: number }

interface HeldRequest {
  serviceOrderId: string;
  technicianId?: string;
  requestType?: string;
  status: string;
  items: (Pick<PartRequestItem, 'id' | 'partNameSnapshot' | 'quantity' | 'usageStatus'> & { partCatalogId?: string | null; partSource?: string | null })[];
}

/**
 * FixHome parts the technician still holds after what the approved quotation will use.
 * Stock = received lines of the pre-repair and quotation requests that are not used or returned;
 * the approved quotation takes its quantity out of that stock (a line already marked used is not taken twice).
 * Additional-cost requests are left out on both sides: each is issued for exactly what its cost approves.
 */
export function heldParts(
  requests: HeldRequest[],
  quotations: Pick<OrderQuotation, 'serviceOrderId' | 'status' | 'items'>[],
  orderId: string,
  technicianId: string,
): HeldPart[] {
  const stock = new Map<string, { name: string; pending: number; used: number }>();
  for (const request of requests) {
    if (request.serviceOrderId !== orderId || request.technicianId !== technicianId || request.status !== 'received') continue;
    if (request.requestType !== 'pre_repair' && request.requestType !== 'quotation') continue;
    for (const item of request.items) {
      if ((item.partSource ?? 'fixhome') !== 'fixhome' || item.usageStatus === 'returned') continue;
      const id = item.partCatalogId || `name:${item.partNameSnapshot}`;
      const entry = stock.get(id) ?? { name: item.partNameSnapshot, pending: 0, used: 0 };
      if (item.usageStatus === 'used') entry.used += item.quantity; else entry.pending += item.quantity;
      stock.set(id, entry);
    }
  }
  const committed = new Map<string, number>();
  for (const quote of quotations) {
    if (quote.serviceOrderId !== orderId || String(quote.status).toUpperCase() !== 'APPROVED') continue;
    for (const item of quote.items) {
      if (!['PARTS', 'PARTS_EQUIPMENT'].includes(String(item.type).toUpperCase()) || (item.partSource ?? 'fixhome') !== 'fixhome' || !item.partCatalogId) continue;
      committed.set(item.partCatalogId, (committed.get(item.partCatalogId) ?? 0) + item.quantity);
    }
  }
  return [...stock]
    .map(([key, { name, pending, used }]) => ({ key, name, quantity: Math.max(0, pending - Math.max(0, (committed.get(key) ?? 0) - used)) }))
    .filter(part => part.quantity > 0);
}

/**
 * The most the technician may record as used on a line: the approved quotation's quantity of that SKU, less what other
 * pre-repair / quotation lines of the same SKU already used (the Backend limits usage per SKU and approved source).
 * Additional-cost lines are covered by their own approved cost (undefined here); unknown quotations also give undefined.
 */
export function approvedQuoteQty(
  item: { partCatalogId?: string | null },
  requestType: string | undefined,
  quotations: Pick<OrderQuotation, 'serviceOrderId' | 'status' | 'items'>[] | null,
  orderId: string,
): number | undefined {
  if (!quotations || !item.partCatalogId || (requestType !== 'pre_repair' && requestType !== 'quotation')) return undefined;
  let approved = 0;
  for (const quote of quotations) {
    if (quote.serviceOrderId !== orderId || String(quote.status).toUpperCase() !== 'APPROVED') continue;
    for (const line of quote.items) {
      if (['PARTS', 'PARTS_EQUIPMENT'].includes(String(line.type).toUpperCase()) && (line.partSource ?? 'fixhome') === 'fixhome' && line.partCatalogId === item.partCatalogId) approved += line.quantity;
    }
  }
  return approved;
}

export function approvedUsageCap(
  item: { id: string; partCatalogId?: string | null },
  requestType: string | undefined,
  requests: HeldRequest[],
  quotations: Pick<OrderQuotation, 'serviceOrderId' | 'status' | 'items'>[] | null,
  orderId: string,
  usedOf: (itemId: string) => number,
): number | undefined {
  const approved = approvedQuoteQty(item, requestType, quotations, orderId);
  if (approved === undefined) return undefined;
  let othersUsed = 0;
  for (const request of requests) {
    if (request.serviceOrderId !== orderId || (request.requestType !== 'pre_repair' && request.requestType !== 'quotation')) continue;
    for (const other of request.items) if (other.id !== item.id && other.partCatalogId === item.partCatalogId) othersUsed += usedOf(other.id);
  }
  return Math.max(0, approved - othersUsed);
}
