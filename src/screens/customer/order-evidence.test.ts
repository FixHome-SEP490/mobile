import {
  createOrderEvidenceController,
  evidenceTypeLabel,
  initialEvidenceState,
  sanitizeEvidenceRows,
  type EvidenceState,
} from './order-evidence';
import type { EvidenceResponse } from '../../api/orders.api';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const row = (overrides: Partial<EvidenceResponse> = {}): EvidenceResponse => ({
  id: 'ev-1',
  serviceOrderId: ORDER_ID,
  type: 'BEFORE',
  mediaUrl: 'https://storage.example/signed/ev-1?sig=abc',
  note: 'Vết nứt mặt kính',
  createdAt: '2030-10-21T10:00:00Z',
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Exercises the actual production controller both detail screens call. */
function setup(rows: EvidenceResponse[] = [row()]) {
  const getEvidence = jest.fn<Promise<EvidenceResponse[]>, [string]>().mockResolvedValue(rows);
  const write = jest.fn<void, [EvidenceState]>();
  const controller = createOrderEvidenceController(getEvidence, write);
  let readable = true;
  const isReadable = () => readable;
  const setReadable = (value: boolean) => { readable = value; };
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { getEvidence, write, controller, isReadable, setReadable, state };
}

it('exposes a strictly read-only surface: no upload/post/gps affordance', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['blurEvidence', 'focusEvidence', 'markImageFailed', 'refreshEvidence'].sort(),
  );
});

it('fetches once per authorized focus and renders sanitized photos with labels', async () => {
  const { getEvidence, controller, isReadable, state } = setup([
    row(),
    row({ id: 'ev-2', type: 'AFTER', mediaUrl: 'https://storage.example/signed/ev-2?sig=def', note: undefined }),
    row({ id: 'ev-3', type: 'ADDITIONAL', mediaUrl: 'https://storage.example/signed/ev-3?sig=ghi', note: '' }),
  ]);
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(1);
  expect(getEvidence).toHaveBeenCalledWith(ORDER_ID);
  expect(state()).toMatchObject({ loading: false, error: null, canRetry: false });
  expect(state().photos.map((photo) => photo.id)).toEqual(['ev-1', 'ev-2', 'ev-3']);
  expect(state().photos[0]).toMatchObject({ type: 'BEFORE', note: 'Vết nứt mặt kính' });
  expect(state().photos[1].note).toBeNull();
  expect(evidenceTypeLabel('BEFORE')).toBe('Trước sửa chữa');
  expect(evidenceTypeLabel('AFTER')).toBe('Sau sửa chữa');
  expect(evidenceTypeLabel('ADDITIONAL')).toBe('Bổ sung');
});

it('filters malformed rows so no unsafe URI ever reaches render state', async () => {
  const { controller, isReadable, state } = setup([
    row(),
    row({ id: '  ', mediaUrl: 'https://storage.example/signed/blank?sig=x' }),
    row({ id: 'ev-http', mediaUrl: 'http://insecure.example/ev' }),
    row({ id: 'ev-ftp', mediaUrl: 'ftp://files.example/ev' }),
    row({ id: 'ev-other', serviceOrderId: OTHER_ID, mediaUrl: 'https://storage.example/signed/other?sig=x' }),
    row({ id: 'ev-unknown', type: 'DURING' as unknown as EvidenceResponse['type'], mediaUrl: 'https://storage.example/signed/u?sig=x' }),
    row({ id: 'ev-space', mediaUrl: 'https://storage.example/signed/a b?sig=x' }),
  ]);
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(state().photos.map((photo) => photo.id)).toEqual(['ev-1']);
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/insecure\.example|files\.example/);
});

it('shows an honest empty state for zero items without error or retry', async () => {
  const { controller, isReadable, state } = setup([]);
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ photos: [], loading: false, error: null, canRetry: false });
});

it('tolerates a non-array payload without crashing', async () => {
  const { getEvidence, write, controller, isReadable } = setup();
  getEvidence.mockResolvedValue('not-an-array' as unknown as EvidenceResponse[]);
  await controller.focusEvidence(ORDER_ID, isReadable);
  const state = write.mock.calls[write.mock.calls.length - 1][0];
  expect(state).toMatchObject({ photos: [], loading: false, error: null });
});

