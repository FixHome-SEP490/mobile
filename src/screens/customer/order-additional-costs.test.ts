import {
  additionalCostStatusLabel,
  costMoneyText,
  createAdditionalCostsController,
  initialAdditionalCostsState,
  sanitizeCostRequest,
  type AdditionalCostsState,
} from './order-additional-costs';
import type { CostRequest } from '../../api/orders.api';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const record = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  serviceOrderId: ORDER_ID,
  status: 'PENDING_APPROVAL',
  reason: 'Thay thêm cảm biến',
  totalLaborDelta: 100000,
  totalPartsDelta: 250000,
  createdAt: '2030-10-21T10:00:00Z',
  expiresAt: '2030-10-23T10:00:00Z',
  items: [
    { id: 'li-1', type: 'PARTS' as const, description: 'Cảm biến', quantity: 1, unitPrice: 250000, lineTotal: 250000 },
  ],
  evidenceUrls: ['https://private.example/secret'],
  technicianId: 'tech-1',
  decidedByCustomerId: 'cust-9',
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Exercises the actual production controller both detail screens call. */
function setup(rows: unknown = [record()]) {
  const getAdditionalCosts = jest.fn<Promise<CostRequest[]>, [string]>().mockResolvedValue(rows as CostRequest[]);
  const write = jest.fn<void, [AdditionalCostsState]>();
  const controller = createAdditionalCostsController(getAdditionalCosts, write);
  let readable = true;
  const isReadable = () => readable;
  const setReadable = (value: boolean) => { readable = value; };
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { getAdditionalCosts, write, controller, isReadable, setReadable, state };
}

it('exposes a strictly read-only surface: no decide/create affordance', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['blurCosts', 'focusCosts', 'refreshCosts'].sort(),
  );
});

it('fetches once per authorized focus and renders the allowlist only', async () => {
  const { getAdditionalCosts, controller, isReadable, state } = setup();
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(getAdditionalCosts).toHaveBeenCalledTimes(1);
  expect(getAdditionalCosts).toHaveBeenCalledWith(ORDER_ID);
  expect(state()).toMatchObject({ loading: false, error: null, canRetry: false });
  expect(state().requests).toHaveLength(1);
  expect(state().requests[0]).toMatchObject({
    id: REQUEST_ID,
    status: 'PENDING_APPROVAL',
    reason: 'Thay thêm cảm biến',
    laborText: expect.stringContaining('100'),
    partsText: expect.stringContaining('250'),
    expiresText: expect.any(String),
  });
  expect(state().requests[0].items).toMatchObject([
    { id: 'li-1', description: 'Cảm biến', quantity: 1 },
  ]);
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/evidenceUrls|private\.example|technicianId|decidedByCustomerId|cust-9/);
  expect(state().requests[0]).not.toHaveProperty('evidenceUrls');
  expect(additionalCostStatusLabel('PENDING_APPROVAL')).toBe('Chờ duyệt');
  expect(additionalCostStatusLabel('APPROVED')).toBe('Đã duyệt');
  expect(additionalCostStatusLabel('REJECTED')).toBe('Đã từ chối');
  expect(additionalCostStatusLabel('EXPIRED')).toBe('Đã hết hạn');
  expect(additionalCostStatusLabel('CANCELLED')).toBe('Đã hủy');
  expect(additionalCostStatusLabel('SUPERSEDED')).toBe('Đã thay thế');
  expect(additionalCostStatusLabel('UNKNOWN')).toBe('Không rõ');
});

it('shows an honest empty state for zero requests without error', async () => {
  const { controller, isReadable, state } = setup([]);
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ requests: [], loading: false, error: null, canRetry: false });
});

it('tolerates a non-array payload without crashing', async () => {
  const { controller, isReadable, state } = setup('not-a-list');
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ requests: [], loading: false, error: null });
});

it('never GETs for an unauthorized or historical-gated focus and purges', async () => {
  const { getAdditionalCosts, write, controller } = setup();
  await controller.focusCosts(ORDER_ID, () => false);
  expect(getAdditionalCosts).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  await controller.refreshCosts(() => false);
  expect(getAdditionalCosts).not.toHaveBeenCalled();
});

