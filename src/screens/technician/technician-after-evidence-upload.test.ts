import {
  afterUploadTarget,
  createAfterEvidenceUploadController,
  initialAfterUploadState,
  type AfterEvidenceUploadDeps,
  type AfterUploadState,
} from './technician-after-evidence-upload';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const activeOrder = () => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  completionRequestedAt: null,
  historical: false,
});

const picked = (overrides: Record<string, unknown> = {}) => ({
  canceled: false as const,
  asset: {
    uri: 'file:///cache/after.jpg',
    mimeType: 'image/jpeg',
    fileSize: 500000,
    ...overrides,
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: AfterEvidenceUploadDeps;
  controller: ReturnType<typeof createAfterEvidenceUploadController>;
  setOrder: (order: { id: string; status: unknown; completionRequestedAt: unknown; historical?: unknown } | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => AfterUploadState;
}

/** Exercises the actual production AFTER controller the detail screen calls. */
function setup(): Harness {
  let order: { id: string; status: unknown; completionRequestedAt: unknown; historical?: unknown } | null = activeOrder();
  let technicianId: string | null = 'tech-1';
  let focused = true;
  const write = jest.fn<void, [AfterUploadState]>();
  const deps: AfterEvidenceUploadDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    requestPermission: jest.fn().mockResolvedValue('granted'),
    launchPicker: jest.fn().mockResolvedValue(picked()),
    uploadAfter: jest.fn().mockResolvedValue({ id: 'ev-after' }),
    refreshEvidence: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createAfterEvidenceUploadController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => { order = value; },
    setTechnicianId: (value) => { technicianId = value; },
    setFocused: (value) => { focused = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const uploadAfter = (h: Harness) => h.deps.uploadAfter as jest.Mock;
const picker = (h: Harness) => h.deps.launchPicker as jest.Mock;
const permission = (h: Harness) => h.deps.requestPermission as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshEvidence as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the AFTER upload surface: no completion/payment/status', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['discard', 'pickFromCamera', 'pickFromGallery', 'upload'].sort(),
  );
});

it('touches no picker, permission, or POST before an explicit tap', () => {
  const h = setup();
  expect(permission(h)).not.toHaveBeenCalled();
  expect(picker(h)).not.toHaveBeenCalled();
  expect(uploadAfter(h)).not.toHaveBeenCalled();
});

it('picks one photo and uploads with a second explicit tap, then refreshes signed GET', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  expect(permission(h)).toHaveBeenCalledWith('camera');
  expect(picker(h)).toHaveBeenCalledTimes(1);
  expect(uploadAfter(h)).not.toHaveBeenCalled();
  expect(h.state().pending).toMatchObject({ uri: 'file:///cache/after.jpg', mime: 'image/jpeg' });
  uploadAfter(h).mockResolvedValue({ id: 'ev-x', mediaUrl: 'storage://bucket/ev-x' });
  await h.controller.upload();
  expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
  expect(uploadAfter(h)).toHaveBeenCalledWith(
    ORDER_ID,
    { uri: 'file:///cache/after.jpg', name: 'after.jpg', type: 'image/jpeg' },
  );
  expect(JSON.stringify(h.state())).not.toMatch(/storage:\/\//);
  expect(h.state()).toMatchObject({ pending: null, busy: false, error: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Đã tải ảnh');
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['EN_ROUTE order (BEFORE lane, never relaxed)', { status: 'EN_ROUTE', completionRequestedAt: null }],
  ['ACCEPTED order', { status: 'ACCEPTED', completionRequestedAt: null }],
  ['COMPLETED order', { status: 'COMPLETED', completionRequestedAt: null }],
  ['completion already requested', { status: 'UNDER_REPAIR', completionRequestedAt: '2030-10-21T12:00:00Z' }],
  ['historical summary', { status: 'UNDER_REPAIR', completionRequestedAt: null, historical: true }],
  ['malformed order id', { id: 'not-a-uuid', status: 'UNDER_REPAIR', completionRequestedAt: null }],
])('blocks pick for %s without picker or POST', async (_label, overrides) => {
  const h = setup();
  h.setOrder({ ...activeOrder(), ...overrides });
  await h.controller.pickFromCamera();
  expect(picker(h)).not.toHaveBeenCalled();
  expect(uploadAfter(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][1]).toMatch(/đang sửa và chưa yêu cầu hoàn thành/);
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

it('stops on permission denial or unavailable services without POST', async () => {
  const h = setup();
  permission(h).mockResolvedValue('denied');
  await h.controller.pickFromGallery();
  expect(picker(h)).not.toHaveBeenCalled();
  expect(uploadAfter(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe('Cần quyền thư viện ảnh');

  const h2 = setup();
  permission(h2).mockRejectedValue(new Error('prompt crashed'));
  await h2.controller.pickFromCamera();
  expect(uploadAfter(h2)).not.toHaveBeenCalled();
});

it('rejects oversize and unknown files without pending', async () => {
  const oversize = setup();
  picker(oversize).mockResolvedValue(picked({ fileSize: 10 * 1024 * 1024 + 1 }));
  await oversize.controller.pickFromCamera();
  expect(uploadAfter(oversize)).not.toHaveBeenCalled();
  expect(notified(oversize).mock.calls[0][0]).toBe('Ảnh chưa hợp lệ');

  const unknown = setup();
  picker(unknown).mockResolvedValue(picked({ mimeType: 'image/gif', uri: 'file:///cache/anim.gif' }));
  await unknown.controller.pickFromCamera();
  expect(uploadAfter(unknown)).not.toHaveBeenCalled();
});

it('drops the pick when the account switches during permission', async () => {
  const h = setup();
  const gatePromise = deferred<'granted'>();
  permission(h).mockReturnValueOnce(gatePromise.promise);
  const attempt = h.controller.pickFromCamera();
  h.setTechnicianId('other-tech');
  gatePromise.resolve('granted');
  await attempt;
  expect(picker(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
});

it('drops the selection without POST when blurred or the account switches before upload', async () => {
  const blurred = setup();
  await blurred.controller.pickFromCamera();
  blurred.setFocused(false);
  await blurred.controller.upload();
  expect(uploadAfter(blurred)).not.toHaveBeenCalled();
  expect(notified(blurred)).not.toHaveBeenCalled();
  expect(blurred.state().pending).toBeNull();

  const switched = setup();
  await switched.controller.pickFromCamera();
  switched.setTechnicianId('other-tech');
  await switched.controller.upload();
  expect(uploadAfter(switched)).not.toHaveBeenCalled();
  expect(notified(switched)).not.toHaveBeenCalled();
});

it('drops a completion request arriving between pick and upload', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  h.setOrder({ ...activeOrder(), completionRequestedAt: '2030-10-21T12:00:00Z' });
  await h.controller.upload();
  expect(uploadAfter(h)).not.toHaveBeenCalled();
  expect(h.state().pending).toBeNull();
});

it('throttles duplicate upload taps to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  uploadAfter(h).mockReturnValueOnce(gatePromise.promise);
  await h.controller.pickFromCamera();
  const first = h.controller.upload();
  const second = h.controller.upload();
  gatePromise.resolve({ id: 'ev-1' });
  await Promise.all([first, second]);
  expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
});

it.each([401, 403])('purges the selection on %s with re-login copy', async (status) => {
  const h = setup();
  await h.controller.pickFromCamera();
  uploadAfter(h).mockRejectedValue({ response: { status } });
  await h.controller.upload();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({ pending: null, busy: false });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it('reports 503 as unavailable, keeps the selection, reconciles GET only', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  uploadAfter(h).mockRejectedValue({ response: { status: 503 } });
  await h.controller.upload();
  expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
  expect(h.state().pending).not.toBeNull();
  expect(h.state().error).toMatch(/không khả dụng/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
])('never auto-reposts on ambiguous failure %s', async (_label, error) => {
  const h = setup();
  await h.controller.pickFromCamera();
  uploadAfter(h).mockRejectedValue(error);
  await h.controller.upload();
  expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
  expect(h.state().pending).not.toBeNull();
  expect(h.state().error).toMatch(/tải lại bằng chứng/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('discards a stale POST response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  uploadAfter(h).mockReturnValueOnce(gatePromise.promise);
  await h.controller.pickFromCamera();
  const attempt = h.controller.upload();
  h.setTechnicianId(null);
  gatePromise.resolve({ id: 'ev-1', mediaUrl: 'storage://bucket/ev-1' });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().pending).toBeNull();
});

it('discard drops the pending selection without POST', async () => {
  const h = setup();
  await h.controller.pickFromCamera();
  h.controller.discard();
  expect(h.state().pending).toBeNull();
  await h.controller.upload();
  expect(uploadAfter(h)).not.toHaveBeenCalled();
});

describe('afterUploadTarget (production gate)', () => {
  it.each([
    [{ status: 'under_repair', completionRequestedAt: null }, true],
    [{ status: 'UNDER_REPAIR', completionRequestedAt: undefined }, true],
    [{ status: 'EN_ROUTE', completionRequestedAt: null }, false],
    [{ status: 'UNDER_REPAIR', completionRequestedAt: '2030-10-21T12:00:00Z' }, false],
    [{ status: 'COMPLETED', completionRequestedAt: null }, false],
    [{ historical: true }, false],
    [null, false],
  ])('gate %s', (overrides, expected) => {
    const order = overrides === null ? null : { ...activeOrder(), ...overrides };
    expect(afterUploadTarget(order)).toBe(expected ? ORDER_ID : null);
  });
});

it('shares the initial state shape', () => {
  expect(initialAfterUploadState).toMatchObject({ pending: null, busy: false, error: null });
});
