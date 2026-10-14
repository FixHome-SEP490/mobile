import type { WarrantyClaimView, WarrantyCoverageItem } from '../../../api/orders.api';
import { sameOrderSession, type OrderSessionKey, type Resource } from '../domain/order-session.types';
import type { OrderCommandJournal, OrderCommandMarker } from '../runtime/order-command-journal';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { FINANCIAL_UNKNOWN, m6Order, type M6Phase } from '../customer/payment-facts';
import { claimPayload, deniedRead, normalizeClaim, normalizeCoverage, normalizeReview, record, responsePayload, reviewPayload, uuid4,
  type AftercareReview, type ClaimDto, type ResponseDto, type ReviewDto } from './aftercare-contracts';
export interface CustomerAftercareTransport {
  getReview: (id: string) => Promise<unknown>; getCoverages: (id: string) => Promise<unknown>; getClaims: (id: string) => Promise<unknown>;
  submitReview: (id: string, dto: ReviewDto) => Promise<unknown>; createClaim: (id: string, dto: ClaimDto) => Promise<unknown>;
  respondClaim: (orderId: string, claimId: string, dto: ResponseDto) => Promise<unknown>;
}
export interface CustomerAftercareDependencies {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal; transport: CustomerAftercareTransport;
  getKey: () => OrderSessionKey | null; isActive: () => boolean; newIntentId: () => string;
}
type Confirmation = { key: OrderSessionKey; signature: string } & ({ operation: 'review-create'; entityId: string; dto: ReviewDto }
  | { operation: 'warranty-create'; entityId: string; dto: ClaimDto } | { operation: 'warranty-respond-agree' | 'warranty-respond-dispute'; entityId: string; dto: ResponseDto });
export interface CustomerAftercareState { phase: M6Phase; confirmation: Confirmation | null; message: string | null;
  review: Resource<AftercareReview | null>; coverages: Resource<WarrantyCoverageItem[]>; claims: Resource<WarrantyClaimView[]> }
