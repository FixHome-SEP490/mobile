import {
  canDeclareMoreQty, createIdempotencyKey, isPartReturnsUnavailableError, partReturnStatusText, pendingDeclaredQty, usedQtyRange, type PartCustodyReturnRecord,
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

  it('names each tracked return status and stays silent when nothing needs saying', () => {
    expect(partReturnStatusText('declared')?.tone).toBe('warning');
    expect(partReturnStatusText('partially_received')?.text).toContain('một phần');
    expect(partReturnStatusText('exception')?.text).toContain('lệch');
    expect(partReturnStatusText('received')).toEqual({ text: 'Đã nhận', tone: 'success' });
    expect(partReturnStatusText('outstanding')).toBeNull();
    expect(partReturnStatusText('not_required')).toBeNull();
    expect(partReturnStatusText(undefined)).toBeNull();
  });
});

describe('usedQtyRange', () => {
  const base = { partRequestId: 'r', partRequestItemId: 'i', partNameSnapshot: 'P', issuedQty: 3, usedQty: 1, declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 2, version: 1 };
  it('may go back to 0 and up to what the manager has not accepted back', () => {
    expect(usedQtyRange(base)).toEqual({ min: 0, max: 3 });
    expect(usedQtyRange({ ...base, managerAcceptedQty: 1 })).toEqual({ min: 0, max: 2 });
    expect(usedQtyRange({ ...base, usedQty: 3, managerAcceptedQty: 1 })).toEqual({ min: 0, max: 3 });
  });
});
