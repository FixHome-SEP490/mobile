import type { ServiceOrderItem } from '../../api/orders.api';
import {
  createCheckInController,
  normalizeCheckInResult,
  serverDistanceText,
  toCheckInCoords,
  type CheckInDeps,
  type PositionReading,
} from './technician-check-in';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
let technicianSequence = 0;

const enRouteJob = () => ({ id: ORDER_ID, status: 'EN_ROUTE' });

const validResponse = () => ({
  serviceOrderId: ORDER_ID,
  technicianId: 'tech-1',
  lat: 10.1,
  lng: 106.1,
  accuracyMeters: 8,
  distanceMeters: 12,
  result: 'valid',
  checkedInAt: '2030-10-21T10:00:00Z',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: CheckInDeps;
  checkIn: (orderId: string) => Promise<void>;
  reconcile: (orderId: string) => Promise<void>;
  setCurrent: (value: boolean) => void;
  setTechnicianId: (value: string | null) => void;
  setJob: (
    job: { id: string; status: unknown; historical?: unknown } | null,
  ) => void;
  notified: () => [string, string][];
  verificationStates: () => [string, string][];
  makeDetail: (overrides?: Partial<ServiceOrderItem>) => ServiceOrderItem;
}

/** Exercises the actual production controller the EN_ROUTE button calls. */
function setup(): Harness {
  let current = true;
  let technicianId: string | null = 'tech-' + ++technicianSequence;
  let job: { id: string; status: unknown; historical?: unknown } | null =
    enRouteJob();
  const notifications: [string, string][] = [];
  const verificationStates: [string, string][] = [];

  const makeDetail = (
    overrides: Partial<ServiceOrderItem> = {},
  ): ServiceOrderItem => ({
    id: ORDER_ID,
    code: 'SO-CHECKIN',
    bookingId: '22222222-2222-4222-8222-222222222222',
    serviceName: 'Điều hòa',
    status: 'EN_ROUTE',
    customerName: 'Customer',
    customerPhone: '',
    addressSummary: '',
    scheduledAt: '2030-01-02T00:00:00Z',
    technician: {
      id: technicianId ?? 'logged-out',
      fullName: 'Technician',
      phoneNumber: '',
      averageRating: 0,
    },
    arrivalVerified: true,
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
    createdAt: '2030-01-01T00:00:00Z',
    ...overrides,
  });

  const deps: CheckInDeps = {
    getJob: (id) => (job && job.id === id ? job : null),
    getTechnicianId: () => technicianId,
    captureFocus: () => () => current,
    requestPermission: jest.fn().mockResolvedValue('granted'),
    getPosition: jest
      .fn()
      .mockResolvedValue({ lat: 10.1, lng: 106.1, accuracy: 8 }),
    postCheckIn: jest.fn().mockResolvedValue(validResponse()),
    getOrderDetail: jest.fn().mockImplementation(async () => makeDetail()),
    notify: jest.fn((title: string, message: string) => {
      notifications.push([title, message]);
    }),
    refreshJobs: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    setBusy: jest.fn(),
    onVerificationState: jest.fn((id: string, state: string) => {
      verificationStates.push([id, state]);
    }),
  };
  const controller = createCheckInController(deps);
  return {
    deps,
    checkIn: controller.checkIn,
    reconcile: controller.reconcile,
    setCurrent: (value) => {
      current = value;
    },
    setTechnicianId: (value) => {
      technicianId = value;
    },
    setJob: (value) => {
      job = value;
    },
    notified: () => notifications,
    verificationStates: () => verificationStates,
    makeDetail,
  };
}

const postCheckIn = (h: Harness) => h.deps.postCheckIn as jest.Mock;
const permission = (h: Harness) => h.deps.requestPermission as jest.Mock;
const position = (h: Harness) => h.deps.getPosition as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshJobs = (h: Harness) => h.deps.refreshJobs as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;
const busy = (h: Harness) => h.deps.setBusy as jest.Mock;
const orderDetail = (h: Harness) => h.deps.getOrderDetail as jest.Mock;

it('exposes only the tap entrypoint: no auto-track/watch/upload surface', () => {
  const { deps } = setup();
  expect(Object.keys(createCheckInController(deps)).sort()).toEqual(['checkIn', 'reconcile']);
});

it('makes zero calls before an explicit tap', () => {
  const h = setup();
  expect(permission(h)).not.toHaveBeenCalled();
  expect(position(h)).not.toHaveBeenCalled();
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(orderDetail(h)).not.toHaveBeenCalled();
  expect(refreshJobs(h)).not.toHaveBeenCalled();
});

it('verifies arrival on valid, manages busy independently, and refreshes jobs', async () => {
  const h = setup();
  await h.checkIn(ORDER_ID);
  expect(permission(h)).toHaveBeenCalledTimes(1);
  expect(position(h)).toHaveBeenCalledTimes(1);
  expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
  expect(postCheckIn(h)).toHaveBeenCalledWith(ORDER_ID, { lat: 10.1, lng: 106.1, accuracyMeters: 8 });
  expect(h.notified()[0][0]).toBe('Đã xác minh check-in');
  expect(refreshJobs(h)).toHaveBeenCalledTimes(1);
  expect(busy(h).mock.calls[0]).toEqual([ORDER_ID]);
  expect(busy(h).mock.calls[busy(h).mock.calls.length - 1]).toEqual([null]);
});

it('accepts uppercase and enveloped valid results without advancing state itself', async () => {
  const h = setup();
  postCheckIn(h).mockResolvedValue({ data: { ...validResponse(), result: 'VALID' } });
  await h.checkIn(ORDER_ID);
  expect(h.notified()[0][0]).toBe('Đã xác minh check-in');
  expect(h.notified()[0][1]).not.toMatch(/UNDER_REPAIR|Hoàn thành|completed/i);
});

it.each([
  ['low_accuracy', 'Vị trí chưa đủ chính xác', false],
  ['out_of_geofence', 'Ngoài khu vực', false],
  ['failed', 'Check-in thất bại', false],
  ['something_new', 'Kết quả check-in chưa rõ', true],
  [undefined, 'Kết quả check-in chưa rõ', true],
])(
  'shows a distinct honest message for result %s and never claims arrival',
  async (result, title, ambiguous) => {
    const h = setup();
    if (ambiguous) {
      orderDetail(h).mockResolvedValue(
        h.makeDetail({ arrivalVerified: false }),
      );
    }
    postCheckIn(h).mockResolvedValue({ ...validResponse(), result });
    await h.checkIn(ORDER_ID);
    expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
    expect(h.notified()).toHaveLength(1);
    expect(h.notified()[0][0]).toBe(title);
    expect(h.notified()[0].join(' ')).not.toMatch(
      /máy chủ xác nhận bạn đã đến/i,
    );
    expect(refreshJobs(h)).toHaveBeenCalledTimes(ambiguous ? 1 : 0);
  },
);

it('includes server-derived distance for out_of_geofence only when safe', async () => {
  const h = setup();
  postCheckIn(h).mockResolvedValue({ ...validResponse(), result: 'out_of_geofence', distanceMeters: 142.6 });
  await h.checkIn(ORDER_ID);
  expect(h.notified()[0][1]).toMatch(/143 m/);
  const h2 = setup();
  postCheckIn(h2).mockResolvedValue({ ...validResponse(), result: 'out_of_geofence', distanceMeters: 'far' });
  await h2.checkIn(ORDER_ID);
  expect(h2.notified()[0][1]).not.toMatch(/khoảng/);
});

it('asks for permission on tap and stops on denial without POST', async () => {
  const h = setup();
  permission(h).mockResolvedValue('denied');
  await h.checkIn(ORDER_ID);
  expect(position(h)).not.toHaveBeenCalled();
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(h.notified()[0][0]).toBe('Cần quyền vị trí');
  expect(busy(h).mock.calls[busy(h).mock.calls.length - 1]).toEqual([null]);
});

it('stops when location services are off or the prompt throws', async () => {
  const h = setup();
  permission(h).mockResolvedValue('unavailable');
  await h.checkIn(ORDER_ID);
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(h.notified()[0][0]).toBe('Không lấy được vị trí');
  const h2 = setup();
  permission(h2).mockRejectedValue(new Error('prompt crashed'));
  await h2.checkIn(ORDER_ID);
  expect(postCheckIn(h2)).not.toHaveBeenCalled();
  expect(h2.notified()[0][0]).toBe('Không lấy được vị trí');
});

it.each([
  ['null accuracy', { lat: 10.1, lng: 106.1, accuracy: null }],
  ['NaN accuracy', { lat: 10.1, lng: 106.1, accuracy: NaN }],
  ['NaN latitude', { lat: NaN, lng: 106.1, accuracy: 8 }],
  ['missing longitude', { lat: 10.1, lng: undefined, accuracy: 8 }],
])('rejects %s before POST and guides a GPS retake', async (_label, reading) => {
  const h = setup();
  position(h).mockResolvedValue(reading as PositionReading);
  await h.checkIn(ORDER_ID);
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(h.notified()[0][0]).toBe('Tọa độ chưa hợp lệ');
});

it('rejects a malformed order id without POST', async () => {
  const h = setup();
  await h.checkIn('not-a-uuid');
  expect(permission(h)).not.toHaveBeenCalled();
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(h.notified()[0][0]).toBe('Mã đơn không hợp lệ.');
});

it('never POSTs for historical, non-EN_ROUTE, or missing jobs', async () => {
  const historical = setup();
  historical.setJob({ id: ORDER_ID, status: 'EN_ROUTE', historical: true });
  await historical.checkIn(ORDER_ID);
  expect(postCheckIn(historical)).not.toHaveBeenCalled();

  const accepted = setup();
  accepted.setJob({ id: ORDER_ID, status: 'ACCEPTED' });
  await accepted.checkIn(ORDER_ID);
  expect(postCheckIn(accepted)).not.toHaveBeenCalled();
  expect(accepted.notified()[0][1]).toMatch(/di chuyển/);

  const missing = setup();
  missing.setJob(null);
  await missing.checkIn(ORDER_ID);
  expect(postCheckIn(missing)).not.toHaveBeenCalled();

  const booking = setup();
  await booking.checkIn('22222222-2222-4222-8222-222222222222');
  expect(postCheckIn(booking)).not.toHaveBeenCalled();
});

it('stays silent without POST when logged out or blurred at tap', async () => {
  const loggedOut = setup();
  loggedOut.setTechnicianId(null);
  await loggedOut.checkIn(ORDER_ID);
  expect(postCheckIn(loggedOut)).not.toHaveBeenCalled();
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setCurrent(false);
  await blurred.checkIn(ORDER_ID);
  expect(postCheckIn(blurred)).not.toHaveBeenCalled();
  expect(notified(blurred)).not.toHaveBeenCalled();
});

it('drops the POST when the account switches during the permission gap', async () => {
  const h = setup();
  const gate = deferred<CheckInDeps['requestPermission'] extends () => Promise<infer T> ? T : never>();
  permission(h).mockReturnValueOnce(gate.promise);
  const attempt = h.checkIn(ORDER_ID);
  h.setTechnicianId('other-tech');
  gate.resolve('granted');
  await attempt;
  expect(position(h)).not.toHaveBeenCalled();
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
  expect(busy(h).mock.calls[busy(h).mock.calls.length - 1]).toEqual([null]);
});

it('drops the POST when blurred before permission resolves', async () => {
  const h = setup();
  const gate = deferred<'granted'>();
  permission(h).mockReturnValueOnce(gate.promise);
  const attempt = h.checkIn(ORDER_ID);
  h.setCurrent(false);
  gate.resolve('granted');
  await attempt;
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
});

it('drops a stale position response after logout without notifying', async () => {
  const h = setup();
  const gate = deferred<PositionReading>();
  position(h).mockReturnValueOnce(gate.promise);
  const attempt = h.checkIn(ORDER_ID);
  h.setTechnicianId(null);
  gate.resolve({ lat: 10.1, lng: 106.1, accuracy: 8 });
  await attempt;
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
});

it('reconfirms the assignment after permission: changed status stops the POST', async () => {
  const h = setup();
  permission(h).mockImplementationOnce(async () => {
    h.setJob({ id: ORDER_ID, status: 'UNDER_REPAIR' });
    return 'granted';
  });
  await h.checkIn(ORDER_ID);
  expect(position(h)).not.toHaveBeenCalled();
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(h.notified()[0][0]).toBe('Đơn đã thay đổi');
});

it('throttles duplicate taps to a single permission prompt and POST', async () => {
  const h = setup();
  const permGate = deferred<'granted'>();
  const posGate = deferred<PositionReading>();
  permission(h).mockReturnValueOnce(permGate.promise);
  position(h).mockReturnValueOnce(posGate.promise);
  const first = h.checkIn(ORDER_ID);
  const second = h.checkIn(ORDER_ID);
  permGate.resolve('granted');
  await Promise.resolve();
  posGate.resolve({ lat: 10.1, lng: 106.1, accuracy: 8 });
  await Promise.all([first, second]);
  expect(permission(h)).toHaveBeenCalledTimes(1);
  expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
});

it.each([401, 403])('purges via onAccessDenied on %s without retaining coordinates', async (status) => {
  const h = setup();
  postCheckIn(h).mockRejectedValue({ response: { status } });
  await h.checkIn(ORDER_ID);
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.notified()[0][0]).toBe('Phiên đăng nhập đã hết');
  expect(refreshJobs(h)).not.toHaveBeenCalled();
  expect(Object.keys(createCheckInController(h.deps)).sort()).toEqual(['checkIn', 'reconcile']);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])(
  'locks ambiguous POST %s and reconciles by GET without a second POST',
  async (_label, error) => {
    const h = setup();
    orderDetail(h).mockResolvedValue(
      h.makeDetail({ arrivalVerified: false }),
    );
    postCheckIn(h).mockRejectedValue(error);

    await h.checkIn(ORDER_ID);
    expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
    expect(orderDetail(h)).toHaveBeenCalledWith(ORDER_ID);
    expect(h.notified()[0][0]).toBe('Chưa xác nhận check-in');
    expect(refreshJobs(h)).toHaveBeenCalledTimes(1);
    expect(h.verificationStates()).toContainEqual([ORDER_ID, 'pending']);

    await h.checkIn(ORDER_ID);
    expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
    expect(permission(h)).toHaveBeenCalledTimes(1);
    expect(h.verificationStates()).not.toContainEqual([ORDER_ID, 'clear']);
    expect(busy(h).mock.calls[busy(h).mock.calls.length - 1]).toEqual([null]);
  },
);

