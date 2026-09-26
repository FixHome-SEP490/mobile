import {
  createStartRepairController,
  describeStartRepairBlockers,
  initialStartRepairState,
  startRepairTarget,
  START_REPAIR_CONFIRM_COPY,
  type StartRepairDeps,
  type StartRepairState,
} from './technician-start-repair';
import { createTechOrderDetailLoader } from './technician-order-detail';
import { writeDetailWithMirror } from '../customer/customer-order-detail';
import type { ServiceOrderItem } from '../../api/orders.api';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const gate = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'EN_ROUTE',
  arrivalVerified: true,
  historical: false,
  pricingMode: 'inspection_required',
  fixedUnitPrice: null,
  beforeEvidenceCount: 2,
  quotationStatus: 'APPROVED',
  ...overrides,
});

const fixedGate = (overrides: Record<string, unknown> = {}) => gate({
  pricingMode: 'fixed_price',
  fixedUnitPrice: 250000,
  quotationStatus: null,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: StartRepairDeps;
  controller: ReturnType<typeof createStartRepairController>;
  setOrder: (order: ReturnType<typeof gate> | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => StartRepairState;
}

/** Exercises the actual production controller the detail screen calls. */
function setup(orderOverrides: Record<string, unknown> = {}): Harness {
  let order: ReturnType<typeof gate> | null = gate(orderOverrides);
  let technicianId: string | null = 'tech-1';
  let focused = true;
  const write = jest.fn<void, [StartRepairState]>();
  const deps: StartRepairDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    startRepair: jest.fn().mockResolvedValue({ id: ORDER_ID, status: 'UNDER_REPAIR' }),
    refreshDetail: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createStartRepairController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => { order = value; },
    setTechnicianId: (value) => { technicianId = value; },
    setFocused: (value) => { focused = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const post = (h: Harness) => h.deps.startRepair as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshDetail as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the start-repair surface: no completion/payment/approval', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['cancelConfirm', 'markReverified', 'requestConfirm', 'reset', 'submit'].sort(),
  );
});

it('pins the exact two-tap confirmation copy', () => {
  expect(START_REPAIR_CONFIRM_COPY).toBe(
    'Bắt đầu sửa chữa: đơn chuyển sang Đang sửa; chỉ thực hiện sau khi đã check-in hợp lệ, tải đủ ảnh trước sửa, và khách duyệt báo giá khi cần.',
  );
});

it('posts nothing before an explicit confirm + submit', async () => {
  const h = setup();
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  h.controller.requestConfirm();
  expect(post(h)).not.toHaveBeenCalled();
});

it('starts repair for inspection_required with an APPROVED quote and refreshes', async () => {
  const h = setup();
  h.controller.requestConfirm();
  expect(h.state()).toMatchObject({ confirming: true, pricing: 'inspection_required' });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID);
  expect(h.state()).toMatchObject({ started: true, busy: false, confirming: false, error: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã bắt đầu sửa chữa', 'Đơn đã chuyển sang trạng thái đang sửa chữa.'],
  );
  const copy = notified(h).mock.calls.map((call) => String(call[1])).join(' ');
  expect(copy).not.toMatch(/hoàn thành|đã thanh toán|paid|completed/i);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('starts repair for fixed_price with a valid snapshot and no quote', async () => {
  const h = setup();
  h.setOrder(fixedGate());
  h.controller.requestConfirm();
  expect(h.state()).toMatchObject({ confirming: true, pricing: 'fixed_price' });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID);
  expect(h.state().started).toBe(true);
});

it.each([
  ['wrong technician (logged out)', { tech: null }],
  ['blurred screen', { focused: false }],
  ['missing order', { order: null }],
  ['malformed order id', { order: { id: 'not-a-uuid' } }],
  ['historical summary', { order: { historical: true } }],
  ['accepted status', { order: { status: 'ACCEPTED' } }],
  ['already under repair', { order: { status: 'UNDER_REPAIR' } }],
  ['cancelled order', { order: { status: 'CANCELLED' } }],
  ['unverified arrival', { order: { arrivalVerified: false } }],
  ['no before photos', { order: { beforeEvidenceCount: 0 } }],
  ['missing before count', { order: { beforeEvidenceCount: null } }],
  ['pending SENT quote', { order: { quotationStatus: 'SENT' } }],
  ['rejected quote', { order: { quotationStatus: 'REJECTED' } }],
  ['missing quote', { order: { quotationStatus: null } }],
  ['fixed price without snapshot', { order: { pricingMode: 'fixed_price', fixedUnitPrice: null, quotationStatus: null } }],
  ['negative fixed price', { order: { pricingMode: 'fixed_price', fixedUnitPrice: -5, quotationStatus: null } }],
  ['unknown pricing mode', { order: { pricingMode: 'other', quotationStatus: null } }],
])('blocks submit for %s without POST', async (_label, scenario) => {
  const h = setup();
  if ('tech' in scenario) h.setTechnicianId(scenario.tech as null);
  if ('focused' in scenario) h.setFocused(scenario.focused as boolean);
  if ('order' in scenario) {
    const value = scenario.order as null | Record<string, unknown>;
    h.setOrder(value === null ? null : gate(value));
  }
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
});

it('stays silent without POST when logged out or blurred at confirm', async () => {
  const loggedOut = setup();
  loggedOut.setTechnicianId(null);
  loggedOut.controller.requestConfirm();
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setFocused(false);
  blurred.controller.requestConfirm();
  expect(notified(blurred)).not.toHaveBeenCalled();
});

it('notifies a changed order instead of posting a stale start', async () => {
  const h = setup();
  h.controller.requestConfirm();
  h.setOrder(gate({ status: 'UNDER_REPAIR' }));
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Chưa thể bắt đầu sửa chữa');
});

it('throttles duplicate submits to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm();
  const first = h.controller.submit();
  const second = h.controller.submit();
  gatePromise.resolve({ id: ORDER_ID });
  await Promise.all([first, second]);
  expect(post(h)).toHaveBeenCalledTimes(1);
});

it('drops a stale success response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm();
  const attempt = h.controller.submit();
  h.setTechnicianId(null);
  gatePromise.resolve({ id: ORDER_ID });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().started).toBe(false);
});

