import type { EvidenceResponse, EvidenceUploadImage } from '../../../api/orders.api';
import { financialRecord } from '../../../api/customer-wallet.api';
import { getOrderCapabilities } from '../domain/order-capabilities';
import { sameOrderSession, type OrderResourceKind, type OrderSessionKey } from '../domain/order-session.types';
import type { OrderCommandJournal, OrderCommandMarker } from '../runtime/order-command-journal';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { FINANCIAL_UNKNOWN, hasCompletionRequest, invoiceFact, isUnresolvedMarker, m6Order, type M6Phase } from '../customer/payment-facts';
export interface TechnicianCompletionDependencies {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal; getKey: () => OrderSessionKey | null;
  isActive: () => boolean; newIntentId: () => string;
  transport: { uploadAfter: (order: string, image: EvidenceUploadImage) => Promise<unknown>;
    deleteEvidence: (order: string, evidence: string) => Promise<unknown>;
    requestCompletion: (order: string, dto: { completionNote?: string }) => Promise<unknown> };
}
export interface CompletionConfirmation {
  key: OrderSessionKey; operation: 'request-completion' | 'evidence-delete'; entityId: string; completionNote?: string;
}
export interface TechnicianCompletionState {
  phase: M6Phase; operation: 'after-upload' | 'evidence-delete' | 'request-completion' | null;
  confirmation: CompletionConfirmation | null; confirmedUpload: EvidenceResponse | null; message: string | null;
}
/** AFTER capture and handover only. M3 arrival timing remains independent. */
export function createTechnicianCompletionController(deps: TechnicianCompletionDependencies) {
  let state: TechnicianCompletionState = { phase: 'idle', operation: null, confirmation: null, confirmedUpload: null, message: null };
  let busy = false, epoch = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<TechnicianCompletionState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const same = (key: OrderSessionKey) => key.role === 'technician' && deps.isActive() && sameOrderSession(deps.getKey(), key)
    && sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);
  const order = (key: OrderSessionKey) => same(key) ? m6Order(deps.coordinator.getSnapshot(), key) : null;
  const ownAfter = (key: OrderSessionKey) => {
    const s = deps.coordinator.getSnapshot();
    return order(key) && s?.resources.evidence.status === 'ready'
      ? s.resources.evidence.data.filter(e => e.type === 'AFTER' && e.serviceOrderId === key.serviceOrderId && e.uploaderId === key.userId) : [];
  };
  const privateAfter = (key: OrderSessionKey, id: string | undefined) => ownAfter(key).find(e => e.id === id
    && /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/authenticated\/s--[^/]+\//.test(e.mediaUrl));
  const pending = (key: OrderSessionKey) => deps.journal.list(key.userId).filter(m => m.role === key.role && m.serviceOrderId === key.serviceOrderId
    && (['after-upload', 'request-completion'].includes(m.operation) || (m.operation === 'evidence-delete' && m.stableKey === 'm6-after-delete')) && isUnresolvedMarker(m));
  const resources = (operation: TechnicianCompletionState['operation']): OrderResourceKind[] => operation === 'request-completion'
    ? ['evidence', 'quotations', 'extras', 'parts', 'invoice'] : ['evidence'];
  async function refresh(key: OrderSessionKey, kinds: OrderResourceKind[]) {
    await deps.coordinator.refreshOrderSession(key, 'completion-readback'); if (!order(key)) return;
    await Promise.all(kinds.filter(k => deps.coordinator.getSnapshot()?.resources[k].status === 'unloaded').map(k => deps.coordinator.loadResource(key, k)));
  }
  function allowed(key: OrderSessionKey, operation: TechnicianCompletionState['operation'], id?: string) {
    const current = order(key), s = deps.coordinator.getSnapshot();
    if (!current || current.status !== 'UNDER_REPAIR' || current.completionRequestedAt || !s) return false;
    if (operation === 'after-upload') return s.resources.evidence.status === 'ready';
    if (operation === 'evidence-delete') return ownAfter(key).some(e => e.id === id);
    return s.resources.quotations.status === 'ready' && !s.resources.quotations.data.some(q => q.status.toUpperCase() === 'SENT')
      && getOrderCapabilities({ ...s, pendingIntent: false }).canAttemptRequestCompletion;
  }
  function verdict(key: OrderSessionKey, m: OrderCommandMarker): CommandReadbackVerdict {
    const current = order(key); if (!current) return 'unresolved';
    if (m.operation === 'request-completion') return hasCompletionRequest(current) && invoiceFact(deps.coordinator.getSnapshot(), key) ? 'resolved' : 'unresolved';
    if (m.operation === 'after-upload') return privateAfter(key, m.resultEntityId) ? 'resolved' : 'unresolved';
    const list = deps.coordinator.getSnapshot()?.resources.evidence;
    return m.operation === 'evidence-delete' && m.stableKey === 'm6-after-delete' && list?.status === 'ready' && !list.data.some(e => e.id === m.entityId) ? 'resolved' : 'unresolved';
  }
  function finish(key: OrderSessionKey, m?: OrderCommandMarker) {
    if (!same(key)) return;
    const phase = m?.status === 'resolved' ? 'resolved' : m?.status === 'failed-known' ? 'failed-known' : 'unknown';
    publish({ phase, confirmation: null, confirmedUpload: phase === 'resolved' && m?.operation === 'after-upload' ? privateAfter(key, m.resultEntityId) ?? null : null,
      message: phase === 'unknown' ? FINANCIAL_UNKNOWN : null });
  }
  async function prepare(operation: CompletionConfirmation['operation'], entityId: string, completionNote?: string) {
    const key = deps.getKey(); if (!key || !same(key) || busy) return;
    busy = true; const generation = ++epoch;
    publish({ phase: 'verifying', operation, confirmation: null, confirmedUpload: null });
    try {
      await deps.journal.restore(); if (!same(key) || generation !== epoch) return;
      if (deps.journal.hasUnresolved(key)) { finish(key, pending(key)[0]); return; }
      await refresh(key, resources(operation)); if (!same(key) || generation !== epoch) return;
      if (!allowed(key, operation, entityId)) { publish({ phase: 'denied', message: 'Hãy kiểm tra ảnh sau sửa chữa, báo giá, phát sinh và linh kiện trước khi tiếp tục.' }); return; }
      publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ key: Object.freeze({ ...key }), operation, entityId, ...(completionNote ? { completionNote } : {}) }) });
    } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
    finally { busy = false; }
  }
  async function dispatch(key: OrderSessionKey, operation: NonNullable<TechnicianCompletionState['operation']>, entityId: string,
    stillCurrent: () => boolean, command: (intentId: string) => Promise<unknown>) {
    const intentId = deps.newIntentId(); let sent = false, precommit = false;
    const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: k => !!order(k), refresh: k => refresh(k, resources(operation)) });
    publish({ phase: 'submitting', operation });
    await adapter.dispatch(key, { intentId, operation, entityId, ...(operation === 'evidence-delete' ? { stableKey: 'm6-after-delete' } : {}) }, async () => {
      if (!stillCurrent() || !allowed(key, operation, entityId)) return;
      sent = true; publish({ confirmation: null });
      if (operation === 'request-completion') {
        try { await command(intentId); }
        catch (error) {
          // Pinned requestCompletion runs all work in one transaction; EVIDENCE_REQUIRED_AFTER
          // rejects before invoice/requestedAt/audit/notification writes and rolls back.
          // Generic 409/422 and other operations do not inherit this proof.
          const response = financialRecord(financialRecord(error)?.response), body = financialRecord(response?.data);
          precommit = response?.status === 409 && body?.success === false && financialRecord(body.error)?.code === 'EVIDENCE_REQUIRED_AFTER';
          throw error;
        }
        return;
      }
      return command(intentId);
    }, () => sent ? verdict(key, deps.journal.list(key.userId).find(m => m.intentId === intentId)!) : 'failed-known');
    if (precommit || !sent) {
      const marker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
      if (marker && marker.status !== 'resolved') await deps.journal.mark(key.userId, intentId, 'failed-known');
    }
    finish(key, deps.journal.list(key.userId).find(m => m.intentId === intentId));
    const done = deps.journal.list(key.userId).find(m => m.intentId === intentId);
    if (precommit && done?.status === 'failed-known' && same(key)) {
      publish({ message: 'Máy chủ chưa chấp nhận bàn giao vì thiếu ảnh sau sửa chữa. Hãy chụp và gửi thêm ảnh sau sửa chữa rồi tạo xác nhận mới.' });
    }
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async requestCompletion(note: string) {
      if (typeof note !== 'string' || note.trim().length > 2000) { publish({ phase: 'denied', confirmation: null, message: 'Ghi chú bàn giao tối đa 2.000 ký tự.' }); return; }
      const key = deps.getKey(); if (key) await prepare('request-completion', key.serviceOrderId, note.trim());
    },
    requestDeleteAfter: (id: string) => prepare('evidence-delete', id),
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    revalidateConfirmation() { const t = state.confirmation; if (t && !allowed(t.key, t.operation, t.entityId)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); } },
    invalidatePresentation() { epoch++; publish({ phase: 'idle', confirmation: null, confirmedUpload: null, message: null }); },
    async submitConfirmation() {
      const target = state.confirmation; if (!target || busy || !allowed(target.key, target.operation, target.entityId)) return;
      busy = true;
      try { await dispatch(target.key, target.operation, target.entityId, () => state.confirmation === target,
        () => target.operation === 'evidence-delete' ? deps.transport.deleteEvidence(target.key.serviceOrderId, target.entityId)
          : deps.transport.requestCompletion(target.key.serviceOrderId, target.completionNote ? { completionNote: target.completionNote } : {})); }
      catch { if (same(target.key)) publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    async uploadAfter(asset: CameraOrderAsset) {
      const key = deps.getKey(); if (!key || !same(key) || busy) return;
      const image = Object.freeze({ uri: asset.uri, name: asset.name, type: asset.type });
      if (asset.source !== 'camera' || !image.uri || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)
        || !Number.isFinite(asset.sizeBytes) || asset.sizeBytes <= 0 || asset.sizeBytes > 10 * 1024 * 1024) {
        publish({ phase: 'denied', message: 'Hãy chụp ảnh hợp lệ bằng camera, dung lượng tối đa 10 MB.' }); return;
      }
      busy = true; const generation = ++epoch; publish({ phase: 'verifying', operation: 'after-upload', confirmedUpload: null });
      try {
        await deps.journal.restore(); if (!same(key) || generation !== epoch) return;
        if (deps.journal.hasUnresolved(key)) { finish(key, pending(key)[0]); return; }
        await refresh(key, ['evidence']); if (!same(key) || generation !== epoch) return;
        if (!allowed(key, 'after-upload')) { publish({ phase: 'denied', message: 'Đơn hiện tại chưa cho phép chụp ảnh sau sửa chữa.' }); return; }
        await dispatch(key, 'after-upload', key.serviceOrderId, () => generation === epoch, async intentId => {
          let uploaded: unknown;
          try { uploaded = await deps.transport.uploadAfter(key.serviceOrderId, image); }
          catch (error) {
            // The journal treats a failed POST as unknown (it may have landed); this only makes the cause visible while developing.
            if (__DEV__) { const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response; console.warn('[after-upload] POST failed', response?.status, JSON.stringify(response?.data)); }
            throw error;
          }
          const id = financialRecord(uploaded)?.id;
          if (typeof id === 'string') await deps.journal.recordEntity(key.userId, intentId, id);
        });
      } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    async restoredMarkers() { const key = deps.getKey(); if (!key || !same(key)) return []; await deps.journal.restore(); return same(key) ? pending(key) : []; },
    async verify() {
      const key = deps.getKey(); if (!key || !same(key) || busy) return;
      busy = true; publish({ phase: 'verifying', confirmation: null });
      try {
        await deps.journal.restore(); if (!same(key)) return;
        const markers = pending(key);
        if (!markers.length) { publish({ phase: deps.journal.hasUnresolved(key) ? 'unknown' : 'idle' }); return; }
        await refresh(key, [...new Set(markers.flatMap(m => resources(m.operation as TechnicianCompletionState['operation'])))]);
        const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: k => !!order(k), refresh: async () => {} });
        for (const m of markers) await adapter.verify(key, m.intentId, () => verdict(key, m));
        finish(key, deps.journal.list(key.userId).find(m => m.intentId === markers[0].intentId));
      } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
  };
}
export type TechnicianCompletionController = ReturnType<typeof createTechnicianCompletionController>;