it('promotes an ambiguous check-in only after authoritative arrivalVerified GET', async () => {
  const h = setup();
  orderDetail(h)
    .mockResolvedValueOnce(h.makeDetail({ arrivalVerified: false }))
    .mockResolvedValueOnce(h.makeDetail({ arrivalVerified: true }));
  postCheckIn(h).mockRejectedValue(new Error('timeout'));

  await h.checkIn(ORDER_ID);
  expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
  await h.reconcile(ORDER_ID);

  expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
  expect(h.verificationStates()).toContainEqual([ORDER_ID, 'verified']);
});

it('GET-only re-entry discovers a previously verified arrival without requesting GPS', async () => {
  const h = setup();
  orderDetail(h).mockResolvedValue(h.makeDetail({ arrivalVerified: true }));

  await h.reconcile(ORDER_ID);

  expect(orderDetail(h)).toHaveBeenCalledWith(ORDER_ID);
  expect(permission(h)).not.toHaveBeenCalled();
  expect(position(h)).not.toHaveBeenCalled();
  expect(postCheckIn(h)).not.toHaveBeenCalled();
  expect(h.verificationStates()).toContainEqual([ORDER_ID, 'verified']);
});

it('does not accept a historical or other-technician detail as arrival proof', async () => {
  const historical = setup();
  orderDetail(historical).mockResolvedValue(
    historical.makeDetail({ historical: true, arrivalVerified: true }),
  );
  await historical.reconcile(ORDER_ID);
  expect(historical.verificationStates()).not.toContainEqual([
    ORDER_ID,
    'verified',
  ]);

  const other = setup();
  orderDetail(other).mockResolvedValue(
    other.makeDetail({
      arrivalVerified: true,
      technician: {
        id: 'other-technician',
        fullName: 'Other',
        phoneNumber: '',
        averageRating: 0,
      },
    }),
  );
  await other.reconcile(ORDER_ID);
  expect(other.verificationStates()).not.toContainEqual([
    ORDER_ID,
    'verified',
  ]);
});