it.each([401, 403])('purges and resets on %s with re-login copy', async (status) => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({ confirming: false, busy: false, started: false });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it.each([409, 422])('shows truthful blocked info on %s and reloads without locking', async (status) => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().error).toMatch(new RegExp(`mã ${status}`));
  expect(h.state().needsVerify).toBe(false);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])('locks on ambiguous failure %s: no repost until the detail reloads', async (_label, error) => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue(error);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().needsVerify).toBe(true);
  expect(h.state().error).toMatch(/tải lại chi tiết đơn/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  h.controller.markReverified();
  expect(h.state().needsVerify).toBe(false);
});

it('reset clears confirmation on blur/order change', () => {
  const h = setup();
  h.controller.requestConfirm();
  h.controller.reset();
  expect(h.state()).toMatchObject({ confirming: false, started: false, needsVerify: false, pricing: null });
});

describe('startRepairTarget (production gate)', () => {
  it.each([
    [{ pricingMode: 'Inspection_Required', quotationStatus: 'approved' }, true],
    [{ pricingMode: 'FIXED_PRICE', fixedUnitPrice: 0, quotationStatus: null }, true],
    [{ status: 'ACCEPTED' }, false],
    [{ arrivalVerified: 1 }, false],
    [{ beforeEvidenceCount: 0 }, false],
    [{ beforeEvidenceCount: NaN }, false],
    [{ pricingMode: 'fixed_price', fixedUnitPrice: null, quotationStatus: null }, false],
    [{ pricingMode: 'inspection_required', quotationStatus: 'SENT' }, false],
    [{ historical: true }, false],
    [null, false],
  ])('gate %s', (overrides, expected) => {
    const order = overrides === null ? null : gate(overrides as Record<string, unknown>);
    const target = startRepairTarget(order);
    expect(target?.orderId ?? null).toBe(expected ? ORDER_ID : null);
  });
});

describe('describeStartRepairBlockers (eligibility indicator)', () => {
  it('returns empty for a fully eligible order', () => {
    expect(describeStartRepairBlockers(gate())).toEqual([]);
    expect(describeStartRepairBlockers(fixedGate())).toEqual([]);
  });

  it('lists each unmet preliminary condition honestly', () => {
    expect(describeStartRepairBlockers(gate({ status: 'ACCEPTED' }))).toContain('Đơn chưa ở trạng thái di chuyển.');
    expect(describeStartRepairBlockers(gate({ arrivalVerified: false }))).toContain('Chưa check-in hợp lệ.');
    expect(describeStartRepairBlockers(gate({ beforeEvidenceCount: 0 }))).toContain(
      'Cần ảnh trước sửa chữa do bạn tải lên, số lượng yêu cầu do hệ thống kiểm tra.',
    );
    expect(describeStartRepairBlockers(gate({ quotationStatus: 'SENT' }))).toContain('Cần báo giá được khách duyệt.');
    expect(describeStartRepairBlockers(fixedGate({ fixedUnitPrice: null }))).toContain('Đơn giá cố định chưa có.');
    expect(describeStartRepairBlockers(null)).toEqual([]);
  });
});

it('shares the initial state shape', () => {
  expect(initialStartRepairState).toMatchObject({
    confirming: false,
    busy: false,
    error: null,
    needsVerify: false,
    started: false,
    pricing: null,
  });
});

