import {
  clearLinkedReselectAttempt,
  linkedReselectAttemptKey,
  readLinkedReselectAttempt,
  saveLinkedReselectAttemptBeforePost,
  type LinkedReselectAttemptRead,
  type LinkedReselectAttemptStorage,
} from './customer-linked-reselect-attempt';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = '99999999-9999-4999-8999-999999999999';
const BOOKING_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OLD_ONE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function memoryStorage(): LinkedReselectAttemptStorage & { dump(): Record<string, string> } {
  const cells = new Map<string, string>();
  return {
    dump: () => Object.fromEntries(cells),
    getItem: async (key: string) => (cells.has(key) ? cells.get(key)! : null),
    setItem: async (key: string, value: string) => { cells.set(key, value); },
    removeItem: async (key: string) => { cells.delete(key); },
  };
}

describe('R09/R10 linked reselect attempt lock (AsyncStorage-safe, UUID-scoped)', () => {
  it('R09 persists an account+booking marker BEFORE dispatch and reads it back across restart', async () => {
    const storage = memoryStorage();
    const saved = await saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [OLD_ONE],
    });
    expect(saved.customerId).toBe(CUSTOMER_A);
    expect(saved.bookingId).toBe(BOOKING_A);
    // A fresh reader (restart) still sees the lock: no further POST until adjudication.
    const reread: LinkedReselectAttemptRead = await readLinkedReselectAttempt(memoryStorageProxy(storage), CUSTOMER_A, BOOKING_A);
    expect(reread).toEqual({ state: 'valid', attempt: saved });
  });
  it('absent key reads as absent (only this state permits a new attempt)', async () => {
    expect(await readLinkedReselectAttempt(memoryStorage(), CUSTOMER_A, BOOKING_A)).toEqual({ state: 'absent' });
  });
  it('R09 failed persistence rejects so the caller must NOT POST', async () => {
    const failing: LinkedReselectAttemptStorage = {
      getItem: async () => null,
      setItem: async () => { throw new Error('disk full'); },
      removeItem: async () => {},
    };
    await expect(saveLinkedReselectAttemptBeforePost(failing, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [],
    })).rejects.toThrow();
    expect(await readLinkedReselectAttempt(failing, CUSTOMER_A, BOOKING_A)).toEqual({ state: 'absent' });
  });
  it('R10 account switch and booking isolation: another customer or booking reads absent', async () => {
    const storage = memoryStorage();
    await saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [],
    });
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_B, BOOKING_A)).toEqual({ state: 'absent' });
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_B)).toEqual({ state: 'absent' });
  });
  it('R10 wrong or malformed IDs never touch storage and fail closed', async () => {
    const storage = memoryStorage();
    expect(() => linkedReselectAttemptKey('not-a-uuid', BOOKING_A)).toThrow();
    expect(() => linkedReselectAttemptKey(CUSTOMER_A, '')).toThrow();
    await expect(readLinkedReselectAttempt(storage, 'not-a-uuid', BOOKING_A)).rejects.toThrow();
    expect(storage.dump()).toEqual({});
  });
  it('stores only owner/booking UUIDs plus baseline IDs (no tokens or PII)', async () => {
    const storage = memoryStorage();
    await saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [OLD_ONE],
    });
    const raw = storage.dump()[linkedReselectAttemptKey(CUSTOMER_A, BOOKING_A)];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['baselineInvitationIds', 'bookingId', 'createdAt', 'customerId']);
    expect(JSON.stringify(parsed)).not.toMatch(/token|secret|password|phone/i);
  });
  it('P2 corrupt payload reads invalid (LOCKED support, never treated as absent)', async () => {
    const storage = memoryStorage();
    const key = linkedReselectAttemptKey(CUSTOMER_A, BOOKING_A);
    await saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [],
    });
    await storage.setItem(key, 'not-json{{{');
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_A)).toEqual({ state: 'invalid', reason: 'corrupt' });
    // A fresh reader after restart still sees invalid: no blind POST, no auto clear.
    expect(await readLinkedReselectAttempt(memoryStorageProxy(storage), CUSTOMER_A, BOOKING_A)).toEqual({ state: 'invalid', reason: 'corrupt' });
  });
  it('P2 cross-scoped payload reads invalid (never trusted as this account+booking lock)', async () => {
    const storage = memoryStorage();
    const key = linkedReselectAttemptKey(CUSTOMER_A, BOOKING_A);
    await storage.setItem(key, JSON.stringify({
      customerId: CUSTOMER_B, bookingId: BOOKING_A, baselineInvitationIds: [], createdAt: new Date().toISOString(),
    }));
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_A)).toEqual({ state: 'invalid', reason: 'scope-mismatch' });
  });
  it('P2 save refuses to overwrite an existing valid marker (original lock preserved)', async () => {
    const storage = memoryStorage();
    const first = await saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [OLD_ONE],
    });
    await expect(saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [],
    })).rejects.toThrow();
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_A)).toEqual({ state: 'valid', attempt: first });
  });
  it('P2 save refuses to overwrite a corrupt marker (raw evidence preserved, no auto clear)', async () => {
    const storage = memoryStorage();
    const key = linkedReselectAttemptKey(CUSTOMER_A, BOOKING_A);
    await storage.setItem(key, 'not-json{{{');
    await expect(saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [OLD_ONE],
    })).rejects.toThrow();
    expect(storage.dump()[key]).toBe('not-json{{{');
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_A)).toEqual({ state: 'invalid', reason: 'corrupt' });
  });
  it('P2 explicit adjudication clear releases a valid lock back to absent', async () => {
    const storage = memoryStorage();
    await saveLinkedReselectAttemptBeforePost(storage, {
      customerId: CUSTOMER_A, bookingId: BOOKING_A, baselineInvitationIds: [],
    });
    await clearLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_A);
    expect(await readLinkedReselectAttempt(storage, CUSTOMER_A, BOOKING_A)).toEqual({ state: 'absent' });
  });
  it('P2 unreadable storage propagates so the caller fails closed instead of assuming absent', async () => {
    const broken: LinkedReselectAttemptStorage = {
      getItem: async () => { throw new Error('storage unavailable'); },
      setItem: async () => {},
      removeItem: async () => {},
    };
    await expect(readLinkedReselectAttempt(broken, CUSTOMER_A, BOOKING_A)).rejects.toThrow();
  });
});

function memoryStorageProxy(storage: LinkedReselectAttemptStorage): LinkedReselectAttemptStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}
