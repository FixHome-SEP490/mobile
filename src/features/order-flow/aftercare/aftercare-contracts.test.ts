import { supportPayload, reviewPayload, claimPayload, responsePayload, warrantyCommandPayload, allowedSupportTypes, normalizeClaim, normalizeReview } from './aftercare-contracts';
const order = '11111111-1111-4111-8111-111111111111', coverage = '22222222-2222-4222-8222-222222222222';
it('support sends exact DTO with reason1 and rejects authority/context injection', () => {
  expect(supportPayload({ caseType: 'other', reason: ' a ', description: ' ', serviceOrderId: order }, [])).toEqual({ caseType: 'other', reason: 'a', serviceOrderId: order });
  expect(() => supportPayload({ caseType: 'other', reason: 'a', serviceOrderId: order, holdCompletion: true } as never, [])).toThrow();
});
it('P6 permits only actual existing authorized refs, never arbitrary URL/local capture', () => {
  expect(claimPayload({ warrantyCoverageId: coverage, description: 'Lỗi vẫn còn xuất hiện', evidenceRefs: ['existing-ref'] }, ['existing-ref']).evidenceRefs).toEqual(['existing-ref']);
  expect(() => claimPayload({ warrantyCoverageId: coverage, description: 'Lỗi vẫn còn xuất hiện', evidenceRefs: ['file://photo'] }, ['file://photo'])).toThrow();
  expect(() => supportPayload({ caseType: 'other', reason: 'a', serviceOrderId: order, evidenceRefs: ['https://invented.test/a'] }, [])).toThrow();
});
it('role/phase support table is explicit and system-only warranty dispute is excluded', () => {
  expect(allowedSupportTypes('customer', 'no_order')).toEqual(['matching_exhausted', 'other']);
  expect(allowedSupportTypes('technician', 'no_order')).toEqual([]);
  expect(allowedSupportTypes('technician', 'UNDER_REPAIR')).toContain('technician_replacement');
  expect(allowedSupportTypes('customer', 'UNDER_REPAIR')).not.toContain('technician_replacement');
  expect(allowedSupportTypes('customer', 'COMPLETED')).not.toContain('warranty_dispute');
});
it('review is optional nested rating/comment only; invalid bounds and redundant ID are rejected', () => {
  expect(reviewPayload({ rating: 1, comment: 'Ổn' })).toEqual({ rating: 1, comment: 'Ổn' });
  for (const rating of [0, 6, 1.5]) expect(() => reviewPayload({ rating })).toThrow();
  expect(() => reviewPayload({ rating: 5, serviceOrderId: order } as never)).toThrow();
});
it('warranty respond requires real dispute text and agree does not express closure', () => {
  expect(responsePayload({ decision: 'agree' })).toEqual({ decision: 'agree' });
  expect(() => responsePayload({ decision: 'dispute', note: 'ngắn' })).toThrow();
  expect(() => responsePayload({ decision: 'agree', note: 'ngắn' })).toThrow();
});
it('technician commands match actual phases DTO; check-in requires neither GPS nor face', () => {
  expect(warrantyCommandPayload('check-in', {}, [])).toEqual({});
  expect(() => warrantyCommandPayload('check-in', { accuracyMeters: 2 }, [])).toThrow();
  expect(() => warrantyCommandPayload('propose', { result: 'not_covered', findings: 'Kiểm tra lỗi thực tế', notCoveredReasonCode: 'other', evidenceRefs: [] }, [])).toThrow();
  expect(warrantyCommandPayload('propose', { result: 'not_covered', findings: 'Kiểm tra lỗi thực tế', notCoveredReasonCode: 'expired', evidenceRefs: ['existing-ref'] }, ['existing-ref'])).toMatchObject({ result: 'not_covered', evidenceRefs: ['existing-ref'] });
  expect(() => warrantyCommandPayload('decline', { reasonCode: 'other' }, [])).toThrow();
});
it('review and claim readmodels reject foreign IDs and drop private backend/staff fields', () => {
  expect(() => normalizeReview({ id: 'review', serviceOrderId: 'foreign', rating: 5 }, order, 'customer')).toThrow();
  const row = { id: order, serviceOrderId: order, warrantyCoverageId: coverage, status: 'awaiting_customer', description: 'Lỗi vẫn còn xuất hiện', evidenceRefs: null, submittedAfterExpiry: true, customerResponse: 'agreed', awaitingPrompt: 'completion', resolutionNotes: null, submittedAt: '2026-10-14T00:00:00Z', resolvedAt: null, technician: null, privateStaffField: 'PRIVATE' };
  expect(JSON.stringify(normalizeClaim(row, order))).not.toContain('PRIVATE');
  expect(normalizeClaim(row, order).status).toBe('awaiting_customer');
});
it('unknown warranty operation cannot fall through into proposal DTO validation', () => {
  expect(() => warrantyCommandPayload('staff-approve' as never, { result: 'covered_workmanship', findings: 'Kiểm tra lỗi thực tế' }, [])).toThrow();
});
