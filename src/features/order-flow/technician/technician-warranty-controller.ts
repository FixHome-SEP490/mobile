import { normalizeTechnicianWarrantyClaim, type TechnicianWarrantyClaim, type WarrantyMinePage, type WarrantyMineQuery } from '../../../api/technician-warranty.api';
import type { EntryAttempt, EntryAttemptJournal } from '../runtime/entry-attempt-journal';
import type { Resource } from '../domain/order-session.types';
import { FINANCIAL_UNKNOWN, type M6Phase } from '../customer/payment-facts';
import { deniedRead, uuid4, warrantyCommandPayload, type WarrantyCommand, type WarrantyCommandDto } from '../aftercare/aftercare-contracts';
import type { AftercareOwner } from '../aftercare/support-controller';
export interface TechnicianWarrantyDependencies {
  journal: EntryAttemptJournal; getOwner: () => AftercareOwner | null; isActive: () => boolean; newIntentId: () => string;
  transport: { findMine: (id: string, isCurrent: () => boolean) => Promise<TechnicianWarrantyClaim | null>;
    listMine: (query: WarrantyMineQuery) => Promise<WarrantyMinePage>; command: (id: string, op: WarrantyCommand, dto: WarrantyCommandDto, refs: readonly string[]) => Promise<unknown> };
}
export type WarrantyTask = 'TW01' | 'TW02' | 'TW03' | 'TW04' | 'TW05' | 'TW06';
export function technicianWarrantyTask(claim: TechnicianWarrantyClaim | null): WarrantyTask {
  if (!claim) return 'TW01'; if (claim.status === 'submitted') return 'TW02';
  if (claim.status === 'accepted') return claim.visit?.status === 'checked_in' ? 'TW04' : 'TW03';
  return claim.status === 'in_progress' ? 'TW05' : 'TW06';
}
export interface WarrantyConfirmation { owner: AftercareOwner; claimId: string; visitId?: string; operation: WarrantyCommand; signature: string; dto: WarrantyCommandDto }
export interface TechnicianWarrantyState { phase: M6Phase; access: 'unverified' | 'assigned' | 'not-assigned' | 'revoked'; task: WarrantyTask; selectedClaimId: string | null;
  claim: Resource<TechnicianWarrantyClaim | null>; inbox: Resource<WarrantyMinePage>; confirmation: WarrantyConfirmation | null; message: string | null }