const operations = ['review-create', 'warranty-create', 'warranty-respond-agree', 'warranty-respond-dispute'];
export function createCustomerAftercareController(deps: CustomerAftercareDependencies) {
  let seq = 0, epoch = 0, busy = false, presentationKey: OrderSessionKey | null = null;
  const empty = (): CustomerAftercareState => ({ phase: 'idle', confirmation: null, message: null, review: { status: 'unloaded', requestSeq: seq }, coverages: { status: 'unloaded', requestSeq: seq }, claims: { status: 'unloaded', requestSeq: seq } });
  let state = empty(); const listeners = new Set<() => void>();
  const publish = (patch: Partial<CustomerAftercareState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const same = (key: OrderSessionKey) => deps.isActive() && key.role === 'customer' && sameOrderSession(deps.getKey(), key) && sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);
  const owned = (key: OrderSessionKey) => same(key) && !!m6Order(deps.coordinator.getSnapshot(), key);
  function purge() { epoch++; seq++; presentationKey = null; state = empty(); publish({ phase: 'denied', message: 'Bạn không còn quyền xem nội dung này.' }); }
  const completed = (key: OrderSessionKey) => owned(key) && m6Order(deps.coordinator.getSnapshot(), key)?.status === 'COMPLETED';
  const markers = (key: OrderSessionKey) => deps.journal.list(key.userId).filter(m => m.role === 'customer' && m.serviceOrderId === key.serviceOrderId && operations.includes(m.operation) && !['resolved', 'failed-known'].includes(m.status));
  const refs = () => {
    const key = deps.getKey(), s = deps.coordinator.getSnapshot();
    if (!key || !owned(key)) return [];
    return [...(s?.resources.evidence.status === 'ready' ? s.resources.evidence.data.filter(e => e.type !== 'CHECKIN_FACE' && e.serviceOrderId === key.serviceOrderId).map(e => e.mediaUrl) : []),
      ...(state.claims.status === 'ready' ? state.claims.data.flatMap(c => c.evidenceRefs ?? []) : [])];
  };
  async function read(key: OrderSessionKey, kind: 'review' | 'coverages' | 'claims') {
    if (!owned(key)) return; const generation = epoch, requestSeq = ++seq; publish({ [kind]: { status: 'loading', requestSeq } });
    try {
      const raw = await (kind === 'review' ? deps.transport.getReview : kind === 'coverages' ? deps.transport.getCoverages : deps.transport.getClaims)(key.serviceOrderId);
      if (!owned(key) || generation !== epoch) return;
      const data = kind === 'review' ? normalizeReview(raw, key.serviceOrderId, key.userId) : (() => {
        if (!Array.isArray(raw)) throw Error('Danh sách chưa xác định.');
        const result = kind === 'coverages' ? raw.map(r => normalizeCoverage(r, key.serviceOrderId)) : raw.map(r => normalizeClaim(r, key.serviceOrderId));
        if (new Set(result.map(r => r.id)).size !== result.length) throw Error('Danh sách chưa xác định.'); return result;
      })();
      presentationKey = { ...key }; publish({ [kind]: { status: 'ready', data, requestSeq, fetchedAt: Date.now() } });
    } catch (error) {
      if (!same(key) || generation !== epoch) return;
      if (deniedRead(error)) { deps.coordinator.invalidate(); purge(); }
      else publish({ [kind]: { status: 'error', error: 'unavailable', requestSeq } });
    }
  }
  async function refresh(key: OrderSessionKey, kind: 'review' | 'warranty' | 'claims') {
    await deps.coordinator.refreshOrderSession(key, 'aftercare-readback'); if (!owned(key)) { if (same(key)) purge(); return; }
    if (kind === 'warranty') { await read(key, 'coverages'); if (owned(key)) await read(key, 'claims'); }
    else await read(key, kind);
  }
  function signature(key: OrderSessionKey, operation: Confirmation['operation'], id: string): string | null {
    if (!completed(key)) return null;
    if (operation === 'review-create') return state.review.status === 'ready' && state.review.data === null ? 'owned-completed-unreviewed' : null;
    if (state.claims.status !== 'ready') return null;
    if (operation === 'warranty-create') {
      if (state.coverages.status !== 'ready') return null;
      const coverage = state.coverages.data.find(c => c.id === id);
      if (!coverage || coverage.status === 'voided' || state.claims.data.some(c => c.warrantyCoverageId === id && !['resolved', 'rejected'].includes(c.status))) return null;
      return JSON.stringify(coverage);
    }
    const claim = state.claims.data.find(c => c.id === id);
    return claim?.status === 'awaiting_customer' && claim.customerResponse === null ? JSON.stringify(claim) : null;
  }
  function matches(t: Confirmation) { return signature(t.key, t.operation, t.entityId) === t.signature && (!('evidenceRefs' in t.dto) || !t.dto.evidenceRefs?.some(r => !refs().includes(r))); }
  function verdict(key: OrderSessionKey, m: OrderCommandMarker): CommandReadbackVerdict {
    if (!owned(key)) return 'unresolved';
    if (m.operation === 'review-create') return state.review.status === 'ready' && state.review.data
      && (!m.resultEntityId || state.review.data.id === m.resultEntityId) ? 'resolved' : 'unresolved';
    if (state.claims.status !== 'ready') return 'unresolved';
    if (m.operation === 'warranty-create') return m.resultEntityId && state.claims.data.some(c => c.id === m.resultEntityId && c.warrantyCoverageId === m.entityId) ? 'resolved' : 'unresolved';
    const claim = state.claims.data.find(c => c.id === m.entityId);
    return claim?.customerResponse === (m.operation === 'warranty-respond-agree' ? 'agreed' : 'disputed') ? 'resolved' : 'unresolved';
  }
  function finish(key: OrderSessionKey, marker?: OrderCommandMarker) {
    if (!same(key)) return;
    const phase = marker?.status === 'resolved' ? 'resolved' : marker?.status === 'failed-known' ? 'failed-known' : 'unknown';
    publish({ phase, confirmation: null, message: phase === 'unknown' ? FINANCIAL_UNKNOWN : null });
  }
  async function prepare(operation: Confirmation['operation'], id: string, input: unknown) {
    const key = deps.getKey(); if (!key || !same(key) || busy) return;
    busy = true; const generation = ++epoch; publish({ phase: 'verifying', confirmation: null });
    try {
      await deps.journal.restore(); if (!same(key) || generation !== epoch) return;
      if (deps.journal.hasUnresolved(key)) { finish(key, markers(key)[0]); return; }
      await refresh(key, operation === 'review-create' ? 'review' : operation === 'warranty-create' ? 'warranty' : 'claims');
      if (!owned(key) || generation !== epoch) return;
      const sig = signature(key, operation, id); if (!sig) { publish({ phase: 'denied', message: 'Điều kiện hiện tại chưa cho phép gửi nội dung này.' }); return; }
      const dto = operation === 'review-create' ? reviewPayload(input) : operation === 'warranty-create' ? claimPayload(input, refs()) : responsePayload(input);
      if ('evidenceRefs' in dto && dto.evidenceRefs) Object.freeze(dto.evidenceRefs);
      publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ key: Object.freeze({ ...key }), operation, entityId: id, signature: sig, dto: Object.freeze(dto) }) as Confirmation });
    } catch { if (same(key)) publish({ phase: 'denied', confirmation: null, message: 'Hãy kiểm tra dữ liệu và nội dung trước khi xác nhận.' }); }
    finally { busy = false; }
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    prepareReview: (dto: ReviewDto) => { const key = deps.getKey(); return key ? prepare('review-create', key.serviceOrderId, dto) : Promise.resolve(); },
    prepareClaim: (dto: ClaimDto) => prepare('warranty-create', dto.warrantyCoverageId, dto),
    prepareResponse: (id: string, dto: ResponseDto) => prepare(dto.decision === 'agree' ? 'warranty-respond-agree' : 'warranty-respond-dispute', id, dto),
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    invalidatePresentation: purge,
    revalidateConfirmation() {
      const key = deps.getKey(), s = deps.coordinator.getSnapshot();
      if (!key || key.role !== 'customer' || !s || !sameOrderSession(s.key, key) || ['historical', 'revoked'].includes(s.access)
        || (presentationKey && !sameOrderSession(key, presentationKey))) { purge(); return; }
      if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); }
    },
    async loadReview() { const key = deps.getKey(); if (key && same(key) && !busy) { busy = true; try { await refresh(key, 'review'); } finally { busy = false; } } },
    async loadWarranty() { const key = deps.getKey(); if (key && same(key) && !busy) { busy = true; try { await refresh(key, 'warranty'); } finally { busy = false; } } },
    async restoredMarkers() { const key = deps.getKey(); if (!key || !same(key)) return []; await deps.journal.restore(); return same(key) ? markers(key) : []; },
    async submitConfirmation() {
      const t = state.confirmation; if (!t || busy || state.phase !== 'confirming' || !matches(t)) return;
      busy = true; let sent = false, intentId: string | null = null; const key = t.key; publish({ phase: 'submitting' });
      try {
        intentId = deps.newIntentId(); const allocatedId = intentId;
        const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: owned, refresh: k => refresh(k, t.operation === 'review-create' ? 'review' : 'claims') });
        await adapter.dispatch(key, { intentId, operation: t.operation, entityId: t.entityId }, async () => {
          if (state.confirmation !== t || !matches(t)) return;
          sent = true; publish({ confirmation: null });
          const result = t.operation === 'review-create' ? await deps.transport.submitReview(key.serviceOrderId, t.dto) : t.operation === 'warranty-create'
            ? await deps.transport.createClaim(key.serviceOrderId, t.dto) : await deps.transport.respondClaim(key.serviceOrderId, t.entityId, t.dto);
          const id = record(result).id; if (uuid4(id)) await deps.journal.recordEntity(key.userId, allocatedId, id);
        }, () => sent ? verdict(key, deps.journal.list(key.userId).find(m => m.intentId === allocatedId)!) : 'failed-known');
        if (!sent) { const m = deps.journal.list(key.userId).find(m => m.intentId === intentId); if (m) await deps.journal.mark(key.userId, intentId, 'failed-known'); }
        finish(key, deps.journal.list(key.userId).find(m => m.intentId === intentId));
      } catch { if (same(key)) publish({ phase: intentId ? 'unknown' : 'failed-known', confirmation: null, message: intentId ? FINANCIAL_UNKNOWN : 'Chưa gửi được nội dung. Hãy xác nhận lại để tiếp tục.' }); }
      finally { busy = false; }
    },
    async verify() {
      const key = deps.getKey(); if (!key || !same(key) || busy) return;
      busy = true; publish({ phase: 'verifying', confirmation: null });
      try {
        await deps.journal.restore(); if (!same(key)) return; const pending = markers(key);
        if (!pending.length) { publish({ phase: deps.journal.hasUnresolved(key) ? 'unknown' : 'idle' }); return; }
        await deps.coordinator.refreshOrderSession(key, 'aftercare-recovery'); if (!owned(key)) return;
        if (pending.some(m => m.operation === 'review-create')) await read(key, 'review');
        if (owned(key) && pending.some(m => m.operation !== 'review-create')) await read(key, 'claims');
        const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: owned, refresh: async () => {} });
        for (const m of pending) await adapter.verify(key, m.intentId, () => verdict(key, m));
        finish(key, deps.journal.list(key.userId).find(m => m.intentId === pending[0].intentId));
      } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    authorizedEvidenceRefs: refs,
    canSubmitReview() { const key = deps.getKey(); return !!key && !busy && !deps.journal.hasUnresolved(key) && !!signature(key, 'review-create', key.serviceOrderId); },
    canClaim(id: string) { const key = deps.getKey(); return !!key && !busy && !deps.journal.hasUnresolved(key) && !!signature(key, 'warranty-create', id); },
    canRespond(id: string) { const key = deps.getKey(); return !!key && !busy && !deps.journal.hasUnresolved(key) && !!signature(key, 'warranty-respond-agree', id); },
  };
}
export type CustomerAftercareController = ReturnType<typeof createCustomerAftercareController>;
