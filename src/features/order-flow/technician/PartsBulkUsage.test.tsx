import { bulkChanges } from './PartsBulkUsage';

const rec = (usedQty: number, usageRecorded: boolean) => ({ issuedQty: 3, usedQty, usageRecorded, version: 1 }) as any;

describe('bulkChanges', () => {
  it('keeps every changed open editor and skips untouched or unrecorded-zero ones', () => {
    const records: Record<string, any> = { a: rec(0, false), b: rec(0, false), c: rec(1, true), d: rec(1, true) };
    const changes = bulkChanges({ a: 2, b: 0, c: 1, d: 3 }, id => ({ requestId: 'r', record: records[id] }));
    expect(changes.map(c => [c.itemId, c.quantity])).toEqual([['a', 2], ['d', 3]]);
  });
});
