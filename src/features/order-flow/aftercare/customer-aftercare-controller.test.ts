import { createCustomerAftercareController } from './customer-aftercare-controller';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import { ids, m7Fixture, claimRow, deferred } from './m7-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup() {
  const f = m7Fixture();
  const transport = { getReview: jest.fn(async () => f.server.review), getCoverages: jest.fn(async () => f.server.coverages), getClaims: jest.fn(async () => f.server.claims),
    submitReview: jest.fn(async (_id: string, _dto: unknown) => { f.server.review = { id: ids.review, serviceOrderId: ids.order, customerId: ids.customer, rating: 5, comment: null, createdAt: '2026-10-14T00:00:00Z' }; return f.server.review; }),
    createClaim: jest.fn(async (_id: string, _dto: unknown) => { const claim = claimRow(); f.server.claims.push(claim); return claim; }),
    respondClaim: jest.fn(async (_order: string, _claim: string, dto: { decision: 'agree' | 'dispute' }) => { const row = f.server.claims[0] as ReturnType<typeof claimRow>; row.customerResponse = dto.decision === 'agree' ? 'agreed' : 'disputed'; if (dto.decision === 'dispute') row.status = 'disputed'; return row; }) };
  const deps = { ...f.runtime, transport }; return { ...f, transport, deps, c: createCustomerAftercareController(deps) };
}
it('optional completed review uses nested DTO and one review per order, without delaying warranty/payment/order', async () => {
  const f = setup(); await f.c.prepareReview({ rating: 5 }); await Promise.all([f.c.submitConfirmation(), f.c.submitConfirmation()]);
  expect(f.transport.submitReview).toHaveBeenCalledWith(ids.order, { rating: 5 }); expect(f.c.getState().phase).toBe('resolved');
  await f.c.prepareReview({ rating: 5 }); await f.c.submitConfirmation(); expect(f.transport.submitReview).toHaveBeenCalledTimes(1); expect(f.server.order.status).toBe('COMPLETED');
  expect(f.transport.getCoverages).not.toHaveBeenCalled(); expect(f.transport.getClaims).not.toHaveBeenCalled();
});
it('review lost response stays locked until the unique owned order review is GET-confirmed, never replayed', async () => {
  const f = setup(); f.transport.submitReview.mockRejectedValue(Error('timeout')); await f.c.prepareReview({ rating: 4 }); await f.c.submitConfirmation();
  const journal = createOrderCommandJournal(f.storage), c = createCustomerAftercareController({ ...f.deps, journal }); await c.verify(); await c.prepareReview({ rating: 4 }); await c.submitConfirmation(); expect(f.transport.submitReview).toHaveBeenCalledTimes(1);
  f.server.review = { id: ids.review, serviceOrderId: ids.order, customerId: ids.customer, rating: 4, comment: null, createdAt: '2026-10-14T00:00:00Z' }; await c.verify(); expect(c.getState().phase).toBe('resolved');
});
it('expired coverage permits submission, voided/active conflict/wrong role do not', async () => {
  const f = setup(); await f.c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); await f.c.submitConfirmation();
  expect(f.transport.createClaim).toHaveBeenCalledWith(ids.order, { warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); expect(f.c.getState().claims.status).toBe('ready');
  await f.c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); await f.c.submitConfirmation(); expect(f.transport.createClaim).toHaveBeenCalledTimes(1);
  f.server.claims = []; f.server.coverages[0].status = 'voided'; await f.c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); await f.c.submitConfirmation(); expect(f.transport.createClaim).toHaveBeenCalledTimes(1);
});
it('lost claim ID cannot be guessed from another same-coverage claim; P6 unknown refs cannot send', async () => {
  const f = setup(); f.transport.createClaim.mockImplementation(async () => { f.server.claims.push(claimRow()); throw Error('timeout'); });
  await f.c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); await f.c.submitConfirmation(); await f.c.verify(); expect(f.c.getState().phase).toBe('unknown');
  const other = setup(); await other.c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện', evidenceRefs: ['https://new-public.test/a'] }); await other.c.submitConfirmation(); expect(other.transport.createClaim).not.toHaveBeenCalled();
});
it.each(['agree', 'dispute'] as const)('Customer %s reads exact claim response and never closes original order/claim', async decision => {
  const f = setup(), row = claimRow(); row.status = 'awaiting_customer'; row.awaitingPrompt = 'completion'; f.server.claims = [row];
  await f.c.prepareResponse(ids.claim, { decision, ...(decision === 'dispute' ? { note: 'Vẫn xuất hiện lỗi cũ' } : {}) }); await f.c.submitConfirmation();
  expect(f.c.getState().phase).toBe('resolved'); expect(row.status).toBe(decision === 'agree' ? 'awaiting_customer' : 'disputed'); expect(f.server.order.status).toBe('COMPLETED');
  await f.c.prepareResponse(ids.claim, { decision, note: 'Vẫn xuất hiện lỗi cũ' }); await f.c.submitConfirmation(); expect(f.transport.respondClaim).toHaveBeenCalledTimes(1);
});
it.each(['cancel', 'renew', 'phase'])('review target %s changes while storage awaits, no POST', async action => {
  const f = setup(); await f.c.prepareReview({ rating: 5 }); const gate = deferred<void>(); f.storageGate(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
  if (action === 'cancel') f.c.cancelConfirmation(); if (action === 'renew') f.renew();
  if (action === 'phase') f.coordinator.getSnapshot()!.order = { status: 'ready', requestSeq: 2, fetchedAt: 1, data: { ...f.server.order, status: 'UNDER_REPAIR' } as never };
  gate.resolve(); await pending; expect(f.transport.submitReview).not.toHaveBeenCalled();
});
it('403 purges all M7 private resources and prevents the next private GET; foreign operations are untouched', async () => {
  const f = setup(); f.transport.getCoverages.mockRejectedValue({ response: { status: 403 } }); await f.c.loadWarranty();
  expect(f.c.getState().claims.status).not.toBe('ready'); expect(f.transport.getClaims).not.toHaveBeenCalled(); expect(f.coordinator.getSnapshot()).toBeNull();
  const other = setup(); await other.journal.restore(); await other.journal.begin(other.key, { intentId: 'foreign', entityId: 'invoice', operation: 'wallet-pay' }); await other.c.verify(); expect(other.reads).toEqual([]);
});
it('local intent allocator failure releases busy without POST/marker and permits explicit confirmed retry', async () => {
  const f = setup(), allocate = jest.fn().mockImplementationOnce(() => { throw Error('allocator unavailable'); }).mockReturnValue('retry-review');
  const c = createCustomerAftercareController({ ...f.deps, newIntentId: allocate }); await c.prepareReview({ rating: 5 });
  await expect(c.submitConfirmation()).resolves.toBeUndefined(); expect(f.transport.submitReview).not.toHaveBeenCalled(); expect(f.journal.list(ids.customer)).toEqual([]);
  await c.prepareReview({ rating: 5 }); await c.submitConfirmation(); expect(f.transport.submitReview).toHaveBeenCalledTimes(1);
});
it('original order permission revocation clears warranty cache without requiring a confirmation', async () => {
  const f = setup(); f.server.claims = [claimRow()]; await f.c.loadWarranty(); expect(f.c.getState().claims.status).toBe('ready');
  f.coordinator.invalidate(); f.c.revalidateConfirmation(); expect(f.c.getState().claims.status).toBe('unloaded'); expect(f.c.authorizedEvidenceRefs()).toEqual([]);
});
it('ineligible phase and foreign role reject review/warranty; eligible pending coverage may submit an expired-safe claim', async () => {
  const f = setup(); f.server.order.status = 'UNDER_REPAIR'; await f.c.prepareReview({ rating: 5 }); await f.c.submitConfirmation(); expect(f.transport.submitReview).not.toHaveBeenCalled();
  const tech = m7Fixture('technician'), c = createCustomerAftercareController({ ...tech.runtime, transport: f.transport }); await c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); await c.submitConfirmation(); expect(f.transport.createClaim).not.toHaveBeenCalled();
  f.server.order.status = 'COMPLETED'; f.server.coverages[0].status = 'pending'; await f.c.prepareClaim({ warrantyCoverageId: ids.coverage, description: 'Lỗi vẫn còn xuất hiện' }); expect(f.c.canClaim(ids.coverage)).toBe(true); await f.c.submitConfirmation(); expect(f.transport.createClaim).toHaveBeenCalledTimes(1);
});
