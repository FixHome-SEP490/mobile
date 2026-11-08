import { filterPartReturns, groupPartReturns } from './technician-part-returns';
import type { PartCustodyReturnRecord } from '../../api/part-requests.api';

const row = (o: Partial<PartCustodyReturnRecord>): PartCustodyReturnRecord => ({
  partRequestId: 'r', partRequestItemId: 'i', partNameSnapshot: 'Van', issuedQty: 3, usedQty: 1,
  declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 2, version: 1, orderId: 'aaaaaaaa-1', ...o,
});

test('groups owed lines by order, drops settled and order-less lines, undeclared then oldest first', () => {
  const groups = groupPartReturns([
    row({ orderId: 'bbbbbbbb-2', handedOverAt: '2026-11-02T00:00:00Z' }),
    row({ orderId: 'aaaaaaaa-1', declaredQty: 2, handedOverAt: '2026-11-01T00:00:00Z' }),
    row({ orderId: 'aaaaaaaa-1', partRequestItemId: 'j', declaredQty: 1, outstandingQty: 1, handedOverAt: '2026-11-03T00:00:00Z' }),
    row({ outstandingQty: 0 }),
    row({ orderId: undefined }),
  ]);
  expect(groups.map(g => [g.orderId, g.owedQty, g.rows.length, g.needsDeclare])).toEqual([['bbbbbbbb-2', 2, 1, true], ['aaaaaaaa-1', 3, 2, false]]);
  expect(groups[1].label).toBe('#AAAAAAAA');
  expect(groups[1].since).toBe('2026-11-01T00:00:00Z');
  expect(filterPartReturns(groups, 'declare').map(g => g.orderId)).toEqual(['bbbbbbbb-2']);
  expect(filterPartReturns(groups, 'waiting').map(g => g.orderId)).toEqual(['aaaaaaaa-1']);
  expect(filterPartReturns(groups, 'all')).toHaveLength(2);
});
