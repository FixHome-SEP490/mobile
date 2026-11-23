// The customer's saved, unfinished booking (web booking-drafts.api.ts). One draft per customer, 30 days, no photos or URLs:
// Backend keeps only an allowlisted snapshot and checks the version on every write and on submit.
import apiClient from './client';
import type { BookingDeviceAttributes } from './catalog-pricing.api';
import type { CreateBookingDto } from './bookings.api';
import type { CreateVisitDto } from './visit-groups.api';

export interface SafeDraftItem {
  serviceId?: string;
  deviceLabel?: string;
  description?: string;
  deviceAttributes?: BookingDeviceAttributes;
  selectedVariantCode?: string;
  photoUploadIds?: string[];
}

/** Flat allowlisted Backend snapshot; UI caches and private URLs are never included. */
export interface SafeDraftSnapshot {
  addressId?: string;
  mode?: 'scheduled' | 'urgent';
  date?: string;
  slot?: 'morning' | 'afternoon' | 'evening';
  preferredStartAt?: string;
  preferredEndAt?: string;
  customerNote?: string;
  items?: SafeDraftItem[];
  kind?: 'booking' | 'visit_group';
  savedDeviceCount?: number;
  quantity?: number;
  step?: number;
}

export interface BookingDraft {
  id: string;
  version: number;
  expiresAt: string;
  snapshot: SafeDraftSnapshot;
}

export interface BookingDraftSubmitResult {
  kind: 'booking' | 'visit_group';
  bookingId: string | null;
  visitGroupId: string | null;
}

export type BookingDraftSubmitRequest =
  | { kind: 'booking'; data: CreateBookingDto }
  | { kind: 'visit_group'; data: CreateVisitDto };

/** The form labels urgency LOW/NORMAL/HIGH/EMERGENCY; Backend only knows low/medium/high/critical. */
const URGENCY: Record<string, string> = { LOW: 'low', NORMAL: 'medium', HIGH: 'high', EMERGENCY: 'critical' };
function withBackendUrgency<T extends object>(value: T): T {
  const urgency = (value as { urgency?: unknown }).urgency;
  return typeof urgency === 'string' && URGENCY[urgency] ? { ...value, urgency: URGENCY[urgency] } : value;
}
const unwrap = <T>(body: unknown): T => (body && typeof body === 'object' && 'data' in body ? (body as { data: T }).data : (body as T));

export const bookingDraftsApi = {
  async current(): Promise<BookingDraft | null> {
    return unwrap<BookingDraft | null>((await apiClient.get('/booking-drafts/current')).data);
  },

  /** `expectedVersion` is null for the first save, else the version last read: a stale one is refused with 409. */
  async save(snapshot: SafeDraftSnapshot, expectedVersion: number | null): Promise<BookingDraft> {
    return unwrap<BookingDraft>((await apiClient.put('/booking-drafts/current', { snapshot, expectedVersion })).data);
  },

  async discard(): Promise<{ deleted: boolean }> {
    return unwrap<{ deleted: boolean }>((await apiClient.delete('/booking-drafts/current')).data);
  },

  /** Sends the booking or visit through the draft: the same `operationKey` always answers with the same result. */
  async submit(draftId: string, command: { expectedVersion: number; operationKey: string; request: BookingDraftSubmitRequest }): Promise<BookingDraftSubmitResult> {
    const body = { ...command, request: { ...command.request, data: withBackendUrgency(command.request.data) } };
    return unwrap<BookingDraftSubmitResult>((await apiClient.post(`/booking-drafts/${encodeURIComponent(draftId)}/submit`, body)).data);
  },
};

/** Type guard against a body that is not a draft (an empty answer, an unexpected envelope). */
export function isBookingDraft(value: unknown): value is BookingDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Partial<BookingDraft>;
  return typeof c.id === 'string' && c.id.length > 0 && typeof c.version === 'number' && typeof c.expiresAt === 'string'
    && !!c.snapshot && typeof c.snapshot === 'object' && !Array.isArray(c.snapshot);
}

/** Quietly reads the active draft for a banner; never throws. */
export async function fetchCurrentBookingDraft(): Promise<BookingDraft | null> {
  try {
    const draft = await bookingDraftsApi.current();
    return isBookingDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

/** Vietnamese local expiry (Asia/Ho_Chi_Minh), "dd/MM/yyyy HH:mm". */
export function formatDraftExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'ngày hết hạn chưa xác định';
  const p = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const part = (type: string) => p.find((x) => x.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

/** Short summary from the flat snapshot only. */
export function describeBookingDraft(draft: BookingDraft): string {
  const snap = draft.snapshot;
  const itemCount = Array.isArray(snap.items) ? snap.items.length : 0;
  if (snap.kind === 'visit_group' || (snap.savedDeviceCount ?? 0) > 0 || itemCount > 1) {
    const count = Math.max(itemCount, snap.savedDeviceCount ?? 0);
    return count > 0 ? `Lượt nhiều thiết bị · ${count} thiết bị` : 'Lượt sửa nhiều thiết bị';
  }
  const qty = snap.quantity && snap.quantity > 1 ? ` (số lượng ${snap.quantity})` : '';
  return `Đơn đặt 1 thiết bị${qty}`;
}

export const DRAFT_PHOTOS_NOTE = 'Ảnh không được khôi phục từ bản nháp. Hãy tải lại ảnh cần thiết trước khi gửi yêu cầu.';
export const DRAFT_CHANGED = 'Bản nháp đã được cập nhật ở nơi khác. Hãy tải lại bản nháp trước khi lưu tiếp.';
export const DRAFT_SUBMIT_CHANGED = 'Bản nháp đã thay đổi ở nơi khác. Hãy tải lại bản nháp rồi gửi lại.';

/** 409 on save or submit: a stale version, an expired or already used draft. Nothing was written. */
export const isDraftConflict = (error: unknown): boolean => (error as { response?: { status?: number } } | null)?.response?.status === 409;
