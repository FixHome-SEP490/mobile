import { approvedUsageCap, heldParts } from './held-parts';

const item = (id: string, catalogId: string, quantity: number, usageStatus: 'pending' | 'used' | 'returned' = 'pending') =>
  ({ id, partCatalogId: catalogId, partNameSnapshot: `Part ${catalogId}`, quantity, usageStatus, partSource: 'fixhome' });
const request = (requestType: string, status: string, items: ReturnType<typeof item>[]) =>
  ({ serviceOrderId: 'o1', technicianId: 't1', requestType, status, items });
const quote = (status: string, parts: { catalogId: string; quantity: number }[]) => ({
  serviceOrderId: 'o1', status,
  items: parts.map(p => ({ type: 'PARTS' as const, description: 'p', quantity: p.quantity, unitPrice: 1, partSource: 'fixhome', partCatalogId: p.catalogId })),
}) as never;

describe('heldParts', () => {
  it('received 2, approved quote uses 1: 1 is left', () => {
    expect(heldParts([request('pre_repair', 'received', [item('i1', 'A', 2)])], [quote('APPROVED', [{ catalogId: 'A', quantity: 1 }])], 'o1', 't1'))
      .toEqual([{ key: 'A', name: 'Part A', quantity: 1 }]);
  });

  it('a quote that uses everything leaves nothing; an unapproved quote leaves everything', () => {
    const stock = [request('pre_repair', 'received', [item('i1', 'A', 2)])];
    expect(heldParts(stock, [quote('APPROVED', [{ catalogId: 'A', quantity: 2 }])], 'o1', 't1')).toEqual([]);
    expect(heldParts(stock, [quote('SENT', [{ catalogId: 'A', quantity: 2 }])], 'o1', 't1')).toEqual([{ key: 'A', name: 'Part A', quantity: 2 }]);
  });

  it('the shortage the quote caused is stock too: pre-repair 2 + quotation request 1, quote 3 -> 0', () => {
    const stock = [request('pre_repair', 'received', [item('i1', 'A', 2)]), request('quotation', 'received', [item('i2', 'A', 1)])];
    expect(heldParts(stock, [quote('APPROVED', [{ catalogId: 'A', quantity: 3 }])], 'o1', 't1')).toEqual([]);
  });

  it('ignores unreceived, returned, other-order and additional-cost lines; a used line is not taken twice', () => {
    const stock = [
      request('pre_repair', 'requested', [item('i1', 'A', 5)]),
      request('pre_repair', 'received', [item('i2', 'B', 1, 'returned'), item('i3', 'C', 2, 'used'), item('i4', 'C', 2)]),
      request('additional', 'received', [item('i5', 'D', 4)]),
      { ...request('pre_repair', 'received', [item('i6', 'E', 1)]), serviceOrderId: 'other' },
    ];
    expect(heldParts(stock, [quote('APPROVED', [{ catalogId: 'C', quantity: 2 }])], 'o1', 't1')).toEqual([{ key: 'C', name: 'Part C', quantity: 2 }]);
  });
});

describe('approvedUsageCap', () => {
  const stock = [request('pre_repair', 'received', [item('i1', 'A', 2)])];
  const used = (n: number) => () => n;
  it('caps the used quantity at what the approved quotation allows for that SKU', () => {
    expect(approvedUsageCap({ id: 'i1', partCatalogId: 'A' }, 'pre_repair', stock, [quote('APPROVED', [{ catalogId: 'A', quantity: 1 }])], 'o1', used(0))).toBe(1);
  });
  it('takes away what other lines of the same SKU already used', () => {
    const two = [request('pre_repair', 'received', [item('i1', 'A', 2)]), request('quotation', 'received', [item('i2', 'A', 1)])];
    expect(approvedUsageCap({ id: 'i1', partCatalogId: 'A' }, 'pre_repair', two, [quote('APPROVED', [{ catalogId: 'A', quantity: 2 }])], 'o1', id => (id === 'i2' ? 1 : 0))).toBe(1);
  });
  it('is unknown for additional-cost lines, SKUs without an id, and when quotations are not loaded', () => {
    const q = [quote('APPROVED', [{ catalogId: 'A', quantity: 1 }])];
    expect(approvedUsageCap({ id: 'i1', partCatalogId: 'A' }, 'additional', stock, q, 'o1', used(0))).toBeUndefined();
    expect(approvedUsageCap({ id: 'i1', partCatalogId: null }, 'pre_repair', stock, q, 'o1', used(0))).toBeUndefined();
    expect(approvedUsageCap({ id: 'i1', partCatalogId: 'A' }, 'pre_repair', stock, null, 'o1', used(0))).toBeUndefined();
  });
  it('is 0 when no quotation is approved for the SKU', () => {
    expect(approvedUsageCap({ id: 'i1', partCatalogId: 'B' }, 'pre_repair', stock, [quote('APPROVED', [{ catalogId: 'A', quantity: 1 }])], 'o1', used(0))).toBe(0);
  });
});
