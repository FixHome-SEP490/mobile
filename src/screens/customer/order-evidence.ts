import type { EvidenceResponse } from '../../api/orders.api';

export type EvidenceKind = 'BEFORE' | 'AFTER' | 'ADDITIONAL';

export interface EvidencePhoto {
  id: string;
  type: EvidenceKind;
  /** Fresh short-lived signed HTTPS URL; never persisted beyond the focused screen. */
  uri: string;
  note: string | null;
}

export interface EvidenceState {
  photos: EvidencePhoto[];
  loading: boolean;
  error: string | null;
  /** Real read-only retry affordance; false when unauthorized (button disabled). */
  canRetry: boolean;
  /** Photo ids whose <Image> failed to load: placeholder + explicit retry only. */
  failed: Record<string, true>;
}

export const initialEvidenceState: EvidenceState = {
  photos: [],
  loading: false,
  error: null,
  canRetry: false,
  failed: {},
};

const deniedMessage = 'Không có quyền xem ảnh bằng chứng.';
const unavailableMessage = 'Dịch vụ ảnh tạm thời không khả dụng. Vui lòng thử lại.';
const failedMessage = 'Không thể tải ảnh bằng chứng. Vui lòng thử lại.';

/** Display-only Vietnamese label for a known evidence type. */
export function evidenceTypeLabel(type: EvidenceKind): string {
  switch (type) {
    case 'BEFORE':
      return 'Trước sửa chữa';
    case 'AFTER':
      return 'Sau sửa chữa';
    case 'ADDITIONAL':
      return 'Bổ sung';
  }
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Sanitize raw /evidence rows into renderable photos. Accepts only rows that
 * match the focused order, carry a known type and non-blank id, and expose a
 * fresh `https:` signed URL. Malformed rows never produce a renderable URI, so
 * unsafe/legacy provider URLs cannot reach <Image>, toasts, logs, or clipboard.
 */
export function sanitizeEvidenceRows(
  serviceOrderId: string,
  rows: unknown,
): EvidencePhoto[] {
  if (!Array.isArray(rows)) return [];
  const photos: EvidencePhoto[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id) continue;
    if (record.serviceOrderId !== serviceOrderId) continue;
    const type =
      typeof record.type === 'string' ? record.type.toUpperCase() : '';
    if (type !== 'BEFORE' && type !== 'AFTER' && type !== 'ADDITIONAL') continue;
    const uri =
      typeof record.mediaUrl === 'string' ? record.mediaUrl.trim() : '';
    if (!uri.startsWith('https://') || /\s/.test(uri)) continue;
    const note =
      typeof record.note === 'string' && record.note.trim().length > 0
        ? record.note
        : null;
    photos.push({ id, type, uri, note });
  }
  return photos;
}

/**
 * Shared READ-ONLY evidence controller used by both real detail screens.
 *
 * The parent detail loader owns session/auth/lifecycle; this controller only
 * issues `GET /service-orders/:id/evidence` when the caller confirms the order
 * detail is already authorized for the current user, the same real
 * ServiceOrder UUID, and (technician) a non-historical payload via `isReadable`.
 * No camera, picker, upload, GPS, payment, or persistence lives here.
 */
export function createOrderEvidenceController(
  getEvidence: (id: string) => Promise<EvidenceResponse[]>,
  write: (state: EvidenceState) => void,
) {
  let state: EvidenceState = { ...initialEvidenceState, failed: {} };
  let activeOrderId: string | null = null;
  let loadedFor: string | null = null;
  let generation = 0;
  let inFlight: Promise<void> | null = null;

  const isClean =
    () =>
      activeOrderId === null &&
      loadedFor === null &&
      inFlight === null &&
      !state.loading &&
      state.error === null &&
      state.photos.length === 0 &&
      !state.canRetry &&
      Object.keys(state.failed).length === 0;

  const publish = (patch: Partial<EvidenceState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function purge() {
    generation += 1;
    inFlight = null;
    activeOrderId = null;
    loadedFor = null;
    if (isClean()) return;
    state = { photos: [], loading: false, error: null, canRetry: false, failed: {} };
    write(state);
  }

  async function load(
    target: string,
    gen: number,
    isReadable: () => boolean,
  ): Promise<void> {
    publish({ loading: true, error: null });
    try {
      const rows = await getEvidence(target);
      if (gen !== generation || activeOrderId !== target) return;
      if (!isReadable()) {
        purge();
        return;
      }
      loadedFor = target;
      publish({ photos: sanitizeEvidenceRows(target, rows), loading: false, error: null, canRetry: false, failed: {} });
    } catch (error) {
      if (gen !== generation || activeOrderId !== target) return;
      if (!isReadable()) {
        purge();
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        generation += 1;
        inFlight = null;
        activeOrderId = null;
        loadedFor = null;
        state = { photos: [], loading: false, error: deniedMessage, canRetry: false, failed: {} };
        write(state);
        return;
      }
      loadedFor = null;
      publish({
        loading: false,
        error: status === 503 ? unavailableMessage : failedMessage,
        canRetry: true,
      });
    }
  }

  function startLoad(target: string, isReadable: () => boolean): Promise<void> {
    const gen = ++generation;
    const request = load(target, gen, isReadable).then(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    return request;
  }

  return {
    focusEvidence(orderId: string, isReadable: () => boolean): Promise<void> {
      if (!isReadable()) {
        purge();
        return Promise.resolve();
      }
      if (activeOrderId === orderId && inFlight) return inFlight;
      // One GET per successful focus: skip a duplicate focus for the already
      // loaded order. Blur purges, so refocus always reissues a fresh GET and
      // rotates the 300s signed URLs.
      if (activeOrderId === orderId && loadedFor === orderId) {
        return Promise.resolve();
      }
      activeOrderId = orderId;
      return startLoad(orderId, isReadable);
    },
    /** Full-detail refresh may refetch evidence once for the same authorized order. */
    refreshEvidence(isReadable: () => boolean): Promise<void> {
      const target = activeOrderId;
      if (!target) return Promise.resolve();
      if (inFlight) return inFlight;
      if (!isReadable()) {
        purge();
        return Promise.resolve();
      }
      return startLoad(target, isReadable);
    },
    blurEvidence(): void {
      purge();
    },
    /** <Image> onError marks a placeholder; only an explicit retry re-GETs. */
    markImageFailed(photoId: string): void {
      if (!photoId || state.failed[photoId]) return;
      if (!state.photos.some((photo) => photo.id === photoId)) return;
      state = { ...state, failed: { ...state.failed, [photoId]: true } };
      write(state);
    },
  };
}