it('avoids focus double-load yet refetches on refocus after blur', async () => {
  const { getAdditionalCosts, controller, isReadable, state } = setup();
  const first = controller.focusCosts(ORDER_ID, isReadable);
  const second = controller.focusCosts(ORDER_ID, isReadable);
  await Promise.all([first, second]);
  expect(getAdditionalCosts).toHaveBeenCalledTimes(1);
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(getAdditionalCosts).toHaveBeenCalledTimes(1);
  getAdditionalCosts.mockResolvedValue([record({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })] as CostRequest[]);
  controller.blurCosts();
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(getAdditionalCosts).toHaveBeenCalledTimes(2);
  expect(state().requests.map((request) => request.id)).toEqual(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
});

it('drops a stale GET that resolves after blur so old-account costs never return', async () => {
  const { getAdditionalCosts, write, controller, isReadable } = setup();
  const pending = deferred<CostRequest[]>();
  getAdditionalCosts.mockReturnValueOnce(pending.promise);
  const first = controller.focusCosts(ORDER_ID, isReadable);
  controller.blurCosts();
  write.mockClear();
  pending.resolve([record()]);
  await first;
  expect(write).not.toHaveBeenCalled();
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(getAdditionalCosts).toHaveBeenCalledTimes(2);
  const last = write.mock.calls[write.mock.calls.length - 1][0];
  expect(last.requests.map((request: { id: string }) => request.id)).toEqual([REQUEST_ID]);
});

it('purges when the gate flips mid-flight instead of rendering', async () => {
  const { getAdditionalCosts, write, controller, isReadable, setReadable } = setup();
  const pending = deferred<CostRequest[]>();
  getAdditionalCosts.mockReturnValueOnce(pending.promise);
  const request = controller.focusCosts(ORDER_ID, isReadable);
  setReadable(false);
  pending.resolve([record()]);
  await request;
  const last = write.mock.calls[write.mock.calls.length - 1][0];
  expect(last.requests).toEqual([]);
});

it.each([401, 403])('purges costs on denial %s with retry disabled', async (status) => {
  const { getAdditionalCosts, controller, isReadable, state } = setup();
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(state().requests).toHaveLength(1);
  getAdditionalCosts.mockRejectedValueOnce({ response: { status } });
  await controller.refreshCosts(isReadable);
  expect(state()).toMatchObject({ requests: [], loading: false, canRetry: false });
  expect(state().error).toContain('quyền');
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/Thay thêm cảm biến/);
});

it('distinguishes 503 with a real retry that recovers', async () => {
  const { getAdditionalCosts, controller, isReadable, state } = setup();
  getAdditionalCosts.mockRejectedValueOnce({ response: { status: 503 } });
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ requests: [], loading: false, canRetry: true });
  expect(state().error).toContain('không khả dụng');
  getAdditionalCosts.mockResolvedValueOnce([record({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })] as CostRequest[]);
  await controller.refreshCosts(isReadable);
  expect(getAdditionalCosts).toHaveBeenCalledTimes(2);
  expect(state()).toMatchObject({ error: null, canRetry: false });
  expect(state().requests.map((request) => request.id)).toEqual(['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
});

it('keeps last-good requests on transient failure and recovers on manual retry', async () => {
  const { getAdditionalCosts, controller, isReadable, state } = setup();
  await controller.focusCosts(ORDER_ID, isReadable);
  getAdditionalCosts.mockRejectedValueOnce(new Error('offline'));
  await controller.refreshCosts(isReadable);
  expect(state().requests.map((request) => request.id)).toEqual([REQUEST_ID]);
  expect(state().error).toBeTruthy();
  expect(state().canRetry).toBe(true);
});

it('blur purges costs so nothing persists beyond the focused screen', async () => {
  const { controller, isReadable, state } = setup();
  await controller.focusCosts(ORDER_ID, isReadable);
  expect(JSON.stringify(state())).toMatch(/Thay thêm cảm biến/);
  controller.blurCosts();
  expect(state()).toMatchObject({ requests: [], loading: false, error: null, canRetry: false });
  expect(JSON.stringify(state())).not.toMatch(/Thay thêm cảm biến/);
});

describe('sanitizeCostRequest (production helper)', () => {
  it.each([[null], [undefined], ['row'], [42]])(
    'returns null for non-object row %s',
    (row) => {
      expect(sanitizeCostRequest(ORDER_ID, row)).toBeNull();
    },
  );

  it.each([
    ['blank id', { id: '  ' }],
    ['malformed id', { id: 'r1' }],
    ['wrong order', { serviceOrderId: OTHER_ID }],
    ['blank reason', { reason: '   ' }],
  ])('returns null for %s without rendering', (_label, overrides) => {
    expect(sanitizeCostRequest(ORDER_ID, record(overrides as Record<string, unknown>))).toBeNull();
  });

  it('keeps only allowlisted fields and lowercases nothing it should not', () => {
    const view = sanitizeCostRequest(ORDER_ID, record({ status: 'approved' }));
    expect(view).not.toBeNull();
    expect(view?.status).toBe('APPROVED');
    expect(Object.keys(view ?? {}).sort()).toEqual(
      ['expiresAt', 'expiresText', 'id', 'items', 'laborText', 'partsText', 'reason', 'status'].sort(),
    );
    // P3B13 safety gate fields: raw item type + raw expiry, still no privates.
    expect(view?.expiresAt).toBe('2030-10-23T10:00:00Z');
    expect(view?.items).toMatchObject([{ itemType: 'PARTS' }]);
    const rendered = JSON.stringify(view);
    expect(rendered).not.toMatch(/evidenceUrls|technicianId|decidedByCustomerId/);
  });

  it('maps unknown status neutrally and invalid expiry to null', () => {
    const view = sanitizeCostRequest(ORDER_ID, record({ status: 'DRAFT', expiresAt: 'not-a-date' }));
    expect(view).toMatchObject({ status: 'UNKNOWN', expiresText: null });
  });

  it('skips malformed item rows while keeping valid lines', () => {
    const view = sanitizeCostRequest(ORDER_ID, record({
      items: [
        { id: 'li-1', description: 'Cảm biến', quantity: 1, lineTotal: 250000 },
        { id: '', description: 'blank', quantity: 1, lineTotal: 1 },
        { id: 'li-x', description: '  ', quantity: 1, lineTotal: 1 },
        { id: 'li-y', description: 'zero', quantity: 0, lineTotal: 0 },
        'row',
      ],
    }));
    expect(view?.items.map((item) => item.id)).toEqual(['li-1']);
  });
});

