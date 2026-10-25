import { isHistoricalOrder, type EvidenceUploadImage } from '../../../api/orders.api';
import type { CheckInDto } from '../../../types/api.types';
import { getOrderCapabilities } from '../domain/order-capabilities';
import { sameOrderSession, type OrderSessionKey, type OrderResourceKind } from '../domain/order-session.types';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandMarker, OrderCommandOperation } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';

export interface FreshOrderPosition {
  source: 'os'; permission: 'granted' | 'denied' | 'unavailable';
  lat: number; lng: number; accuracyMeters: number; timestamp: number;
  deviceInfo?: Record<string, unknown>;
}
export interface CameraOrderAsset extends EvidenceUploadImage { source: 'camera'; sizeBytes: number }
export interface ArrivalProofState {
  phase: 'idle' | 'submitting' | 'verifying' | 'unknown' | 'denied' | 'resolved';
  operation?: OrderCommandOperation; message: string | null;
}
/** `deferAutoStart`: more BEFORE photos follow, so a fixed-price order must stay EN_ROUTE (BE 20/10/2026). */
export interface BeforeUploadOptions { deferAutoStart?: boolean }
export interface ArrivalProofTransport {
  depart: (id: string) => Promise<unknown>;
  checkIn: (id: string, dto: CheckInDto) => Promise<unknown>;
  uploadFace: (id: string, asset: EvidenceUploadImage) => Promise<unknown>;
  uploadBefore: (id: string, asset: EvidenceUploadImage, options?: BeforeUploadOptions) => Promise<unknown>;
  recoverRepair: (id: string) => Promise<unknown>;
  deleteEvidence: (id: string, evidenceId: string) => Promise<unknown>;
}
export interface ArrivalProofDependencies {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal; transport: ArrivalProofTransport;
  getKey: () => OrderSessionKey | null; isActive: () => boolean; newIntentId: () => string; now?: () => number;
}
/** Freshness is a device-sample rule, not the server's accuracy/geofence policy. */
export function isFreshOrderPosition(p: FreshOrderPosition, now: number): boolean {
  return p.source === 'os' && p.permission === 'granted' && [p.lat, p.lng, p.accuracyMeters, p.timestamp].every(Number.isFinite)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.accuracyMeters >= 0
    && now - p.timestamp <= 30000 && p.timestamp <= now + 1000;
}
function responseRecord(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  return response as Record<string, unknown>;
}
/** Pinned enRoute code is reachable only before transition writes/transaction commit. */
function isDeparturePrecommitRejection(error: unknown): boolean {
  const response = responseRecord(responseRecord(error)?.response);
  const body = responseRecord(response?.data);
  return body?.success === false && responseRecord(body.error)?.code === 'ORDER_INVALID_TRANSITION';
}
const unknownMessage = 'Kết quả chưa xác định. Không gửi lại; hãy kiểm tra từ hệ thống hoặc liên hệ hỗ trợ.';
/** One command owner, one frozen session reader. No native assets or GPS are retained. */
export function createArrivalProofController(deps: ArrivalProofDependencies) {
  let state: ArrivalProofState = { phase: 'idle', message: null }, busy = false;
  let lastRejectedSample: number | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: ArrivalProofState) => { state = next; listeners.forEach(fn => fn()); };
  const now = deps.now ?? Date.now;
  const sameKey = (key: OrderSessionKey) => deps.isActive() && sameOrderSession(deps.getKey(), key)
    && sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);
  const currentOrder = (key: OrderSessionKey) => {
    const s = deps.coordinator.getSnapshot();
    return sameKey(key) && key.role === 'technician' && s?.access === 'current' && s.order.status === 'ready'
      && !isHistoricalOrder(s.order.data) && s.order.data.id === key.serviceOrderId && s.order.data.technician?.id === key.userId ? s.order.data : null;
  };
  const ownedEvidence = (key: OrderSessionKey) => {
    const s = deps.coordinator.getSnapshot();
    return currentOrder(key) && s?.resources.evidence.status === 'ready'
      ? s.resources.evidence.data.filter(e => e.serviceOrderId === key.serviceOrderId && e.uploaderId === key.userId) : null;
  };
  /** Dev-only: which guard blocked a command (no PII, booleans only). */
  function why(key: OrderSessionKey, operation: OrderCommandOperation) {
    if (!__DEV__) return;
    const s = deps.coordinator.getSnapshot(), o = currentOrder(key), ev = s?.resources.evidence;
    console.warn('[arrival-proof] blocked', operation, JSON.stringify({
      active: deps.isActive(), readerKey: sameOrderSession(deps.getKey(), key), snapshotKey: sameOrderSession(s?.key ?? null, key), access: s?.access, order: !!o, status: o?.status, arrivalVerified: o?.arrivalVerified,
      completionRequested: !!o?.completionRequestedAt, evidence: ev?.status,
      ownFace: ev?.status === 'ready' ? ev.data.some(e => e.uploaderId === key.userId && e.type === 'CHECKIN_FACE') : null,
      evidenceRows: ev?.status === 'ready' ? ev.data.length : null,
    }));
  }
  function allowed(key: OrderSessionKey, operation: OrderCommandOperation, entityId?: string): boolean {
    const order = currentOrder(key); if (!order || order.completionRequestedAt) return false;
    if (operation === 'en-route') {
      // Missing timing facts cannot be replaced by the source default.
      const opensAt = order.departAvailableAt ? Date.parse(order.departAvailableAt) : Number.NaN;
      return order.status === 'ACCEPTED' && Number.isFinite(opensAt) && opensAt <= now();
    }
    if (operation === 'check-in') return order.status === 'EN_ROUTE';
    const proof = ownedEvidence(key);
    if (operation === 'face-upload') return order.status === 'EN_ROUTE' && order.arrivalVerified === true && proof !== null && !proof.some(e => e.type === 'CHECKIN_FACE');
    if (operation === 'before-upload') return order.status === 'EN_ROUTE' && order.arrivalVerified === true && !!proof?.some(e => e.type === 'CHECKIN_FACE');
    if (operation === 'evidence-delete') return order.status === 'EN_ROUTE' && !!proof?.some(e => e.id === entityId && e.type === 'BEFORE');
    if (operation === 'repair-recovery') {
      const s = deps.coordinator.getSnapshot();
      // This controller owns its reserved marker; all other intents were checked before reservation.
      return !!s && getOrderCapabilities({ ...s, pendingIntent: false }).canRecoverRepair;
    }
    return false;
  }
  async function refresh(key: OrderSessionKey, resources: OrderResourceKind[]) {
    await deps.coordinator.refreshOrderSession(key, 'command-readback');
    if (!currentOrder(key)) return;
    // Coordinator refreshes already opened lists; load only newly needed kinds once.
    await Promise.all(resources.filter(kind => deps.coordinator.getSnapshot()?.resources[kind].status === 'unloaded')
      .map(kind => deps.coordinator.loadResource(key, kind)));
  }
  function verdict(key: OrderSessionKey, marker: OrderCommandMarker): CommandReadbackVerdict {
    const order = currentOrder(key); if (!order) return 'unresolved';
    if (marker.operation === 'en-route') return ['EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED'].includes(order.status) ? 'resolved' : 'unresolved';
    if (marker.operation === 'check-in') return order.arrivalVerified === true ? 'resolved' : 'unresolved';
    if (marker.operation === 'repair-recovery') return ['UNDER_REPAIR', 'COMPLETED'].includes(order.status) ? 'resolved' : 'unresolved';
    if (marker.operation === 'evidence-delete') {
      const list = deps.coordinator.getSnapshot()?.resources.evidence;
      return list?.status === 'ready' && !list.data.some(e => e.id === marker.entityId) ? 'resolved' : 'unresolved';
    }
    const type = marker.operation === 'face-upload' ? 'CHECKIN_FACE' : marker.operation === 'before-upload' ? 'BEFORE' : null;
    return type && marker.resultEntityId && ownedEvidence(key)?.some(e => e.id === marker.resultEntityId && e.type === type) ? 'resolved' : 'unresolved';
  }
  async function run(operation: OrderCommandOperation, command: (key: OrderSessionKey, intentId: string) => Promise<unknown>, resources: OrderResourceKind[] = [], entityId?: string, knownFailure: () => boolean = () => false, inputCurrent: () => boolean = () => true, precommitNoEffect: () => boolean = () => false) {
    const key = deps.getKey(); if (busy || !key || !sameKey(key)) return;
    busy = true; publish({ phase: 'verifying', operation, message: null });
    let sent = false;
    try {
      await deps.journal.restore(); if (!sameKey(key)) return;
      if (deps.journal.hasUnresolved(key)) { publish({ phase: 'unknown', operation, message: unknownMessage }); return; }
      await refresh(key, resources);
      if (!allowed(key, operation, entityId)) {
        why(key, operation);
        publish({ phase: 'denied', operation, message: operation === 'repair-recovery' && !deps.coordinator.getSnapshot()?.proofPolicy
          ? 'Chưa xác minh được số ảnh hệ thống yêu cầu. Hãy làm mới, chụp thêm ảnh khi cần hoặc liên hệ hỗ trợ.' : 'Điều kiện hiện tại chưa cho phép thao tác. Hãy làm mới hoặc kiểm tra phân công, vị trí và bằng chứng.' }); return;
      }
      const intentId = deps.newIntentId();
      const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: k => !!currentOrder(k), refresh: k => refresh(k, resources) });
      publish({ phase: 'submitting', operation, message: null });
      await adapter.dispatch(key, { intentId, entityId: entityId ?? key.serviceOrderId, operation }, async () => {
        // Storage and resource awaits can cross a reassignment or phase change.
        if (!allowed(key, operation, entityId) || !inputCurrent()) { why(key, operation); return; }
        sent = true; return command(key, intentId);
      }, () => {
        if (!sent) return 'failed-known';
        const proof = verdict(key, deps.journal.list(key.userId).find(m => m.intentId === intentId)!);
        return proof === 'resolved' ? proof : currentOrder(key) && knownFailure() ? 'failed-known' : proof;
      });
      // Endpoint-specific error proof survives a failed GET or lost UI ownership.
      // Release only this captured attempt; future commands still run fresh preflight.
      if (sent && precommitNoEffect()) {
        const ownMarker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
        if (ownMarker && ownMarker.status !== 'resolved') await deps.journal.mark(key.userId, intentId, 'failed-known');
      }
      if (!sameKey(key)) return;
      const marker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
      if (__DEV__) console.warn('[arrival-proof] result', operation, JSON.stringify({ sent, marker: marker?.status }));
      publish({ phase: marker?.status === 'resolved' ? 'resolved' : marker?.status === 'failed-known' ? 'denied' : 'unknown', operation,
        message: marker?.status === 'unknown' ? unknownMessage : !sent && marker?.status === 'failed-known' ? 'Chưa gửi được: điều kiện hiện tại chưa cho phép. Hãy làm mới đơn rồi thử lại.' : null });
    } catch { if (sameKey(key)) publish({ phase: 'unknown', operation, message: unknownMessage }); }
    finally { busy = false; }
  }
  async function upload(operation: 'face-upload' | 'before-upload', asset: CameraOrderAsset, options?: BeforeUploadOptions) {
    if (asset.source !== 'camera' || !asset.uri || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.type)
      || !Number.isFinite(asset.sizeBytes) || asset.sizeBytes <= 0 || asset.sizeBytes > 10 * 1024 * 1024) {
      publish({ phase: 'denied', operation, message: 'Hãy chụp ảnh bằng camera, định dạng JPEG/PNG/WebP và dung lượng không quá 10 MB.' }); return;
    }
    // Only a validation-class answer from the server proves nothing was stored; a dropped request or 5xx stays unknown.
    let rejected = false;
    await run(operation, async (key, intentId) => {
      const image = { uri: asset.uri, name: asset.name, type: asset.type };
      let result: unknown;
      try {
        result = await (operation === 'face-upload' ? deps.transport.uploadFace(key.serviceOrderId, image) : deps.transport.uploadBefore(key.serviceOrderId, image, options));
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        rejected = !!status && [400, 403, 413, 415, 422].includes(status);
        if (__DEV__) { const e = error as { code?: string; message?: string; response?: { status?: number } }; console.warn('[arrival-proof] POST failed', operation, JSON.stringify({ status: e.response?.status, code: e.code, message: e.message })); }
        throw error;
      }
      if (__DEV__) console.warn('[arrival-proof] POST ok', operation, JSON.stringify({ hasId: typeof responseRecord(result)?.id === 'string' }));
      const id = responseRecord(result)?.id;
      if (typeof id === 'string') await deps.journal.recordEntity(key.userId, intentId, id);
    }, ['evidence'], undefined, () => rejected, undefined, () => rejected);
    if (state.phase === 'denied' && !state.message) publish({ phase: 'denied', operation, message: 'Chưa gửi được ảnh. Ảnh chưa được lưu; hãy chụp lại và gửi lại.' });
  }
  return {
    getState: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async depart() {
      let rejected = false;
      await run('en-route', async key => {
        try { return await deps.transport.depart(key.serviceOrderId); }
        catch (error) {
          if (!isDeparturePrecommitRejection(error)) throw error;
          rejected = true;
        }
      }, [], undefined, () => rejected, undefined, () => rejected);
      if (rejected && state.phase === 'denied') publish({ phase: 'denied', operation: 'en-route',
        message: 'Hệ thống chưa cho phép xuất phát. Hãy làm mới giờ được phép và phân công trước khi thử lại.' });
    },
    async checkIn(position: FreshOrderPosition) {
      if (!isFreshOrderPosition(position, now()) || position.timestamp === lastRejectedSample) {
        publish({ phase: 'denied', operation: 'check-in', message: 'Cần quyền vị trí và một mẫu GPS mới từ thiết bị. Hãy lấy lại vị trí hoặc mở cài đặt.' }); return;
      }
      let rejected = false;
      let rejection: string | null = null;
      await run('check-in', async (key) => {
        const result = responseRecord(await deps.transport.checkIn(key.serviceOrderId, {
          lat: position.lat, lng: position.lng, accuracyMeters: position.accuracyMeters,
          ...(position.deviceInfo ? { deviceInfo: position.deviceInfo } : {}),
        }));
        if (result?.serviceOrderId === key.serviceOrderId && result.technicianId === key.userId
          && ['LOW_ACCURACY', 'OUT_OF_GEOFENCE'].includes(String(result.result).toUpperCase())) {
          lastRejectedSample = position.timestamp;
          rejected = true;
          rejection = String(result.result).toUpperCase();
        }
      }, [], undefined, () => rejected, () => isFreshOrderPosition(position, now()));
      if (rejected && state.phase === 'denied') publish({ phase: 'denied', operation: 'check-in', message: rejection === 'LOW_ACCURACY'
        ? 'GPS chưa đủ chính xác. Hãy ra vị trí thoáng và lấy mẫu vị trí mới.'
        : 'Vị trí hiện tại nằm ngoài phạm vi được hệ thống cho phép. Hãy kiểm tra điểm hẹn và lấy mẫu vị trí mới.' });
    },
    uploadFace: (asset: CameraOrderAsset) => upload('face-upload', asset),
    uploadBefore: (asset: CameraOrderAsset, options?: BeforeUploadOptions) => upload('before-upload', asset, options),
    recoverRepair: (confirmed: boolean) => confirmed ? run('repair-recovery', key => deps.transport.recoverRepair(key.serviceOrderId), ['evidence', 'extras', 'quotations']) : Promise.resolve(),
    deleteBefore: (evidenceId: string, confirmed: boolean) => confirmed ? run('evidence-delete', key => deps.transport.deleteEvidence(key.serviceOrderId, evidenceId), ['evidence'], evidenceId) : Promise.resolve(),
    async verify() {
      const key = deps.getKey(); if (!key || busy || !sameKey(key)) return;
      busy = true; publish({ phase: 'verifying', message: null });
      try {
        await deps.journal.restore(); if (!sameKey(key)) return;
        const markers = deps.journal.list(key.userId).filter(m => m.serviceOrderId === key.serviceOrderId && ['submitting', 'verifying', 'unknown'].includes(m.status));
        const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: sameKey, refresh: k => refresh(k, ['evidence']) });
        for (const marker of markers) await adapter.verify(key, marker.intentId, () => verdict(key, marker));
        if (sameKey(key)) publish({ phase: markers.length && !deps.journal.hasUnresolved(key) ? 'resolved' : deps.journal.hasUnresolved(key) ? 'unknown' : 'idle', message: deps.journal.hasUnresolved(key) ? unknownMessage : null });
      } catch { if (sameKey(key)) publish({ phase: 'unknown', message: unknownMessage }); }
      finally { busy = false; }
    },
  };
}
export type ArrivalProofController = ReturnType<typeof createArrivalProofController>;
