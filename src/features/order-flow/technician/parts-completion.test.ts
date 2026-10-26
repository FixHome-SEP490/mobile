import { ADDITIONAL_NOT_RECEIVED, ADDITIONAL_NOT_RECORDED, PARTS_MISMATCH, partsCompletionBlockers } from './parts-completion';
import type { OrderPartReadModel as PartRequest } from '../domain/order-session.types';

// BUG DETECTOR 12 and 14: the completion check counts what was really used and lets parts
// held from before the repair serve an approved additional cost, as the Backend does.
const line = (quantity: number) => ({ type: 'PARTS', partSource: 'fixhome', partCatalogId: 'valve', quantity });
const request = (type: string, quantity: number, extra: Record<string, unknown> = {}, usageStatus = 'used') => ({
  id: `${type}-req`, requestType: type, status: 'received', receivedAt: '2026-10-23T10:00:00Z', ...extra,
  items: [{ id: `${type}-item`, partSource: 'fixhome', partCatalogId: 'valve', quantity, usageStatus }],
}) as unknown as PartRequest;
const quote = (quantity: number) => ({ id: 'quote', items: [line(quantity), { type: 'LABOR', quantity: 1 }] });

describe('partsCompletionBlockers', () => {
  it('counts the quantity used, not the whole line, after a partial return (bug 12)', () => {
    expect(partsCompletionBlockers(quote(1), [], [request('pre_repair', 2)], new Map([['pre_repair-item', 1]]))).toEqual([]);
    // Without the ledger the whole line of 2 would count and block completion.
    expect(partsCompletionBlockers(quote(1), [], [request('pre_repair', 2)], new Map())).toEqual([PARTS_MISMATCH]);
  });

  it('lets parts held from before the repair serve an approved additional cost (bug 14)', () => {
    const cost = { id: 'cost', items: [line(1)] };
    expect(partsCompletionBlockers(quote(1), [cost], [request('pre_repair', 3)], new Map([['pre_repair-item', 2]]))).toEqual([]);
    expect(partsCompletionBlockers(quote(1), [cost], [request('pre_repair', 3)], new Map([['pre_repair-item', 3]]))).toEqual([PARTS_MISMATCH]);
  });

  it('asks for the QR handover of an additional cost still on its way, and for its usage once received', () => {
    const cost = { id: 'cost', items: [line(1)] };
    const own = (status: string, usage = 'used') => request('additional', 1, { additionalCostId: 'cost', status, receivedAt: status === 'received' ? '2026-10-23T11:00:00Z' : null }, usage);
    expect(partsCompletionBlockers(quote(1), [cost], [request('pre_repair', 1), own('ready')], new Map([['pre_repair-item', 1]]))).toEqual([ADDITIONAL_NOT_RECEIVED]);
    expect(partsCompletionBlockers(quote(1), [cost], [request('pre_repair', 1), own('received', 'pending')], new Map([['pre_repair-item', 1]]))).toEqual([ADDITIONAL_NOT_RECORDED]);
    expect(partsCompletionBlockers(quote(1), [cost], [request('pre_repair', 1), own('received')], new Map([['pre_repair-item', 1], ['additional-item', 1]]))).toEqual([]);
  });

  it('flags units that no approval covers', () => {
    expect(partsCompletionBlockers(quote(1), [], [request('pre_repair', 1)], new Map([['pre_repair-item', 1]]))).toEqual([]);
    expect(partsCompletionBlockers(null, [], [request('pre_repair', 1)], new Map([['pre_repair-item', 1]]))).toEqual([PARTS_MISMATCH]);
  });
});