describe('costMoneyText (bigint-safe helper)', () => {
  it('renders finite numbers and exact numeric strings', () => {
    expect(costMoneyText(250000)).toBe('250.000đ');
    expect(costMoneyText('250000')).toBe('250.000đ');
    expect(costMoneyText(0)).toBe('0đ');
  });

  it.each([[NaN], [Infinity], [-5], [1.5], ['12.5'], ['abc'], [''], [null], [undefined], [{}]])(
    'falls back for unsafe amount %s',
    (value) => {
      expect(costMoneyText(value)).toBeNull();
    },
  );

  it('falls back on precision-losing overflow instead of corrupt money', () => {
    expect(costMoneyText('99999999999999999999')).toBeNull();
    expect(costMoneyText(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(costMoneyText(Number.MAX_SAFE_INTEGER)).not.toBeNull();
  });
});

it('shares the initial state shape', () => {
  expect(initialAdditionalCostsState).toMatchObject({ requests: [], loading: false, error: null, canRetry: false });
});

describe('refreshCosts freshness receipt (ambiguous-lock remediation)', () => {
  it('reports false when the post-ambiguity GET fails with 503', async () => {
    const { getAdditionalCosts, controller, isReadable } = setup();
    await controller.focusCosts(ORDER_ID, isReadable);
    getAdditionalCosts.mockRejectedValueOnce({ response: { status: 503 } });
    const fresh = await controller.refreshCosts(isReadable);
    expect(fresh).toBe(false);
  });

  it('reports false on offline, 401, 404, and unreadable gate', async () => {
    const offline = setup();
    await offline.controller.focusCosts(ORDER_ID, offline.isReadable);
    offline.getAdditionalCosts.mockRejectedValueOnce(new Error('offline'));
    await expect(offline.controller.refreshCosts(offline.isReadable)).resolves.toBe(false);

    const denied = setup();
    await denied.controller.focusCosts(ORDER_ID, denied.isReadable);
    denied.getAdditionalCosts.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(denied.controller.refreshCosts(denied.isReadable)).resolves.toBe(false);

    const missing = setup();
    await missing.controller.focusCosts(ORDER_ID, missing.isReadable);
    missing.getAdditionalCosts.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(missing.controller.refreshCosts(missing.isReadable)).resolves.toBe(false);

    const gated = setup();
    await gated.controller.focusCosts(ORDER_ID, gated.isReadable);
    await expect(gated.controller.refreshCosts(() => false)).resolves.toBe(false);
  });

  it('reports false for a reused in-flight GET, never a fresh verification', async () => {
    const { getAdditionalCosts, controller, isReadable } = setup();
    await controller.focusCosts(ORDER_ID, isReadable);
    const pending = deferred<CostRequest[]>();
    getAdditionalCosts.mockReturnValueOnce(pending.promise);
    const first = controller.refreshCosts(isReadable);
    await expect(controller.refreshCosts(isReadable)).resolves.toBe(false);
    pending.resolve([record()]);
    await expect(first).resolves.toBe(true);
    expect(getAdditionalCosts).toHaveBeenCalledTimes(2);
  });

  it('reports false with no active order and true only on a fresh authorized success', async () => {
    const idle = setup();
    await expect(idle.controller.refreshCosts(idle.isReadable)).resolves.toBe(false);

    const h = setup();
    await h.controller.focusCosts(ORDER_ID, h.isReadable);
    h.getAdditionalCosts.mockResolvedValueOnce([record()]);
    await expect(h.controller.refreshCosts(h.isReadable)).resolves.toBe(true);
  });
});
