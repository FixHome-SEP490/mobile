import {
  BEFORE_EVIDENCE_MAX_BYTES,
  createEvidenceUploadController,
  initialUploadState,
  validateEvidenceAsset,
  type EvidenceUploadDeps,
  type PickerOutcome,
  type UploadState,
} from './technician-evidence-upload';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const activeOrder = () => ({
  id: ORDER_ID,
  status: 'EN_ROUTE',
  arrivalVerified: true,
  historical: false,
});

const asset = (overrides: Record<string, unknown> = {}) => ({
  uri: 'file:///cache/before.jpg',
  mimeType: 'image/jpeg',
  fileSize: 500000,
  ...overrides,
});

const picked = (overrides: Record<string, unknown> = {}): PickerOutcome => ({
  canceled: false,
  asset: asset(overrides),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: EvidenceUploadDeps;
  controller: ReturnType<typeof createEvidenceUploadController>;
  setOrder: (order: { id: string; status: unknown; arrivalVerified: unknown; historical?: unknown } | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => UploadState;
}

/** Exercises the actual production controller the detail screen calls. */
function setup(): Harness {
  let order: { id: string; status: unknown; arrivalVerified: unknown; historical?: unknown } | null = activeOrder();
  let technicianId: string | null = 'tech-1';
  let focused = true;
  const write = jest.fn<void, [UploadState]>();
  const deps: EvidenceUploadDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    requestPermission: jest.fn().mockResolvedValue('granted'),
    launchPicker: jest.fn().mockResolvedValue(picked()),
    uploadBefore: jest.fn().mockResolvedValue({ id: 'ev-new' }),
    refreshEvidence: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createEvidenceUploadController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => { order = value; },
    setTechnicianId: (value) => { technicianId = value; },
    setFocused: (value) => { focused = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const uploadBefore = (h: Harness) => h.deps.uploadBefore as jest.Mock;
const picker = (h: Harness) => h.deps.launchPicker as jest.Mock;
const permission = (h: Harness) => h.deps.requestPermission as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshEvidence as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the BEFORE upload surface: no after/quotation/status/payment', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['discard', 'pickFromCamera', 'pickFromGallery', 'upload'].sort(),
  );
});

it('touches no picker, permission, or POST before an explicit tap', () => {
  const h = setup();
  expect(permission(h)).not.toHaveBeenCalled();
  expect(picker(h)).not.toHaveBeenCalled();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
});

it('picks exactly one photo on tap with no POST until upload is tapped', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  expect(permission(h)).toHaveBeenCalledWith('camera');
  expect(picker(h)).toHaveBeenCalledTimes(1);
  expect(uploadBefore(h)).not.toHaveBeenCalled();
  expect(h.state().pending).toMatchObject({ uri: 'file:///cache/before.jpg', mime: 'image/jpeg' });
  await h.controller.pickFromGallery();
  expect(permission(h)).toHaveBeenCalledWith('gallery');
});

it('stays silent on picker cancel without pending or POST', async () => {
  const h = setup();
  picker(h).mockResolvedValue({ canceled: true });
  await h.controller.pickFromGallery();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
});

it('blocks pick until a valid check-in: gate copy, no picker, no POST', async () => {
  for (const order of [
    { ...activeOrder(), status: 'ACCEPTED' },
    { ...activeOrder(), arrivalVerified: false },
    { ...activeOrder(), arrivalVerified: null },
    { ...activeOrder(), historical: true },
  ]) {
    const h = setup();
    h.setOrder(order);
    await h.controller.pickFromCamera();
    expect(picker(h)).not.toHaveBeenCalled();
    expect(uploadBefore(h)).not.toHaveBeenCalled();
    expect(notified(h).mock.calls[0][1]).toBe('Check-in hợp lệ trước khi tải ảnh.');
  }
});