type Marker = Extract<EntryAttempt, { kind: 'warranty-command' }>;
export function createTechnicianWarrantyController(deps: TechnicianWarrantyDependencies) {
  let busy = false, epoch = 0, seq = 0;
  const empty = (id: string | null = null): TechnicianWarrantyState => ({ phase: 'idle', access: 'unverified', task: 'TW01', selectedClaimId: id, claim: { status: 'unloaded', requestSeq: seq }, inbox: { status: 'unloaded', requestSeq: seq }, confirmation: null, message: null });
  let state = empty(); const listeners = new Set<() => void>();
  const publish = (patch: Partial<TechnicianWarrantyState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const sameOwner = (o: AftercareOwner) => { const current = deps.getOwner(); return deps.isActive() && o.role === 'technician' && current?.role === 'technician' && current.userId === o.userId && current.sessionGeneration === o.sessionGeneration; };
  const same = (o: AftercareOwner, id: string) => sameOwner(o) && state.selectedClaimId === id;
  const currentClaim = (o: AftercareOwner, id: string) => same(o, id) && state.claim.status === 'ready' && state.claim.data?.id === id && state.claim.data.technician?.id === o.userId ? state.claim.data : null;
  const refs = (c: TechnicianWarrantyClaim) => [...new Set([...(c.evidenceRefs ?? []), ...(c.visit?.evidenceRefs ?? []), ...(c.visit?.reServiceEvidenceRefs ?? [])])];
  const pending = (o: AftercareOwner, id: string) => deps.journal.list(o.userId).filter((m): m is Marker => m.kind === 'warranty-command' && m.claimId === id && !m.resolved);
  function purge(access: TechnicianWarrantyState['access'] = 'unverified') { epoch++; seq++; const id = state.selectedClaimId; state = empty(id); publish({ access }); }
  function allowed(c: TechnicianWarrantyClaim, op: WarrantyCommand) {
    if (op === 'accept' || op === 'decline') return c.status === 'submitted';
    if (op === 'check-in') return c.status === 'accepted' && !!c.visit && ['scheduled', 'checked_in'].includes(c.visit.status);
    if (op === 'propose') return c.status === 'accepted' && c.visit?.status === 'checked_in';
    return c.status === 'in_progress' && c.visit?.status === 'inspected';
  }
  const signature = (c: TechnicianWarrantyClaim) => JSON.stringify({ id: c.id, technicianId: c.technician?.id, status: c.status, visit: c.visit });
  function matches(t: WarrantyConfirmation) { const c = currentClaim(t.owner, t.claimId); return !!c && allowed(c, t.operation) && signature(c) === t.signature && !t.dto.evidenceRefs?.some(r => !refs(c).includes(r)); }
  async function readClaim(o: AftercareOwner, id: string) {
    const generation = epoch, requestSeq = ++seq; publish({ claim: { status: 'loading', requestSeq }, confirmation: null });
    try {
      const raw = await deps.transport.findMine(id, () => same(o, id) && generation === epoch); if (!same(o, id) || generation !== epoch) return;
      const c = raw ? normalizeTechnicianWarrantyClaim(raw) : null;
      if (c && (c.id !== id || c.technician?.id !== o.userId)) { purge('revoked'); return; }
      publish({ access: c ? 'assigned' : 'not-assigned', task: technicianWarrantyTask(c), claim: { status: 'ready', data: c, requestSeq, fetchedAt: Date.now() } });
    } catch (e) { if (!same(o, id) || generation !== epoch) return; if (deniedRead(e)) purge('revoked'); else publish({ access: 'unverified', claim: { status: 'error', requestSeq, error: 'unavailable' } }); }
  }
  function resolved(o: AftercareOwner, id: string, m: Marker) {
    if (!same(o, id) || state.claim.status !== 'ready') return false;
    if (m.operation === 'decline') return m.confirmedId === id && state.claim.data === null && state.access === 'not-assigned';
    const c = currentClaim(o, id); if (!c || !c.visit) return false;
    if (m.operation === 'accept') return ['accepted', 'inspected', 'in_progress', 'awaiting_customer', 'disputed', 'resolved', 'rejected'].includes(c.status)
      && (m.confirmedId ? c.visit.id === m.confirmedId : c.visit.id !== m.expectedVisitId);
    if (c.visit.id !== m.expectedVisitId) return false;
    if (m.operation === 'check-in') return ['checked_in', 'inspected', 'completed'].includes(c.visit.status) && !!c.visit.checkedInAt;
    if (m.operation === 'propose') return ['inspected', 'completed'].includes(c.visit.status) && !!c.visit.proposedResult && ['inspected', 'in_progress', 'awaiting_customer', 'disputed', 'resolved', 'rejected'].includes(c.status);
    return c.visit.status === 'completed' && !!c.visit.completedAt && c.awaitingPrompt === 'completion' && ['awaiting_customer', 'disputed', 'resolved', 'rejected'].includes(c.status);
  }
  async function reconcile(o: AftercareOwner, id: string, m: Marker) {
    await readClaim(o, id); if (!same(o, id)) return;
    if (resolved(o, id, m)) await deps.journal.resolve(o.userId, m.intentId);
    if (!same(o, id)) return;
    const done = deps.journal.list(o.userId).find(r => r.intentId === m.intentId)?.resolved;
    publish({ phase: done ? 'resolved' : 'unknown', confirmation: null, message: done ? null : FINANCIAL_UNKNOWN });
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    selectClaim(id: string | null) { epoch++; seq++; state = empty(id && uuid4(id) ? id : null); publish({}); },
    invalidatePresentation: purge,
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    revalidateConfirmation() { if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); } },
    async refreshClaim() { const o = deps.getOwner(), id = state.selectedClaimId; if (!o || !id || !same(o, id) || busy) return; busy = true; try { await readClaim(o, id); } finally { busy = false; } },
    async loadInbox(query: WarrantyMineQuery = {}) {
      const o = deps.getOwner(); if (!o || !sameOwner(o) || busy) return; busy = true; const generation = epoch, requestSeq = ++seq; publish({ inbox: { status: 'loading', requestSeq } });
      try { const page = await deps.transport.listMine(query); if (!sameOwner(o) || generation !== epoch) return;
        if (page.data.some(c => c.technician?.id !== o.userId)) { purge('revoked'); return; }
        publish({ inbox: { status: 'ready', data: page, requestSeq, fetchedAt: Date.now() } });
      } catch (e) { if (sameOwner(o) && generation === epoch) { if (deniedRead(e)) purge('revoked'); else publish({ inbox: { status: 'error', requestSeq, error: 'unavailable' } }); } }
      finally { busy = false; }
    },
    async prepare(operation: WarrantyCommand, input: unknown) {
      const o = deps.getOwner(), id = state.selectedClaimId; if (!o || !id || !same(o, id) || busy) return;
      busy = true; const generation = ++epoch; publish({ phase: 'verifying', confirmation: null });
      try {
        await deps.journal.restore(); if (!same(o, id) || generation !== epoch) return;
        if (deps.journal.blocked(o.userId, 'warranty-command', id)) { publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); return; }
        await readClaim(o, id); if (!same(o, id) || generation !== epoch) return;
        const c = currentClaim(o, id); if (!c || !allowed(c, operation)) { publish({ phase: 'denied', message: 'Bước bảo hành hiện tại chưa cho phép thao tác này.' }); return; }
        const dto = warrantyCommandPayload(operation, input, refs(c)); if (dto.evidenceRefs) Object.freeze(dto.evidenceRefs);
        publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ owner: Object.freeze({ ...o }), claimId: id, ...(c.visit ? { visitId: c.visit.id } : {}), operation, signature: signature(c), dto: Object.freeze(dto) }) });
      } catch { if (same(o, id)) publish({ phase: 'denied', confirmation: null, message: 'Hãy kiểm tra nội dung và bằng chứng có sẵn. Ảnh mới đang chờ hỗ trợ lưu trữ riêng tư.' }); }
      finally { busy = false; }
    },
    async submitConfirmation() {
      const t = state.confirmation; if (!t || busy || state.phase !== 'confirming' || !matches(t)) return;
      busy = true; let intentId: string | null = null; publish({ phase: 'submitting' });
      try {
        intentId = deps.newIntentId();
        if (!await deps.journal.begin({ kind: 'warranty-command', operation: t.operation, claimId: t.claimId, ...(t.visitId ? { expectedVisitId: t.visitId } : {}), ownerUserId: t.owner.userId, intentId, createdAt: Date.now() })) { publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); return; }
        if (state.confirmation !== t || !matches(t)) { await deps.journal.resolve(t.owner.userId, intentId); if (same(t.owner, t.claimId)) publish({ phase: 'failed-known', confirmation: null, message: null }); return; }
        const c = currentClaim(t.owner, t.claimId)!; const allowedRefs = refs(c); publish({ confirmation: null });
        try {
          const result = normalizeTechnicianWarrantyClaim(await deps.transport.command(t.claimId, t.operation, t.dto, allowedRefs));
          if (result.id === t.claimId && (t.operation === 'decline' ? result.technician === null : result.technician?.id === t.owner.userId)) {
            if (t.operation === 'decline') await deps.journal.recordId(t.owner.userId, intentId, t.claimId);
            else if (t.operation === 'accept' && result.visit) await deps.journal.recordId(t.owner.userId, intentId, result.visit.id);
          }
        } catch { /* Missing claim from mine alone cannot establish a declined POST outcome. */ }
        if (same(t.owner, t.claimId)) await reconcile(t.owner, t.claimId, deps.journal.list(t.owner.userId).find(m => m.intentId === intentId) as Marker);
      } catch { if (same(t.owner, t.claimId)) publish({ phase: intentId ? 'unknown' : 'failed-known', confirmation: null, message: intentId ? FINANCIAL_UNKNOWN : 'Chưa gửi được thao tác. Hãy xác nhận lại để tiếp tục.' }); }
      finally { busy = false; }
    },
    async restoredMarkers() { const o = deps.getOwner(), id = state.selectedClaimId; if (!o || !id || !same(o, id)) return []; await deps.journal.restore(); return same(o, id) ? pending(o, id) : []; },
    async verify() {
      const o = deps.getOwner(), id = state.selectedClaimId; if (!o || !id || !same(o, id) || busy) return;
      busy = true; publish({ phase: 'verifying', confirmation: null });
      try { await deps.journal.restore(); if (!same(o, id)) return; const markers = pending(o, id);
        if (!markers.length) { publish({ phase: 'idle' }); return; }
        for (const m of markers) { if (!same(o, id)) break; await reconcile(o, id, m); }
      } catch { if (same(o, id)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    authorizedEvidenceRefs: () => { const o = deps.getOwner(), id = state.selectedClaimId, c = o && id ? currentClaim(o, id) : null; return c ? refs(c) : []; },
    availableCommands(): WarrantyCommand[] { const o = deps.getOwner(), id = state.selectedClaimId, c = o && id ? currentClaim(o, id) : null;
      return c && o && !deps.journal.blocked(o.userId, 'warranty-command', c.id) && !busy ? (['accept', 'decline', 'check-in', 'propose', 'complete'] as const).filter(op => allowed(c, op)) : []; },
  };
}
export type TechnicianWarrantyController = ReturnType<typeof createTechnicianWarrantyController>;