it('handles 404 as not-found with GET reconciliation only', async () => {
  const h = setup();
  postCheckIn(h).mockRejectedValue({ response: { status: 404 } });
  await h.checkIn(ORDER_ID);
  expect(postCheckIn(h)).toHaveBeenCalledTimes(1);
  expect(h.notified()[0][0]).toBe('Không tìm thấy đơn');
  expect(refreshJobs(h)).toHaveBeenCalledTimes(1);
});

describe('normalizeCheckInResult (production helper)', () => {
  it.each([['valid'], ['VALID'], ['Valid']])('treats %s as arrival', (result) => {
    expect(normalizeCheckInResult({ result })).toBe('valid');
    expect(normalizeCheckInResult({ data: { result } })).toBe('valid');
  });

  it.each([['low_accuracy'], ['OUT_OF_GEOFENCE'], ['failed']])('keeps unsuccessful %s distinct', (result) => {
    expect(normalizeCheckInResult({ result })).toBe(result.toLowerCase());
  });

  it.each([[null], [undefined], [{}], [{ result: null }], [{ result: 'pending' }], ['valid']])(
    'maps %s to unknown, never success',
    (response) => {
      expect(normalizeCheckInResult(response)).toBe('unknown');
    },
  );
});

describe('serverDistanceText (production helper)', () => {
  it('rounds safe server distances', () => {
    expect(serverDistanceText({ distanceMeters: 142.6 })).toBe(' Khoảng cách hiện tại khoảng 143 m (do máy chủ tính).');
    expect(serverDistanceText({ data: { distanceMeters: 0 } })).toBe(' Khoảng cách hiện tại khoảng 0 m (do máy chủ tính).');
  });

  it.each([[null], [undefined], [{}], [{ distanceMeters: -3 }], [{ distanceMeters: NaN }], [{ distanceMeters: 'far' }]])(
    'returns null for unsafe distance %s',
    (response) => {
      expect(serverDistanceText(response)).toBeNull();
    },
  );
});

describe('toCheckInCoords (production helper)', () => {
  it('passes genuine zero accuracy through without inventing it', () => {
    expect(toCheckInCoords({ lat: 1, lng: 2, accuracy: 0 })).toEqual({ lat: 1, lng: 2, accuracyMeters: 0 });
  });

  it.each([
    [{ lat: 1, lng: 2, accuracy: null }],
    [{ lat: 1, lng: 2, accuracy: NaN }],
    [{ lat: 1, lng: 2, accuracy: -1 }],
    [{ lat: Infinity, lng: 2, accuracy: 5 }],
  ])('rejects %s', (reading) => {
    expect(toCheckInCoords(reading as PositionReading)).toBeNull();
  });
});