it('stays silent on pick when logged out, blurred, or order missing', async () => {
  const loggedOut = setup();
  loggedOut.setTechnicianId(null);
  await loggedOut.controller.pickFromCamera();
  expect(picker(loggedOut)).not.toHaveBeenCalled();
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setFocused(false);
  await blurred.controller.pickFromCamera();
  expect(picker(blurred)).not.toHaveBeenCalled();
  expect(notified(blurred)).not.toHaveBeenCalled();

  const missing = setup();
  missing.setOrder(null);
  await missing.controller.pickFromCamera();
  expect(picker(missing)).not.toHaveBeenCalled();
});

it('rejects a malformed order id without picker or POST', async () => {
  const h = setup();
  h.setOrder({ id: 'not-a-uuid', status: 'EN_ROUTE', arrivalVerified: true });
  await h.controller.pickFromCamera();
  expect(picker(h)).not.toHaveBeenCalled();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
});

it.each([
  ['camera denial', 'camera', 'Cần quyền camera'],
  ['gallery denial', 'gallery', 'Cần quyền thư viện ảnh'],
])('stops on %s without opening the picker', async (_label, source, title) => {
  const h = setup();
  permission(h).mockResolvedValue('denied');
  await (source === 'camera' ? h.controller.pickFromCamera() : h.controller.pickFromGallery());
  expect(picker(h)).not.toHaveBeenCalled();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe(title);
});

