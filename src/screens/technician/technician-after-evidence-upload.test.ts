import type { EvidenceResponse } from '../../api/orders.api';
import {
  afterUploadTarget,
  createAfterEvidenceUploadController,
  initialAfterUploadState,
  type AfterEvidenceUploadDeps,
  type AfterUploadState,
} from './technician-after-evidence-upload';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
let technicianSequence = 0;

const activeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  completionRequestedAt: null,
  historical: false,
  ...overrides,
});

const picked = () => ({
  canceled: false as const,
  asset: {
    uri: 'file:///cache/after.jpg',
    mimeType: 'image/jpeg',
    fileSize: 500000,
  },
});

function evidence(
  id: string,
  type: 'BEFORE' | 'AFTER' | 'ADDITIONAL' = 'AFTER',
): EvidenceResponse {
  return {
    id,
    serviceOrderId: ORDER_ID,
    type,
    mediaUrl: `https://signed.example/${id}`,
    createdAt: '2030-01-01T00:00:00Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

interface Harness {
  deps: AfterEvidenceUploadDeps;
  controller: ReturnType<typeof createAfterEvidenceUploadController>;
  setOrder: (value: ReturnType<typeof activeOrder> | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => AfterUploadState;
}

function setup(): Harness {
  let order: ReturnType<typeof activeOrder> | null = activeOrder();
  let technicianId: string | null = 'tech-' + ++technicianSequence;
  let focused = true;
  let readCount = 0;
  const write = jest.fn<void, [AfterUploadState]>();

  const deps: AfterEvidenceUploadDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    requestPermission: jest.fn().mockResolvedValue('granted'),
    launchPicker: jest.fn().mockResolvedValue(picked()),
    uploadAfter: jest.fn().mockResolvedValue({
      id: 'after-new',
      mediaUrl: 'storage://private/after-new',
    }),
    getEvidence: jest.fn().mockImplementation(async () => {
      readCount += 1;
      return readCount === 1 ? [] : [evidence('after-new')];
    }),
    refreshEvidence: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };

  const controller = createAfterEvidenceUploadController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => {
      order = value;
    },
    setTechnicianId: (value) => {
      technicianId = value;
    },
    setFocused: (value) => {
      focused = value;
    },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const uploadAfter = (h: Harness) => h.deps.uploadAfter as jest.Mock;
const getEvidence = (h: Harness) => h.deps.getEvidence as jest.Mock;
const refreshEvidence = (h: Harness) => h.deps.refreshEvidence as jest.Mock;
const notify = (h: Harness) => h.deps.notify as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

describe('afterUploadTarget', () => {
  it('allows only active UNDER_REPAIR before completion request', () => {
    expect(afterUploadTarget(activeOrder())).toBe(ORDER_ID);
    expect(afterUploadTarget(activeOrder({ status: 'EN_ROUTE' }))).toBeNull();
    expect(afterUploadTarget(activeOrder({ historical: true }))).toBeNull();
    expect(
      afterUploadTarget(
        activeOrder({ completionRequestedAt: '2030-01-01T00:00:00Z' }),
      ),
    ).toBeNull();
    expect(afterUploadTarget(activeOrder({ id: 'not-a-uuid' }))).toBeNull();
    expect(afterUploadTarget(null)).toBeNull();
  });
});

describe('AFTER evidence upload receipt', () => {
  it('exposes only bounded picker/upload/reconcile controls', () => {
    const h = setup();
    expect(Object.keys(h.controller).sort()).toEqual(
      [
        'discard',
        'pickFromCamera',
        'pickFromGallery',
        'reconcile',
        'upload',
      ].sort(),
    );
    expect(initialAfterUploadState).toEqual({
      pending: null,
      busy: false,
      error: null,
      needsVerify: false,
    });
  });

  it('does not POST until the technician explicitly uploads a selected image', async () => {
    const h = setup();
    await h.controller.pickFromCamera();
    expect(uploadAfter(h)).not.toHaveBeenCalled();
    expect(h.state().pending).toMatchObject({
      uri: 'file:///cache/after.jpg',
      mime: 'image/jpeg',
    });
  });

  it('requires a pre-POST evidence baseline; failed GET means zero POST', async () => {
    const h = setup();
    await h.controller.pickFromCamera();
    getEvidence(h).mockRejectedValueOnce(new Error('offline'));

    await h.controller.upload();

    expect(uploadAfter(h)).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({
      needsVerify: false,
      pending: expect.any(Object),
    });
  });

  it('does not call a 201 ACK verified until GET contains its evidence id', async () => {
    const h = setup();
    getEvidence(h).mockResolvedValue([]);
    await h.controller.pickFromCamera();

    await h.controller.upload();

    expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
    expect(refreshEvidence(h)).not.toHaveBeenCalled();
    expect(h.state().needsVerify).toBe(true);
    expect(JSON.stringify(h.state())).not.toContain('storage://');

    getEvidence(h).mockResolvedValue([evidence('after-new')]);
    await h.controller.reconcile();

    expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
    expect(refreshEvidence(h)).toHaveBeenCalledTimes(1);
    expect(h.state()).toMatchObject({
      pending: null,
      needsVerify: false,
      error: null,
    });
    expect(notify(h).mock.calls.at(-1)?.[0]).toBe(
      'Đã xác minh ảnh AFTER',
    );
  });

  it('reconciles a lost ACK from exactly one new AFTER id without repost', async () => {
    const h = setup();
    getEvidence(h)
      .mockResolvedValueOnce([evidence('old-after')])
      .mockResolvedValueOnce([
        evidence('old-after'),
        evidence('after-new'),
        evidence('before-only', 'BEFORE'),
      ]);
    await h.controller.pickFromCamera();
    uploadAfter(h).mockRejectedValue(new Error('lost ack'));

    await h.controller.upload();

    expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
    expect(refreshEvidence(h)).toHaveBeenCalledTimes(1);
    expect(h.state()).toMatchObject({
      pending: null,
      needsVerify: false,
    });
  });

  it('keeps ambiguous POST locked when GET has zero or multiple possible new AFTER rows', async () => {
    const h = setup();
    getEvidence(h)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        evidence('after-a'),
        evidence('after-b'),
      ]);
    await h.controller.pickFromCamera();
    uploadAfter(h).mockRejectedValue({ response: { status: 500 } });

    await h.controller.upload();
    await h.controller.upload();

    expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
    expect(h.state().needsVerify).toBe(true);
    expect(refreshEvidence(h)).not.toHaveBeenCalled();
  });

  it.each([400, 404, 409, 422])(
    'releases the attempt after definitive Backend rejection %s',
    async (status) => {
      const h = setup();
      await h.controller.pickFromCamera();
      uploadAfter(h).mockRejectedValue({ response: { status } });

      await h.controller.upload();

      expect(uploadAfter(h)).toHaveBeenCalledTimes(1);
      expect(h.state().needsVerify).toBe(false);
      expect(h.state().error).toContain(String(status));
    },
  );

  it.each([401, 403])(
    'purges private selection and access on %s',
    async (status) => {
      const h = setup();
      await h.controller.pickFromCamera();
      uploadAfter(h).mockRejectedValue({ response: { status } });

      await h.controller.upload();

      expect(denied(h)).toHaveBeenCalledTimes(1);
      expect(h.state().pending).toBeNull();
      expect(JSON.stringify(h.state())).not.toContain('file:///');
    },
  );

  it('drops a stale response after account switch without notify or refresh', async () => {
    const h = setup();
    const gate = deferred<unknown>();
    await h.controller.pickFromCamera();
    uploadAfter(h).mockReturnValueOnce(gate.promise);

    const request = h.controller.upload();
    h.setTechnicianId('other-tech');
    (notify(h) as jest.Mock).mockClear();
    (refreshEvidence(h) as jest.Mock).mockClear();

    gate.resolve({
      id: 'after-new',
      mediaUrl: 'storage://private/after-new',
    });
    await request;

    expect(notify(h)).not.toHaveBeenCalled();
    expect(refreshEvidence(h)).not.toHaveBeenCalled();
  });

  it('does not pick or upload once completion was requested', async () => {
    const h = setup();
    h.setOrder(
      activeOrder({
        completionRequestedAt: '2030-01-01T00:00:00Z',
      }),
    );

    await h.controller.pickFromCamera();
    await h.controller.upload();

    expect(uploadAfter(h)).not.toHaveBeenCalled();
  });
});
