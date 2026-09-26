import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BookingItem } from '../../api/bookings.api';
import type { ServiceOrderItem } from '../../api/orders.api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InitialShortlistAttemptStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface InitialShortlistAttempt {
  customerId: string;
  bookingId: string;
  baselineInvitationIds: string[];
  selectedTechnicianUserIds: string[];
  createdAt: string;
}

export type InitialShortlistAttemptRead =
  | { state: 'absent' }
  | { state: 'valid'; attempt: InitialShortlistAttempt }
  | { state: 'invalid'; reason: 'corrupt' | 'scope-mismatch' };

export type InitialShortlistPostErrorClass =
  | 'denied'
  | 'definitive'
  | 'ambiguous';

export type CandidateAvailabilityState = 'none' | 'one' | 'enough';

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error(`${label} không hợp lệ; không thể gửi lời mời.`);
  }
  return value;
}

export function initialShortlistAttemptKey(
  customerId: string,
  bookingId: string,
): string {
  requireUuid(customerId, 'Mã khách hàng');
  requireUuid(bookingId, 'Mã Booking');
  return `initial-shortlist-attempt:${customerId}:${bookingId}`;
}

function isAttempt(
  value: unknown,
  customerId: string,
  bookingId: string,
): value is InitialShortlistAttempt {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<InitialShortlistAttempt>;
  return (
    candidate.customerId === customerId &&
    candidate.bookingId === bookingId &&
    Array.isArray(candidate.baselineInvitationIds) &&
    candidate.baselineInvitationIds.every(
      (id) => typeof id === 'string' && UUID.test(id),
    ) &&
    Array.isArray(candidate.selectedTechnicianUserIds) &&
    candidate.selectedTechnicianUserIds.length >= 1 &&
    candidate.selectedTechnicianUserIds.length <= 2 &&
    new Set(candidate.selectedTechnicianUserIds).size ===
      candidate.selectedTechnicianUserIds.length &&
    candidate.selectedTechnicianUserIds.every(
      (id) => typeof id === 'string' && UUID.test(id),
    ) &&
    typeof candidate.createdAt === 'string'
  );
}

export async function readInitialShortlistAttempt(
  storage: InitialShortlistAttemptStorage = AsyncStorage,
  customerId: string,
  bookingId: string,
): Promise<InitialShortlistAttemptRead> {
  const key = initialShortlistAttemptKey(customerId, bookingId);
  const raw = await storage.getItem(key);
  if (raw === null || raw === undefined) return { state: 'absent' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'invalid', reason: 'corrupt' };
  }

  if (!isAttempt(parsed, customerId, bookingId)) {
    return { state: 'invalid', reason: 'scope-mismatch' };
  }
  return { state: 'valid', attempt: parsed };
}

export async function saveInitialShortlistAttemptBeforePost(
  storage: InitialShortlistAttemptStorage = AsyncStorage,
  input: {
    customerId: string;
    bookingId: string;
    baselineInvitationIds: readonly string[];
    selectedTechnicianUserIds: readonly string[];
  },
): Promise<InitialShortlistAttempt> {
  const key = initialShortlistAttemptKey(input.customerId, input.bookingId);
  const existing = await storage.getItem(key);
  if (existing !== null && existing !== undefined) {
    throw new Error(
      'Đã có lượt mời đang chờ xác minh; không gửi thêm để tránh trùng.',
    );
  }

  const selected = input.selectedTechnicianUserIds.map((id) =>
    requireUuid(id, 'Mã kỹ thuật viên'),
  );
  if (selected.length < 1 || selected.length > 2 || new Set(selected).size !== selected.length) {
    throw new Error('Phải chọn 1 hoặc 2 kỹ thuật viên khác nhau.');
  }

  const baseline = input.baselineInvitationIds.map((id) =>
    requireUuid(id, 'Mã lời mời'),
  );

  const attempt: InitialShortlistAttempt = {
    customerId: requireUuid(input.customerId, 'Mã khách hàng'),
    bookingId: requireUuid(input.bookingId, 'Mã Booking'),
    baselineInvitationIds: baseline,
    selectedTechnicianUserIds: selected,
    createdAt: new Date().toISOString(),
  };
  await storage.setItem(key, JSON.stringify(attempt));
  return attempt;
}

export async function clearInitialShortlistAttempt(
  storage: InitialShortlistAttemptStorage = AsyncStorage,
  customerId: string,
  bookingId: string,
): Promise<void> {
  await storage.removeItem(initialShortlistAttemptKey(customerId, bookingId));
}

export function classifyInitialShortlistPostError(
  error: unknown,
): InitialShortlistPostErrorClass {
  const status = (error as { response?: { status?: unknown } } | null)?.response
    ?.status;
  if (status === 401) return 'denied';
  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422
  ) {
    return 'definitive';
  }
  return 'ambiguous';
}

export function candidateAvailabilityState(
  count: number,
): CandidateAvailabilityState {
  if (!Number.isFinite(count) || count <= 0) return 'none';
  if (count === 1) return 'one';
  return 'enough';
}

export function verifiedLinkedOrderId(
  booking: BookingItem | null | undefined,
  order: ServiceOrderItem | null | undefined,
  currentCustomerId: string | null | undefined,
): string | null {
  if (!booking || !order || !currentCustomerId) return null;
  if (booking.customerId !== currentCustomerId) return null;
  if (!booking.serviceOrderId) return null;
  if (booking.serviceOrderId !== order.id) return null;
  if (order.bookingId !== booking.id) return null;
  return order.id;
}