it('reports unavailable services when permission throws', async () => {
  const h = setup();
  permission(h).mockRejectedValue(new Error('prompt crashed'));
  await h.controller.pickFromCamera();
  expect(picker(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe('Không mở được ảnh');
});

it('drops the pick when the account switches during permission', async () => {
  const h = setup();
  const gate = deferred<'granted'>();
  permission(h).mockReturnValueOnce(gate.promise);
  const attempt = h.controller.pickFromCamera();
  h.setTechnicianId('other-tech');
  gate.resolve('granted');
  await attempt;
  expect(picker(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
});

it('rejects unsupported, unknown, oversize, and unreadable files without pending', async () => {
  const cases: [string, Record<string, unknown>][] = [
    ['gif', { mimeType: 'image/gif' }],
    ['unknown mime and extension', { mimeType: 'application/octet-stream', uri: 'file:///cache/blob.bin' }],
    ['missing mime and extension', { mimeType: undefined, uri: 'file:///cache/blob' }],
    ['missing uri', { uri: '' }],
    ['missing size', { fileSize: undefined }],
    ['zero size', { fileSize: 0 }],
    ['negative size', { fileSize: -10 }],
    ['oversize', { fileSize: BEFORE_EVIDENCE_MAX_BYTES + 1 }],
  ];
  for (const entry of cases) {
    const overrides = entry[1];
    const h = setup();
    picker(h).mockResolvedValue(picked(overrides));
    await h.controller.pickFromCamera();
    expect(uploadBefore(h)).not.toHaveBeenCalled();
    expect(notified(h).mock.calls[0][0]).toBe('Ảnh chưa hợp lệ');
  }
});

it('accepts exactly the 10 MiB boundary and extension fallback without MIME', async () => {
  const boundary = setup();
  picker(boundary).mockResolvedValue(picked({ fileSize: BEFORE_EVIDENCE_MAX_BYTES }));
  await boundary.controller.pickFromCamera();
  expect(boundary.state().pending).toMatchObject({ sizeBytes: BEFORE_EVIDENCE_MAX_BYTES });

  const fallback = setup();
  picker(fallback).mockResolvedValue(picked({ mimeType: undefined, uri: 'file:///cache/shot.PNG' }));
  await fallback.controller.pickFromGallery();
  expect(fallback.state().pending).toMatchObject({ mime: 'image/png', name: 'shot.PNG' });
});

it('uploads once on tap, ignores the raw storage body, and refreshes signed GET photos', async () => {
  const h = setup();
  uploadBefore(h).mockResolvedValue({ id: 'ev-x', mediaUrl: 'storage://bucket/ev-x' });
  await h.controller.pickFromCamera();
  await h.controller.upload();
  expect(uploadBefore(h)).toHaveBeenCalledTimes(1);
  expect(uploadBefore(h)).toHaveBeenCalledWith(
    ORDER_ID,
    { uri: 'file:///cache/before.jpg', name: 'before.jpg', type: 'image/jpeg' },
  );
  const rendered = JSON.stringify(h.state());
  expect(rendered).not.toMatch(/storage:\/\//);
  expect(h.state()).toMatchObject({ pending: null, busy: false, error: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Đã tải ảnh');
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('does nothing on upload without a selected photo', async () => {
  const h = setup();
  await h.controller.upload();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
});

it('throttles duplicate upload taps to a single POST', async () => {
  const h = setup();
  const gate = deferred<unknown>();
  uploadBefore(h).mockReturnValueOnce(gate.promise);
  await h.controller.pickFromCamera();
  const first = h.controller.upload();
  const second = h.controller.upload();
  gate.resolve({ id: 'ev-1' });
  await Promise.all([first, second]);
  expect(uploadBefore(h)).toHaveBeenCalledTimes(1);
});

it('drops the selection without POST when blurred before upload', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  h.setFocused(false);
  await h.controller.upload();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
  expect(h.state().pending).toBeNull();
});

it('drops the selection without POST when the account switches before upload', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  h.setTechnicianId('other-tech');
  await h.controller.upload();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
});

it('discards a stale POST response after logout without notify or refresh', async () => {
  const h = setup();
  const gate = deferred<unknown>();
  uploadBefore(h).mockReturnValueOnce(gate.promise);
  await h.controller.pickFromCamera();
  const attempt = h.controller.upload();
  h.setTechnicianId(null);
  gate.resolve({ id: 'ev-1', mediaUrl: 'storage://bucket/ev-1' });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().pending).toBeNull();
});

it.each([401, 403])('purges the selection on %s with re-login copy', async (status) => {
  const h = setup();
  await h.controller.pickFromCamera();
  uploadBefore(h).mockRejectedValue({ response: { status } });
  await h.controller.upload();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({ pending: null, busy: false });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
  const rendered = JSON.stringify(h.state());
  expect(rendered).not.toMatch(/file:\/\/\//);
});

it('reports 503 as unavailable, keeps the selection for a user retry, reconciles GET only', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  uploadBefore(h).mockRejectedValue({ response: { status: 503 } });
  await h.controller.upload();
  expect(uploadBefore(h)).toHaveBeenCalledTimes(1);
  expect(h.state().pending).not.toBeNull();
  expect(h.state().error).toMatch(/không khả dụng/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])('never auto-reposts on ambiguous failure %s and directs evidence reload first', async (_label, error) => {
  const h = setup();
  await h.controller.pickFromCamera();
  uploadBefore(h).mockRejectedValue(error);
  await h.controller.upload();
  expect(uploadBefore(h)).toHaveBeenCalledTimes(1);
  expect(h.state().pending).not.toBeNull();
  expect(h.state().error).toMatch(/tải lại bằng chứng/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('discard drops the pending selection without POST', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  h.controller.discard();
  expect(h.state().pending).toBeNull();
  await h.controller.upload();
  expect(uploadBefore(h)).not.toHaveBeenCalled();
});

describe('validateEvidenceAsset (production helper)', () => {
  it('derives a safe fallback name when the URI has no image extension', () => {
    expect(validateEvidenceAsset(asset({ uri: 'content://media/7', mimeType: 'image/webp', fileSize: 10 })))
      .toMatchObject({ name: 'before-evidence.webp', mime: 'image/webp' });
  });

  it('rejects an empty URI', () => {
    expect(validateEvidenceAsset(asset({ uri: '' }))).toMatchObject({ error: expect.any(String) });
  });
});

it('shares the initial state shape', () => {
  expect(initialUploadState).toMatchObject({ pending: null, busy: false, error: null });
});
