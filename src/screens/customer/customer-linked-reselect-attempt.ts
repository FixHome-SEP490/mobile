import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal storage surface so unit tests can inject a fake; production uses AsyncStorage. */
export interface LinkedReselectAttemptStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Ambiguous-POST attempt marker. Scoped to one signed-in customer + one Booking and
 * persisted BEFORE the linked shortlist POST is dispatched. Carries only UUIDs and a
 * timestamp — no tokens, secrets, or PII. The lock survives unmount/restart/account
 * reuse until positive new-invitation evidence or explicit server-confirmed
 * adjudication clears it. Never infer POST failure from Booking CLOSED alone.
 */
export interface LinkedReselectAttempt {
  customerId: string;
  bookingId: string;
  baselineInvitationIds: string[];
  createdAt: string;
}

/**
 * P2 tagged read result. `absent` (no stored value) is the ONLY state that permits a
 * new attempt. `valid` carries the lock; `invalid` (corrupt JSON or cross-scoped
 * payload) must be treated as LOCKED support state — never as absent, never
 * auto-cleared, never overwritten. Only explicit server-side adjudication unlocks.
 */
export type LinkedReselectAttemptRead =
  | { state: 'absent' }
  | { state: 'valid'; attempt: LinkedReselectAttempt }
  | { state: 'invalid'; reason: 'corrupt' | 'scope-mismatch' };

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !USER_UUID.test(value)) {
    throw new Error(`${label} không hợp lệ; không thể gửi yêu cầu chọn lại.`);
  }
  return value;
}

export function linkedReselectAttemptKey(customerId: string, bookingId: string): string {
  requireUuid(customerId, 'Mã khách hàng');
  requireUuid(bookingId, 'Mã Booking');
  return `linked-reselect-attempt:${customerId}:${bookingId}`;
}

function isScopedAttempt(
  value: unknown,
  customerId: string,
  bookingId: string,
): value is LinkedReselectAttempt {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LinkedReselectAttempt>;
  return candidate.customerId === customerId
    && candidate.bookingId === bookingId
    && Array.isArray(candidate.baselineInvitationIds)
    && candidate.baselineInvitationIds.every((id) => typeof id === 'string')
    && typeof candidate.createdAt === 'string';
}

/**
 * Tagged read: absent vs valid vs invalid are distinguishable. Storage read errors
 * propagate so the caller fails closed instead of assuming absence.
 */
export async function readLinkedReselectAttempt(
  storage: LinkedReselectAttemptStorage = AsyncStorage,
  customerId: string,
  bookingId: string,
): Promise<LinkedReselectAttemptRead> {
  const key = linkedReselectAttemptKey(customerId, bookingId);
  const raw = await storage.getItem(key);
  if (raw === null || raw === undefined) return { state: 'absent' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'invalid', reason: 'corrupt' };
  }
  if (!isScopedAttempt(parsed, customerId, bookingId)) {
    return { state: 'invalid', reason: 'scope-mismatch' };
  }
  return { state: 'valid', attempt: parsed };
}

/**
 * Persist the marker BEFORE dispatching the POST. Rejects on invalid IDs, on storage
 * failure, or when ANY value already exists (valid or corrupt) — an existing lock is
 * never overwritten. The caller must NOT POST in all rejection cases.
 */
export async function saveLinkedReselectAttemptBeforePost(
  storage: LinkedReselectAttemptStorage = AsyncStorage,
  input: { customerId: string; bookingId: string; baselineInvitationIds: readonly string[] },
): Promise<LinkedReselectAttempt> {
  const key = linkedReselectAttemptKey(input.customerId, input.bookingId);
  const existing = await storage.getItem(key);
  if (existing !== null && existing !== undefined) {
    throw new Error('Đã có yêu cầu chọn lại đang chờ xác nhận; không gửi thêm để tránh trùng.');
  }
  const baseline = Array.isArray(input.baselineInvitationIds)
    ? input.baselineInvitationIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const attempt: LinkedReselectAttempt = {
    customerId: input.customerId,
    bookingId: input.bookingId,
    baselineInvitationIds: baseline,
    createdAt: new Date().toISOString(),
  };
  await storage.setItem(key, JSON.stringify(attempt));
  return attempt;
}

/** Release after positive new-invitation evidence or explicit server adjudication only. */
export async function clearLinkedReselectAttempt(
  storage: LinkedReselectAttemptStorage = AsyncStorage,
  customerId: string,
  bookingId: string,
): Promise<void> {
  await storage.removeItem(linkedReselectAttemptKey(customerId, bookingId));
}
