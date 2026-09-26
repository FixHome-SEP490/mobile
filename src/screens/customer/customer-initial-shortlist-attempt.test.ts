import type { BookingItem } from '../../api/bookings.api';
import type { ServiceOrderItem } from '../../api/orders.api';
import {
  candidateAvailabilityState,
  classifyInitialShortlistPostError,
  clearInitialShortlistAttempt,
  initialShortlistAttemptKey,
  readInitialShortlistAttempt,
  saveInitialShortlistAttemptBeforePost,
  verifiedLinkedOrderId,
  type InitialShortlistAttemptStorage,
} from './customer-initial-shortlist-attempt';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = '99999999-9999-4999-8999-999999999999';
const BOOKING_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INVITE_OLD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TECH_1 = '11111111-1111-4111-8111-111111111111';
const TECH_2 = '22222222-2222-4222-8222-222222222222';
const ORDER_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function memoryStorage(): InitialShortlistAttemptStorage & {
  dump(): Record<string, string>;
} {
  const cells = new Map<string, string>();
  return {
    dump: () => Object.fromEntries(cells),
    getItem: async (key) => (cells.has(key) ? cells.get(key)! : null),
    setItem: async (key, value) => {
      cells.set(key, value);
    },
    removeItem: async (key) => {
      cells.delete(key);
    },
  };
}

function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: BOOKING_A,
    customerId: CUSTOMER_A,
    serviceOrderId: ORDER_A,
    serviceId: '33333333-3333-4333-8333-333333333333',
    addressId: '44444444-4444-4444-8444-444444444444',
    description: 'Điều hòa không lạnh',
    preferredAt: '2026-09-26T02:00:00.000Z',
    preferredStartAt: '2026-09-26T02:00:00.000Z',
    preferredEndAt: '2026-09-26T04:00:00.000Z',
    urgency: 'NORMAL',
    status: 'MATCHED',
    createdAt: '2026-09-25T03:00:00.000Z',
    ...overrides,
  };
}

