import { normalizeMySupportCase, type CreateSupportCasePayload, type MySupportCase, type SupportCasePage, type MySupportCaseQuery } from '../../../api/support-cases.api';
import type { EntryAttempt, EntryAttemptJournal } from '../runtime/entry-attempt-journal';
import type { OrderRole, Resource } from '../domain/order-session.types';
import { FINANCIAL_UNKNOWN, type M6Phase } from '../customer/payment-facts';
import { allowedSupportTypes, deniedRead, record, supportPayload, uuid4, validTimestamp } from './aftercare-contracts';
export interface AftercareOwner { userId: string; role: OrderRole; sessionGeneration: number }
export interface SupportContext { kind: 'order' | 'booking'; id: string; phase: string; completedAt?: string | null; arrivalVerified?: boolean; authorizedRefs: readonly string[]; linkedOrderId?: string }
export type SupportDraft = Pick<CreateSupportCasePayload, 'caseType' | 'reason' | 'description' | 'evidenceRefs' | 'isUrgent'>;
export interface SupportDependencies {
  journal: EntryAttemptJournal; getOwner: () => AftercareOwner | null; isActive: () => boolean;
  getContext: () => SupportContext | null; refreshContext: () => Promise<SupportContext | null>; newIntentId: () => string; now?: () => number; onAccessDenied: () => void;
  isContextRevoked?: () => boolean;
  transport: { listMine: (query: MySupportCaseQuery) => Promise<SupportCasePage>; getMine: (id: string) => Promise<unknown>; create: (dto: CreateSupportCasePayload) => Promise<unknown> };
}
export interface SupportConfirmation { owner: AftercareOwner; context: SupportContext; signature: string; dto: CreateSupportCasePayload }
export interface SupportState { phase: M6Phase; confirmation: SupportConfirmation | null; list: Resource<MySupportCase[]>; detail: Resource<MySupportCase>; message: string | null; knownActorOpenCount: number | null; openCountSemantics: 'known-actor-created-lower-bound' }
type SupportMarker = Extract<EntryAttempt, { kind: 'support-create' }>;
export function createSupportController(deps: SupportDependencies) {
  let busy = false, epoch = 0, seq = 0, presentation: { owner: AftercareOwner; context: SupportContext } | null = null;
  const empty = (): SupportState => ({ phase: 'idle', confirmation: null, list: { status: 'unloaded', requestSeq: seq }, detail: { status: 'unloaded', requestSeq: seq }, message: null, knownActorOpenCount: null, openCountSemantics: 'known-actor-created-lower-bound' });
  let state = empty(); const listeners = new Set<() => void>();
  const publish = (p: Partial<SupportState>) => { state = { ...state, ...p }; listeners.forEach(f => f()); };
  const sameOwner = (o: AftercareOwner) => { const current = deps.getOwner(); return deps.isActive() && !!current && current.userId === o.userId && current.role === o.role && current.sessionGeneration === o.sessionGeneration; };
  const same = (o: AftercareOwner, c: SupportContext) => { const current = deps.getContext(); return sameOwner(o) && current?.kind === c.kind && current.id === c.id; };
  function purge() { epoch++; seq++; presentation = null; state = empty(); publish({ phase: 'denied', message: 'Bạn không còn quyền xem nội dung hỗ trợ này.' }); }
  const pending = (o: AftercareOwner, c: SupportContext) => deps.journal.list(o.userId).filter((m): m is SupportMarker => m.kind === 'support-create' && m.role === o.role && m.contextKind === c.kind && m.contextId === c.id && !m.resolved);
  const matchesCase = (r: MySupportCase, c: SupportContext) => c.kind === 'order' ? r.serviceOrderId === c.id : r.bookingId === c.id;
  function mine(value: unknown, c: SupportContext, exactId?: string): MySupportCase {
    const raw = record(value), r = normalizeMySupportCase(raw);
    if (!uuid4(r.id) || (exactId && r.id !== exactId) || !matchesCase(r, c) || typeof raw.isUrgent !== 'boolean'
      || (r.bookingId !== null && !uuid4(r.bookingId)) || (r.serviceOrderId !== null && !uuid4(r.serviceOrderId))
      || !validTimestamp(r.createdAt) || !validTimestamp(r.updatedAt)
      || (r.respondBy !== null && !validTimestamp(r.respondBy)) || (r.resolvedAt !== null && !validTimestamp(r.resolvedAt))) throw Error('Nội dung hỗ trợ chưa xác định.');
    return r;
  }
  const contextSignature = (c: SupportContext) => JSON.stringify({ kind: c.kind, id: c.id, phase: c.phase, completedAt: c.completedAt, arrivalVerified: c.arrivalVerified, linkedOrderId: c.linkedOrderId });
  const refs = (c: SupportContext) => [...c.authorizedRefs, ...(state.list.status === 'ready' ? state.list.data.flatMap(r => r.evidenceRefs ?? []) : [])];
  function eligible(o: AftercareOwner, c: SupportContext, type: SupportDraft['caseType']) {
    if (!same(o, c) || !uuid4(c.id) || c.linkedOrderId || !allowedSupportTypes(o.role, c.phase).includes(type) || (type === 'technician_replacement' && c.arrivalVerified !== true)) return false;
    if (c.phase === 'COMPLETED' && c.completedAt) {
      if (!validTimestamp(c.completedAt) || (deps.now ?? Date.now)() - Date.parse(c.completedAt) > 7 * 86400000) return false;
    }
    return state.list.status === 'ready' && (state.knownActorOpenCount ?? 0) < 3;
  }
  function matches(t: SupportConfirmation) { const c = deps.getContext(); return !!c && eligible(t.owner, c, t.dto.caseType) && contextSignature(c) === t.signature && !t.dto.evidenceRefs?.some(r => !refs(c).includes(r)); }
  async function readList(o: AftercareOwner, c: SupportContext, page = 1) {
    const generation = epoch, requestSeq = ++seq; publish({ list: { status: 'loading', requestSeq } });
    try {
      const result = await deps.transport.listMine({ page, limit: 100, ...(c.kind === 'order' ? { serviceOrderId: c.id } : {}) });
      if (!same(o, c) || generation !== epoch) return;
      if (!Array.isArray(result.data) || !Number.isSafeInteger(result.total) || result.total < 0 || result.page !== page || result.limit !== 100) throw Error('Danh sách hỗ trợ chưa xác định.');
      const rows = result.data.filter(r => matchesCase(r, c)).map(r => mine(r, c));
      const createdIds = new Set(deps.journal.list(o.userId).filter((m): m is SupportMarker => m.kind === 'support-create' && m.role === o.role && m.contextKind === c.kind && m.contextId === c.id && !!m.confirmedId).map(m => m.confirmedId));
      presentation = { owner: { ...o }, context: { ...c } };
      publish({ list: { status: 'ready', data: rows, fetchedAt: Date.now(), requestSeq }, knownActorOpenCount: rows.filter(r => createdIds.has(r.id) && ['open', 'in_review'].includes(r.status)).length });
    } catch (e) {
      if (!sameOwner(o) || generation !== epoch) return;
      if (deniedRead(e)) { deps.onAccessDenied(); purge(); } else publish({ list: { status: 'error', requestSeq, error: 'unavailable' }, knownActorOpenCount: null });
    }
  }
  async function readDetail(o: AftercareOwner, c: SupportContext, id: string) {
    const generation = epoch, requestSeq = ++seq; publish({ detail: { status: 'loading', requestSeq } });
    try {
      const data = mine(await deps.transport.getMine(id), c, id); if (!same(o, c) || generation !== epoch) return;
      presentation = { owner: { ...o }, context: { ...c } }; publish({ detail: { status: 'ready', data, requestSeq, fetchedAt: Date.now() } });
    } catch (e) {
      if (!sameOwner(o) || generation !== epoch) return;
      if (deniedRead(e)) { deps.onAccessDenied(); purge(); } else publish({ detail: { status: 'error', requestSeq, error: 'unavailable' } });
    }
  }
  async function reconcile(o: AftercareOwner, c: SupportContext, m: SupportMarker) {
    if (m.confirmedId) {
      await readDetail(o, c, m.confirmedId);
      if (same(o, c) && state.detail.status === 'ready' && state.detail.data.id === m.confirmedId) await deps.journal.resolve(o.userId, m.intentId);
    }
    if (same(o, c)) { const resolved = deps.journal.list(o.userId).find(r => r.intentId === m.intentId)?.resolved;
      publish({ phase: resolved ? 'resolved' : 'unknown', confirmation: null, message: resolved ? null : FINANCIAL_UNKNOWN }); }
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async prepare(input: SupportDraft) {
      const o = deps.getOwner(), c = deps.getContext(); if (!o || !c || !same(o, c) || busy) return;
      busy = true; const generation = ++epoch; publish({ phase: 'verifying', confirmation: null });
      try {
        record(input, ['caseType', 'reason', 'description', 'evidenceRefs', 'isUrgent']); await deps.journal.restore(); if (!same(o, c) || generation !== epoch) return;
        if (pending(o, c).length) { publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); return; }
        await deps.refreshContext(); if (!same(o, c) || generation !== epoch) return;
        const current = deps.getContext()!; await readList(o, current); if (!same(o, c) || generation !== epoch) return;
        if (!eligible(o, current, input.caseType)) { publish({ phase: 'denied', message: 'Loại hỗ trợ hoặc điều kiện hiện tại chưa cho phép gửi. Hãy làm mới hoặc liên hệ quản lý dịch vụ.' }); return; }
        const dto = supportPayload({ ...input, [current.kind === 'order' ? 'serviceOrderId' : 'bookingId']: current.id }, refs(current)); if (dto.evidenceRefs) Object.freeze(dto.evidenceRefs);
        publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ owner: Object.freeze({ ...o }), context: Object.freeze({ ...current, authorizedRefs: Object.freeze([...current.authorizedRefs]) }), signature: contextSignature(current), dto: Object.freeze(dto) }) });
      } catch { if (sameOwner(o)) publish({ phase: 'denied', message: 'Hãy kiểm tra nội dung hỗ trợ và ảnh có sẵn được phép dùng.' }); }
      finally { busy = false; }
    },
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    invalidatePresentation: purge,
    revalidateConfirmation() {
      const c = deps.getContext();
      if (deps.isContextRevoked?.() || (presentation && (!sameOwner(presentation.owner) || (c && (c.id !== presentation.context.id || c.kind !== presentation.context.kind))))) { purge(); return; }
      if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); }
    },
    async submitConfirmation() {
      const t = state.confirmation; if (!t || busy || state.phase !== 'confirming' || !matches(t)) return;
      busy = true; let intentId: string | null = null; publish({ phase: 'submitting' });
      try {
        intentId = deps.newIntentId();
        if (!await deps.journal.begin({ kind: 'support-create', role: t.owner.role, contextKind: t.context.kind, contextId: t.context.id, ownerUserId: t.owner.userId, intentId, createdAt: (deps.now ?? Date.now)() })) { publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); return; }
        if (state.confirmation !== t || !matches(t)) { await deps.journal.resolve(t.owner.userId, intentId); if (same(t.owner, t.context)) publish({ phase: 'failed-known', confirmation: null, message: null }); return; }
        publish({ confirmation: null });
        try { const row = record(await deps.transport.create(t.dto)); if (uuid4(row.id)) await deps.journal.recordId(t.owner.userId, intentId, row.id); } catch { /* Unknown creation never chooses another case by reason/time. */ }
        if (same(t.owner, t.context)) await reconcile(t.owner, t.context, deps.journal.list(t.owner.userId).find(m => m.intentId === intentId) as SupportMarker);
      } catch { if (same(t.owner, t.context)) publish({ phase: intentId ? 'unknown' : 'failed-known', confirmation: null, message: intentId ? FINANCIAL_UNKNOWN : 'Chưa gửi được nội dung. Hãy xác nhận lại để tiếp tục.' }); }
      finally { busy = false; }
    },
    async restoredMarkers() { const o = deps.getOwner(), c = deps.getContext(); if (!o || !c || !same(o, c)) return []; await deps.journal.restore(); return same(o, c) ? pending(o, c) : []; },
    async verify() {
      const o = deps.getOwner(), c = deps.getContext(); if (!o || !c || !same(o, c) || busy) return;
      busy = true; publish({ phase: 'verifying', confirmation: null });
      try { await deps.journal.restore(); if (!same(o, c)) return; const markers = pending(o, c);
        if (!markers.length) { publish({ phase: 'idle' }); return; }
        for (const m of markers) { if (!same(o, c)) break; await reconcile(o, c, m); }
      } catch { if (same(o, c)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    async loadDetail(id: string) { const o = deps.getOwner(), c = deps.getContext(); if (!o || !c || !uuid4(id) || !same(o, c) || busy) return; busy = true; try { await readDetail(o, c, id); } finally { busy = false; } },
    async loadList(page = 1) { const o = deps.getOwner(), c = deps.getContext(); if (!o || !c || !same(o, c) || busy || !Number.isSafeInteger(page) || page < 1) return;
      busy = true; try { await deps.journal.restore(); if (same(o, c)) await readList(o, c, page); } catch { if (same(o, c)) purge(); } finally { busy = false; } },
    allowedTypes: () => { const o = deps.getOwner(), c = deps.getContext(); return o && c && same(o, c) ? allowedSupportTypes(o.role, c.phase).filter(t => t !== 'technician_replacement' || c.arrivalVerified === true) : []; },
  };
}
export type SupportController = ReturnType<typeof createSupportController>;
