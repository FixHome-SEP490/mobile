import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import { awaitingAutoStart } from './awaiting-auto-start';

const key = { userId: 't1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'o1' };
const snap = (status: string, quote: string | null, role: 'technician' | 'customer' = 'technician') => {
  const s = createOrderSessionSnapshot({ ...key, role });
  return { ...s, order: readyResource({ id: 'o1', status } as never, 1, 0),
    resources: { ...s.resources, quotations: quote ? readyResource([{ id: 'q1', serviceOrderId: 'o1', status: quote }] as never, 1, 0) : s.resources.quotations } };
};

describe('M-11 technician waits on site for the quotation decision', () => {
  it('re-reads only while EN_ROUTE with a sent or approved quote', () => {
    expect(awaitingAutoStart(snap('EN_ROUTE', 'APPROVED') as never)).toBe(true);
    expect(awaitingAutoStart(snap('UNDER_REPAIR', 'APPROVED') as never)).toBe(false);
    expect(awaitingAutoStart(snap('EN_ROUTE', 'SENT') as never)).toBe(true);
    expect(awaitingAutoStart(snap('EN_ROUTE', 'REJECTED') as never)).toBe(false);
    expect(awaitingAutoStart(snap('EN_ROUTE', null) as never)).toBe(false);
    expect(awaitingAutoStart(snap('EN_ROUTE', 'APPROVED', 'customer') as never)).toBe(false);
    expect(awaitingAutoStart(null)).toBe(false);
    const noOrderId = snap('EN_ROUTE', 'SENT');
    expect(awaitingAutoStart({ ...noOrderId, resources: { ...noOrderId.resources, quotations: { status: 'ready', data: [{ id: 'q1', status: 'SENT' }], requestSeq: 1, fetchedAt: 0 } } } as never)).toBe(true);
  });
});