it('never GETs for an unauthorized, denied, or historical-gated focus and purges', async () => {
  const { getEvidence, write, controller, isReadable, setReadable, state } = setup();
  await controller.focusEvidence(ORDER_ID, () => false);
  expect(getEvidence).not.toHaveBeenCalled();
  // Already-clean purge writes nothing and holds no photos, error, or retry.
  expect(write).not.toHaveBeenCalled();
  // Historical technician summary: gate stays false, still no GET on refresh.
  await controller.refreshEvidence(() => false);
  expect(getEvidence).not.toHaveBeenCalled();
  // Late-authorized focus after a denial issues exactly one GET.
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(1);
  setReadable(false);
  await controller.refreshEvidence(isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(1);
  expect(state().photos).toEqual([]);
});

it('avoids focus double-load yet rotates signed URLs on refocus after blur', async () => {
  const { getEvidence, controller, isReadable, state } = setup();
  const first = controller.focusEvidence(ORDER_ID, isReadable);
  const second = controller.focusEvidence(ORDER_ID, isReadable);
  await Promise.all([first, second]);
  expect(getEvidence).toHaveBeenCalledTimes(1);
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(1);
  getEvidence.mockResolvedValue([row({ id: 'ev-fresh', mediaUrl: 'https://storage.example/signed/fresh?sig=new' })]);
  controller.blurEvidence();
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(2);
  expect(state().photos.map((photo) => photo.id)).toEqual(['ev-fresh']);
});

it('drops a stale GET that resolves after blur so old-account photos never return', async () => {
  const { getEvidence, write, controller, isReadable } = setup();
  const pending = deferred<EvidenceResponse[]>();
  getEvidence.mockReturnValueOnce(pending.promise);
  const first = controller.focusEvidence(ORDER_ID, isReadable);
  controller.blurEvidence();
  write.mockClear();
  pending.resolve([row()]);
  await first;
  expect(write).not.toHaveBeenCalled();
  // A fresh authorized focus afterwards loads current-order photos only.
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(2);
  const last = write.mock.calls[write.mock.calls.length - 1][0];
  expect(last.photos.map((photo: { id: string }) => photo.id)).toEqual(['ev-1']);
});

it('purges when the gate flips mid-flight (logout/user switch) instead of rendering', async () => {
  const { getEvidence, write, controller, isReadable, setReadable } = setup();
  const pending = deferred<EvidenceResponse[]>();
  getEvidence.mockReturnValueOnce(pending.promise);
  const request = controller.focusEvidence(ORDER_ID, isReadable);
  setReadable(false);
  pending.resolve([row()]);
  await request;
  expect(write.mock.calls.length).toBeGreaterThan(0);
  const last = write.mock.calls[write.mock.calls.length - 1][0];
  expect(last.photos).toEqual([]);
});

it.each([401, 403])('purges photos on evidence denial %s with retry disabled', async (status) => {
  const { getEvidence, controller, isReadable, state } = setup();
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(state().photos).toHaveLength(1);
  getEvidence.mockRejectedValueOnce({ response: { status } });
  await controller.refreshEvidence(isReadable);
  expect(state()).toMatchObject({ photos: [], loading: false, canRetry: false });
  expect(state().error).toContain('quyền');
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/storage\.example/);
});

it('distinguishes 503 provider outage with a real retry that recovers', async () => {
  const { getEvidence, controller, isReadable, state } = setup();
  getEvidence.mockRejectedValueOnce({ response: { status: 503 } });
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ photos: [], loading: false, canRetry: true });
  expect(state().error).toContain('không khả dụng');
  getEvidence.mockResolvedValue([row({ id: 'ev-retry' })]);
  await controller.refreshEvidence(isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(2);
  expect(state()).toMatchObject({ error: null, canRetry: false });
  expect(state().photos.map((photo) => photo.id)).toEqual(['ev-retry']);
});

it('keeps last-good photos on transient failure and recovers on manual retry', async () => {
  const { getEvidence, controller, isReadable, state } = setup();
  await controller.focusEvidence(ORDER_ID, isReadable);
  getEvidence.mockRejectedValueOnce(new Error('offline'));
  await controller.refreshEvidence(isReadable);
  expect(state().photos.map((photo) => photo.id)).toEqual(['ev-1']);
  expect(state().error).toBeTruthy();
  expect(state().canRetry).toBe(true);
  getEvidence.mockResolvedValue([row({ id: 'ev-new' })]);
  await controller.refreshEvidence(isReadable);
  expect(state()).toMatchObject({ error: null });
  expect(state().photos.map((photo) => photo.id)).toEqual(['ev-new']);
});

it('marks an <Image> load failure as placeholder without auto-refetch; retry GETs fresh URLs', async () => {
  const { getEvidence, controller, isReadable, state } = setup();
  await controller.focusEvidence(ORDER_ID, isReadable);
  controller.markImageFailed('ev-1');
  expect(state().failed).toMatchObject({ 'ev-1': true });
  expect(getEvidence).toHaveBeenCalledTimes(1);
  controller.markImageFailed('ev-1');
  controller.markImageFailed('unknown-id');
  expect(getEvidence).toHaveBeenCalledTimes(1);
  getEvidence.mockResolvedValue([row({ id: 'ev-1', mediaUrl: 'https://storage.example/signed/rotated?sig=new' })]);
  await controller.refreshEvidence(isReadable);
  expect(getEvidence).toHaveBeenCalledTimes(2);
  expect(state().failed).toEqual({});
  expect(state().photos[0]).toMatchObject({ uri: 'https://storage.example/signed/rotated?sig=new' });
});

it('blur purges signed URLs so nothing persists beyond the focused screen', async () => {
  const { controller, isReadable, state } = setup();
  await controller.focusEvidence(ORDER_ID, isReadable);
  expect(JSON.stringify(state())).toMatch(/storage\.example/);
  controller.blurEvidence();
  expect(state()).toMatchObject({ photos: [], loading: false, error: null, canRetry: false, failed: {} });
  expect(JSON.stringify(state())).not.toMatch(/storage\.example/);
});

describe('sanitizeEvidenceRows (production helper)', () => {
  it('uppercases backend type variants and keeps only matching https rows', () => {
    expect(
      sanitizeEvidenceRows(ORDER_ID, [
        { id: 'a', serviceOrderId: ORDER_ID, type: 'before', mediaUrl: 'https://cdn.example/a?sig=1', note: 'ok' },
        { id: 'b', serviceOrderId: ORDER_ID, type: 'AFTER', mediaUrl: 'https://cdn.example/b?sig=1' },
      ]),
    ).toMatchObject([
      { id: 'a', type: 'BEFORE', uri: 'https://cdn.example/a?sig=1', note: 'ok' },
      { id: 'b', type: 'AFTER', uri: 'https://cdn.example/b?sig=1', note: null },
    ]);
  });

  it.each([[null], [undefined], ['rows'], [{ data: [] }]])(
    'returns empty for non-array payload %s',
    (payload) => {
      expect(sanitizeEvidenceRows(ORDER_ID, payload)).toEqual([]);
    },
  );
});

it('shares the initial state shape', () => {
  expect(initialEvidenceState).toMatchObject({ photos: [], loading: false, error: null, canRetry: false });
});