function order(overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem {
  return {
    id: ORDER_A,
    code: 'SO-TEST',
    bookingId: BOOKING_A,
    serviceName: 'Điều hòa',
    status: 'ACCEPTED',
    customerName: 'Customer',
    customerPhone: '',
    addressSummary: '',
    scheduledAt: '2026-09-26T02:00:00.000Z',
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
    createdAt: '2026-09-25T04:00:00.000Z',
    ...overrides,
  };
}

describe('initial shortlist durable attempt', () => {
  it('persists a one-technician shortlist attempt before POST', async () => {
    const storage = memoryStorage();
    const saved = await saveInitialShortlistAttemptBeforePost(storage, {
      customerId: CUSTOMER_A,
      bookingId: BOOKING_A,
      baselineInvitationIds: [],
      selectedTechnicianUserIds: [TECH_1],
    });
    expect(saved.selectedTechnicianUserIds).toEqual([TECH_1]);
    expect(await readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A))
      .toEqual({ state: 'valid', attempt: saved });
  });

  it('persists before POST and survives a fresh reader', async () => {
    const storage = memoryStorage();
    const saved = await saveInitialShortlistAttemptBeforePost(storage, {
      customerId: CUSTOMER_A,
      bookingId: BOOKING_A,
      baselineInvitationIds: [INVITE_OLD],
      selectedTechnicianUserIds: [TECH_1, TECH_2],
    });

    expect(
      await readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A),
    ).toEqual({ state: 'valid', attempt: saved });
  });

  it('scopes the lock to customer and booking', async () => {
    const storage = memoryStorage();
    await saveInitialShortlistAttemptBeforePost(storage, {
      customerId: CUSTOMER_A,
      bookingId: BOOKING_A,
      baselineInvitationIds: [],
      selectedTechnicianUserIds: [TECH_1, TECH_2],
    });

    expect(
      await readInitialShortlistAttempt(storage, CUSTOMER_B, BOOKING_A),
    ).toEqual({ state: 'absent' });
    expect(
      await readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_B),
    ).toEqual({ state: 'absent' });
  });

  it('fails closed when persistence fails before POST', async () => {
    const storage: InitialShortlistAttemptStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error('disk unavailable');
      },
      removeItem: async () => undefined,
    };
    await expect(
      saveInitialShortlistAttemptBeforePost(storage, {
        customerId: CUSTOMER_A,
        bookingId: BOOKING_A,
        baselineInvitationIds: [],
        selectedTechnicianUserIds: [TECH_1, TECH_2],
      }),
    ).rejects.toThrow('disk unavailable');
  });

  it('never overwrites an existing or corrupt marker', async () => {
    const storage = memoryStorage();
    const key = initialShortlistAttemptKey(CUSTOMER_A, BOOKING_A);
    await storage.setItem(key, 'not-json');

    expect(
      await readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A),
    ).toEqual({ state: 'invalid', reason: 'corrupt' });
    await expect(
      saveInitialShortlistAttemptBeforePost(storage, {
        customerId: CUSTOMER_A,
        bookingId: BOOKING_A,
        baselineInvitationIds: [],
        selectedTechnicianUserIds: [TECH_1, TECH_2],
      }),
    ).rejects.toThrow();
    expect(storage.dump()[key]).toBe('not-json');
  });

  it('treats a cross-scoped payload as invalid instead of absent', async () => {
    const storage = memoryStorage();
    const key = initialShortlistAttemptKey(CUSTOMER_A, BOOKING_A);
    await storage.setItem(
      key,
      JSON.stringify({
        customerId: CUSTOMER_B,
        bookingId: BOOKING_A,
        baselineInvitationIds: [],
        selectedTechnicianUserIds: [TECH_1, TECH_2],
        createdAt: new Date().toISOString(),
      }),
    );

    expect(
      await readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A),
    ).toEqual({ state: 'invalid', reason: 'scope-mismatch' });
  });

  it('propagates unreadable storage so callers fail closed', async () => {
    const storage: InitialShortlistAttemptStorage = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    await expect(
      readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A),
    ).rejects.toThrow('storage unavailable');
  });

  it('stores IDs/timestamp only and no credentials or PII', async () => {
    const storage = memoryStorage();
    await saveInitialShortlistAttemptBeforePost(storage, {
      customerId: CUSTOMER_A,
      bookingId: BOOKING_A,
      baselineInvitationIds: [INVITE_OLD],
      selectedTechnicianUserIds: [TECH_1, TECH_2],
    });

    const raw = storage.dump()[initialShortlistAttemptKey(CUSTOMER_A, BOOKING_A)];
    expect(raw).not.toMatch(/token|password|phone|email|address/i);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      'baselineInvitationIds',
      'bookingId',
      'createdAt',
      'customerId',
      'selectedTechnicianUserIds',
    ]);
  });

  it('clears only the scoped marker after adjudication', async () => {
    const storage = memoryStorage();
    await saveInitialShortlistAttemptBeforePost(storage, {
      customerId: CUSTOMER_A,
      bookingId: BOOKING_A,
      baselineInvitationIds: [],
      selectedTechnicianUserIds: [TECH_1, TECH_2],
    });
    await clearInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A);
    expect(
      await readInitialShortlistAttempt(storage, CUSTOMER_A, BOOKING_A),
    ).toEqual({ state: 'absent' });
  });
});

describe('initial shortlist decisions', () => {
  it.each([
    [0, 'none'],
    [1, 'one'],
    [2, 'enough'],
    [5, 'enough'],
  ] as const)('maps %s candidates to %s', (count, expected) => {
    expect(candidateAvailabilityState(count)).toBe(expected);
  });

  it.each([
    [400, 'definitive'],
    [401, 'denied'],
    [403, 'definitive'],
    [404, 'definitive'],
    [409, 'definitive'],
    [422, 'definitive'],
    [500, 'ambiguous'],
    [503, 'ambiguous'],
  ] as const)('classifies HTTP %s as %s', (status, expected) => {
    expect(
      classifyInitialShortlistPostError({ response: { status } }),
    ).toBe(expected);
  });

  it('keeps timeout/offline/unknown errors ambiguous', () => {
    expect(
      classifyInitialShortlistPostError({ code: 'ECONNABORTED' }),
    ).toBe('ambiguous');
    expect(classifyInitialShortlistPostError(new Error('offline'))).toBe(
      'ambiguous',
    );
  });

  it('returns exact linked order only for the current owner and bidirectional IDs', () => {
    expect(verifiedLinkedOrderId(booking(), order(), CUSTOMER_A)).toBe(ORDER_A);
    expect(verifiedLinkedOrderId(booking(), order(), CUSTOMER_B)).toBeNull();
    expect(
      verifiedLinkedOrderId(
        booking(),
        order({ bookingId: BOOKING_B }),
        CUSTOMER_A,
      ),
    ).toBeNull();
    expect(
      verifiedLinkedOrderId(
        booking({ serviceOrderId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
        order(),
        CUSTOMER_A,
      ),
    ).toBeNull();
  });
});
