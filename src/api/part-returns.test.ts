import {
  canDeclareMoreQty, createIdempotencyKey, isPartReturnsUnavailableError, pendingDeclaredQty, type PartCustodyReturnRecord,
} from './part-requests.api';

const rec = (over: Partial<PartCustodyReturnRecord>): PartCustodyReturnRecord => ({
  partRequestId: 'r', partRequestItemId: 'i', partNameSnapshot: 'Block', issuedQty: 3, usedQty: 1,
  declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 2, version: 1, ...over,
});

describe('part returns', () => {
  it('lets the technician declare only what is owed and not yet declared', () => {
    expect(canDeclareMoreQty(rec({}))).toBe(2);
    expect(pendingDeclaredQty(rec({ declaredQty: 1 }))).toBe(1);
    expect(canDeclareMoreQty(rec({ declaredQty: 1 }))).toBe(1);
    expect(canDeclareMoreQty(rec({ declaredQty: 2 }))).toBe(0);
    expect(canDeclareMoreQty(rec({ declaredQty: 2, managerAcceptedQty: 2, outstandingQty: 0 }))).toBe(0);
  });

  it('hides the feature on 403/404/501/503 only, and keys match the backend pattern', () => {
    for (const status of [403, 404, 501, 503]) expect(isPartReturnsUnavailableError({ response: { status } })).toBe(true);
    expect(isPartReturnsUnavailableError({ response: { status: 500 } })).toBe(false);
    expect(createIdempotencyKey('declare')).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });
});
