// What still stands between the technician and "Hoàn thành" on the parts side; the same check the Backend
// makes when the invoice is made (web `utils/parts-completion.ts`). The Backend stays the authority.
import type { OrderPartReadModel } from '../domain/order-session.types';

interface CostLine {
  type: string;
  description?: string;
  quantity: number;
  partSource?: string | null;
  partCatalogId?: string | null;
}

export const PARTS_MISMATCH = 'Lượng linh kiện FixHome đã nhận và ghi nhận dùng hoặc hoàn trả chưa khớp báo giá.';
export const ADDITIONAL_NOT_RECEIVED = 'Linh kiện FixHome theo chi phí phát sinh cần được nhận bằng QR.';
export const ADDITIONAL_NOT_RECORDED = 'Ghi nhận đã dùng hoặc hoàn trả linh kiện FixHome theo chi phí phát sinh.';

const isFixHomePart = (line: CostLine) => String(line.type).toUpperCase() !== 'LABOR' && line.partSource === 'fixhome';
const add = (map: Map<string, number>, key: string, quantity: number) => map.set(key, (map.get(key) ?? 0) + quantity);

/**
 * Used quantities come from the custody ledger, so a line of 2 used 1 and returned 1 counts 1. Each approval keeps its
 * own quantity, and units delivered for the quotation beyond its approval may serve an approved additional cost that
 * has no units of its own.
 */
function analyze(
  quote: { id: string; items: CostLine[] } | null,
  approvedCosts: { id: string; items: CostLine[] }[],
  requests: OrderPartReadModel[],
  usedByItem: ReadonlyMap<string, number>,
): { blockers: string[]; details: string[] } {
  const blockers: string[] = [];
  const details: string[] = [];
  const names = new Map<string, string>();
  for (const line of quote?.items ?? []) if (line.partCatalogId && line.description) names.set(line.partCatalogId, line.description);
  for (const request of requests) for (const item of request.items) if (item.partCatalogId && item.partNameSnapshot && !names.has(item.partCatalogId)) names.set(item.partCatalogId, item.partNameSnapshot);
  const nameOf = (part: string) => names.get(part) ?? 'Linh kiện';
  const settled = (request: OrderPartReadModel) => request.status === 'received' || request.status === 'completed';
  const approvedBase = new Map<string, number>();
  let unmatched = false;
  for (const line of (quote?.items ?? []).filter(isFixHomePart)) {
    if (!line.partCatalogId || !Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      unmatched = true;
      details.push(`${line.description || 'Một dòng linh kiện'}: thiếu mã hoặc số lượng không hợp lệ`);
    }
    else add(approvedBase, line.partCatalogId, line.quantity);
  }

  const tally = (rows: OrderPartReadModel[]) => {
    const resolved = new Map<string, number>();
    const used = new Map<string, number>();
    for (const request of rows.filter(settled)) {
      for (const item of request.items) {
        if (item.partSource !== 'fixhome' || !item.partCatalogId || (item.usageStatus !== 'used' && item.usageStatus !== 'returned')) continue;
        add(resolved, item.partCatalogId, item.quantity);
        if (item.usageStatus === 'used') add(used, item.partCatalogId, usedByItem.get(item.id) ?? item.quantity);
      }
    }
    return { resolved, used };
  };

  const base = tally(requests.filter((request) => request.requestType === 'pre_repair'
    || (!!quote && request.requestType === 'quotation' && request.quotationId === quote.id && !request.additionalCostId)));

  // What approved additional costs lack from their own requests, per part: the quotation's surplus covers it.
  const resolvedNeed = new Map<string, number>();
  const usedRoom = new Map<string, number>();
  for (const cost of approvedCosts) {
    const lines = cost.items.filter(isFixHomePart);
    if (!lines.length) continue;
    const approved = new Map<string, number>();
    for (const line of lines) if (line.partCatalogId) add(approved, line.partCatalogId, line.quantity);
    const own = requests.filter((request) => request.requestType === 'additional' && request.additionalCostId === cost.id && request.status !== 'cancelled');
    if (own.length) {
      if (own.some((request) => !settled(request) || !request.receivedAt)) { blockers.push(ADDITIONAL_NOT_RECEIVED); continue; }
      if (own.some((request) => request.items.some((item) => item.partSource === 'fixhome' && item.usageStatus !== 'used' && item.usageStatus !== 'returned'))) {
        blockers.push(ADDITIONAL_NOT_RECORDED);
        continue;
      }
    }
    const mine = tally(own);
    for (const [part, quantity] of approved) {
      if ((mine.used.get(part) ?? 0) > quantity) {
        unmatched = true;
        details.push(`${nameOf(part)}: dùng ${mine.used.get(part)}, chi phí phát sinh chỉ duyệt ${quantity}`);
      }
      add(resolvedNeed, part, Math.max(0, quantity - (mine.resolved.get(part) ?? 0)));
      add(usedRoom, part, Math.max(0, quantity - (mine.used.get(part) ?? 0)));
    }
  }

  for (const part of new Set([...approvedBase.keys(), ...resolvedNeed.keys(), ...base.used.keys()])) {
    const approved = approvedBase.get(part) ?? 0;
    const need = approved + (resolvedNeed.get(part) ?? 0);
    if ((base.resolved.get(part) ?? 0) < need) {
      unmatched = true;
      details.push(`${nameOf(part)}: báo giá ${need}, đã xử lý ${base.resolved.get(part) ?? 0}`);
    }
    const room = approved + (usedRoom.get(part) ?? 0);
    if ((base.used.get(part) ?? 0) > room) {
      unmatched = true;
      details.push(`${nameOf(part)}: dùng ${base.used.get(part)}, báo giá chỉ cho ${room}`);
    }
  }
  if (unmatched) blockers.push(PARTS_MISMATCH);
  return { blockers: [...new Set(blockers)], details: [...new Set(details)] };
}

export const partsCompletionBlockers: (...args: Parameters<typeof analyze>) => string[] = (...args) => analyze(...args).blockers;

/** Which part and by how much, when the blockers include PARTS_MISMATCH. */
export const partsMismatchDetails: (...args: Parameters<typeof analyze>) => string[] = (...args) => analyze(...args).details;
