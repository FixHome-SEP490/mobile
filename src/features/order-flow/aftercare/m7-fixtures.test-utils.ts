import { createOrderReadCoordinator } from '../runtime/order-read-coordinator';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import { createEntryAttemptJournal } from '../runtime/entry-attempt-journal';
import type { OrderRole, OrderSessionKey } from '../domain/order-session.types';
import type { WarrantyClaimView } from '../../../api/orders.api';
import type { TechnicianWarrantyClaim, WarrantyVisit } from '../../../api/technician-warranty.api';
import type { MySupportCase } from '../../../api/support-cases.api';
export const ids = { order: '11111111-1111-4111-8111-111111111111', coverage: '22222222-2222-4222-8222-222222222222', claim: '33333333-3333-4333-8333-333333333333', visit: '44444444-4444-4444-8444-444444444444', case: '55555555-5555-4555-8555-555555555555', booking: '66666666-6666-4666-8666-666666666666', review: '77777777-7777-4777-8777-777777777777', tech: '88888888-8888-4888-8888-888888888888', customer: '99999999-9999-4999-8999-999999999999' };
export const claimRow = (): WarrantyClaimView => ({ id: ids.claim, serviceOrderId: ids.order, warrantyCoverageId: ids.coverage, status: 'submitted', description: 'Lỗi vẫn còn xuất hiện', evidenceRefs: ['existing-ref'], submittedAfterExpiry: true, customerResponse: null, awaitingPrompt: null, resolutionNotes: null, submittedAt: '2026-10-14T00:00:00Z', resolvedAt: null, technician: { id: ids.tech, fullName: 'Kỹ thuật viên mẫu' } });
export const caseRow = (): MySupportCase => ({ id: ids.case, caseType: 'other', status: 'open', bookingId: null, serviceOrderId: ids.order, reason: 'Lỗi thực tế', description: null, resolutionReason: null, evidenceRefs: null, isUrgent: false, respondBy: null, resolvedAt: null, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' });
export const visitRow = (): WarrantyVisit => ({ id: ids.visit, status: 'scheduled', scheduledAt: null, checkedInAt: null, proposedResult: null, notCoveredReasonCode: null, findings: null, evidenceRefs: null, reServiceNotes: null, reServiceEvidenceRefs: null, completedAt: null });
export const assignedClaim = (): TechnicianWarrantyClaim => ({ ...claimRow(), order: { id: ids.order, code: 'FH-SAMPLE', serviceName: 'Dịch vụ mẫu', addressSummary: 'Địa chỉ mẫu', customerName: 'Khách hàng mẫu', customerPhone: 'SAMPLE' }, coverage: { id: ids.coverage, itemDescription: 'Công sửa', expiresAt: '2026-10-13T00:00:00Z' }, visit: null });
export function m7Fixture(role: OrderRole = 'customer') {
  const key: OrderSessionKey = { role, userId: ids[role === 'customer' ? 'customer' : 'tech'], sessionGeneration: 1, serviceOrderId: ids.order };
  let owner: OrderSessionKey | null = key, active = true, gate: (() => Promise<void>) | undefined;
  const disk = new Map<string, string>(), storage = { getItem: async (k: string) => disk.get(k) ?? null, setItem: async (k: string, v: string) => { await gate?.(); disk.set(k, v); } };
  const journal = createOrderCommandJournal(storage), entry = createEntryAttemptJournal(storage), reads: string[] = [];
  const server = { order: { id: ids.order, code: 'FH-SAMPLE', bookingId: ids.booking, status: 'COMPLETED', completedAt: '2026-10-14T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', technician: { id: ids.tech }, arrivalVerified: false, historical: false },
    review: null as unknown, claims: [] as unknown[], coverages: [{ id: ids.coverage, serviceOrderId: ids.order, warrantyDaysSnapshot: 7, startsAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-08T00:00:00Z', status: 'expired' }], failRead: false };
  const coordinator = createOrderReadCoordinator({ readOrder: async () => { reads.push('order'); if (server.failRead) throw Error('offline'); return server.order; }, readResource: async (_, k) => { reads.push(k); return []; } }); coordinator.activate(key);
  let sequence = 0;
  return { key, server, journal, entry, disk, storage, coordinator, reads, runtime: { journal, coordinator, getKey: () => owner, isActive: () => active, newIntentId: () => `m7-${++sequence}` },
    renew: () => { owner = { ...key, sessionGeneration: 2 }; }, revoke: () => { owner = null; }, blur: () => { active = false; }, storageGate: (f: () => Promise<void>) => { gate = f; } };
}
export function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