describe('ambiguous-retry screen path (review remediation)', () => {
  const detailOrder = (overrides: Record<string, unknown> = {}) => ({
    id: ORDER_ID,
    code: 'SO-1',
    bookingId: '22222222-2222-4222-8222-222222222222',
    serviceName: 'Tap repair',
    status: 'EN_ROUTE',
    arrivalVerified: true,
    historical: false,
    pricingMode: 'fixed_price',
    fixedUnitPrice: 250000,
    beforeEvidenceCount: 2,
    quotation: null,
    ...overrides,
  });

  interface ScreenHarness {
    loader: ReturnType<typeof createTechOrderDetailLoader>;
    getOrder: jest.Mock;
    controller: ReturnType<typeof createStartRepairController>;
    startRepair: jest.Mock;
    state: () => StartRepairState;
    setTechId: (value: string | null) => void;
    setFocused: (value: boolean) => void;
    mirror: { current: { order: ServiceOrderItem | null; serviceOrderId: string } };
    /** Exact fixed onRefresh unlock sequence from the technician screen. */
    fixedOnRefresh: () => Promise<void>;
  }

  /** REAL tech loader (production sync mirror) + REAL controller, screen wiring. */
  function screenSetup(): ScreenHarness {
    let techId: string | null = 'tech-1';
    let focused = true;
    const listeners = new Set<() => void>();
    const getOrder = jest.fn<Promise<ServiceOrderItem>, [string]>()
      .mockResolvedValue(detailOrder() as unknown as ServiceOrderItem);
    const mirror: { current: { order: ServiceOrderItem | null; serviceOrderId: string } } = {
      current: { order: null, serviceOrderId: ORDER_ID },
    };
    const loader = createTechOrderDetailLoader(
      getOrder,
      writeDetailWithMirror(mirror, ORDER_ID, () => undefined),
      {
        getUserId: () => techId,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      },
    );
    const writes: StartRepairState[] = [];
    const startRepair = jest.fn().mockResolvedValue({ id: ORDER_ID, status: 'UNDER_REPAIR' });
    const controller = createStartRepairController(
      {
        getOrder: () => {
          const latest = mirror.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            arrivalVerified: latest.order.arrivalVerified,
            historical: latest.order.historical,
            pricingMode: latest.order.pricingMode,
            fixedUnitPrice: latest.order.fixedUnitPrice,
            beforeEvidenceCount: latest.order.beforeEvidenceCount,
            quotationStatus: latest.order.quotation ? latest.order.quotation.status : null,
          };
        },
        getTechnicianId: () => techId,
        isFocused: () => focused,
        startRepair,
        refreshDetail: jest.fn().mockResolvedValue(undefined),
        onAccessDenied: jest.fn(),
        notify: jest.fn(),
      },
      (state) => { writes.push(state); },
    );
    return {
      loader,
      getOrder,
      controller,
      startRepair,
      state: () => writes[writes.length - 1],
      setTechId: (value) => { techId = value; listeners.forEach((listener) => listener()); },
      setFocused: (value) => { focused = value; },
      mirror,
      fixedOnRefresh: async () => {
        const detailFresh = await loader.refreshVerified();
        const latest = mirror.current;
        const sameSession =
          focused &&
          techId !== null &&
          !!latest.order &&
          latest.order.id === ORDER_ID &&
          latest.order.id === latest.serviceOrderId;
        if (detailFresh === true && sameSession) controller.markReverified();
      },
    };
  }

  async function lockAfterAmbiguous(s: ScreenHarness) {
    await s.loader.focus(ORDER_ID);
    s.controller.requestConfirm();
    s.startRepair.mockRejectedValueOnce({ message: 'timeout' });
    await s.controller.submit();
    expect(s.state().needsVerify).toBe(true);
  }

  it('failed detail GET after ambiguous POST keeps the lock with zero replay', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getOrder.mockRejectedValueOnce(new Error('offline'));
    await s.fixedOnRefresh();
    expect(s.state().needsVerify).toBe(true);
    s.controller.requestConfirm();
    await s.controller.submit();
    expect(s.startRepair).toHaveBeenCalledTimes(1);
  });

  it('fresh GET with server UNDER_REPAIR blocks a duplicate start pre-commit', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    // The ambiguous POST actually transitioned server-side: the fresh GET now
    // carries UNDER_REPAIR. The sync mirror shows it pre-commit.
    s.getOrder.mockResolvedValueOnce(detailOrder({ status: 'UNDER_REPAIR' }) as unknown as ServiceOrderItem);
    await s.fixedOnRefresh();
    const current = s.mirror.current.order;
    expect(current?.status).toBe('UNDER_REPAIR');
    s.controller.requestConfirm();
    await s.controller.submit();
    expect(s.startRepair).toHaveBeenCalledTimes(1);
  });

  it('fresh GET still eligible permits a deliberate retry', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getOrder.mockResolvedValueOnce(detailOrder() as unknown as ServiceOrderItem);
    await s.fixedOnRefresh();
    expect(s.state().needsVerify).toBe(false);
    s.controller.requestConfirm();
    s.startRepair.mockResolvedValue({ id: ORDER_ID, status: 'UNDER_REPAIR' });
    await s.controller.submit();
    expect(s.startRepair).toHaveBeenCalledTimes(2);
  });

  it('technician switch during the verifying GET keeps the lock silently', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    const gate = deferred<ServiceOrderItem>();
    s.getOrder.mockReturnValueOnce(gate.promise);
    const attempt = s.fixedOnRefresh();
    s.setTechId('other-tech');
    gate.resolve(detailOrder() as unknown as ServiceOrderItem);
    await attempt;
    expect(s.state().needsVerify).toBe(true);
  });
});
