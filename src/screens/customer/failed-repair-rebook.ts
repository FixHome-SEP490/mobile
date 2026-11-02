// The rebook rules for a device that was not repaired (web #175, backend #159) and for one a manager closed
// (web #183, backend #168), kept apart from the screen so they are tested on their own. Both read a frozen
// server draft, ask only for a new time, and book again; they differ in the endpoint and in what names the source.

import type { BookingSlot, RepairFailureRebookDto } from '../../api/bookings.api';
import { bookingsApi } from '../../api/bookings.api';

/** `failure`: the technician reported "Không sửa được". `interruption`: a manager closed the job so the customer can book again. */
export type RebookKind = 'failure' | 'interruption';

export interface RepairFailureDraftItem {
  sourceBookingId: string;
  /** The incident of a failed repair, or the support case of an interruption. */
  sourceIncidentId: string;
  serviceId: string;
  deviceLabel: string | null;
  selectedVariantCode: string | null;
  description: string;
}

export interface RepairFailureDraft {
  kind: RebookKind;
  targetKind: 'booking' | 'visit_group';
  address: { id: string; text: string | null };
  customerNote: string | null;
  items: RepairFailureDraftItem[];
}

export const DRAFT_NOT_READY = 'Dữ liệu đặt lại chưa sẵn sàng. Vui lòng mở lại từ máy không sửa được.';
export const INTERRUPTION_NOT_READY = 'Dữ liệu đặt lịch mới chưa sẵn sàng. Vui lòng mở lại từ đơn đã dừng.';
export const REBOOK_UNCLEAR = 'Chưa xác nhận được kết quả đặt lại. Vui lòng kiểm tra Hoạt động trước khi đặt lại.';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);

const SOURCE_FIELD: Record<RebookKind, string> = { failure: 'sourceIncidentId', interruption: 'sourceCaseId' };
const CONFIRM_PATH: Record<RebookKind, string> = { failure: 'repair-failure-rebook', interruption: 'interruption-rebook' };
export const rebookNotReady = (kind: RebookKind): string => (kind === 'interruption' ? INTERRUPTION_NOT_READY : DRAFT_NOT_READY);

/**
 * The draft as the server froze it, or an error. Up to three devices, each once; one device makes a booking and
 * two or three make a visit; the new schedule and the price check are the server's.
 */
export function parseRepairFailureDraft(data: unknown, anchor: string, sources: string[], kind: RebookKind = 'failure'): RepairFailureDraft {
  const fail = () => new Error(rebookNotReady(kind));
  if (!isRecord(data) || !isRecord(data.confirmation) || data.confirmation.available !== true
    || data.confirmation.path !== `/api/v1/bookings/${anchor}/${CONFIRM_PATH[kind]}`
    || data.requiresNewSchedule !== true || !isRecord(data.address) || !isId(data.address.id)
    || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 3
    || data.targetKind !== (data.items.length === 1 ? 'booking' : 'visit_group')
    || (data.customerNote !== null && typeof data.customerNote !== 'string')) throw fail();
  const seen = new Set<string>();
  const refs = new Set<string>();
  const items: RepairFailureDraftItem[] = [];
  for (const item of data.items) {
    const ref = isRecord(item) ? item[SOURCE_FIELD[kind]] : null;
    if (!isRecord(item) || !isId(item.sourceBookingId) || seen.has(item.sourceBookingId)
      || !isId(ref) || refs.has(ref) || !isId(item.serviceId)
      || item.quantity !== 1 || typeof item.description !== 'string'
      || (item.selectedVariantCode !== null && typeof item.selectedVariantCode !== 'string')) throw fail();
    seen.add(item.sourceBookingId);
    refs.add(ref);
    items.push({
      sourceBookingId: item.sourceBookingId,
      sourceIncidentId: ref,
      serviceId: item.serviceId,
      deviceLabel: typeof item.deviceLabel === 'string' ? item.deviceLabel : null,
      selectedVariantCode: item.selectedVariantCode as string | null,
      description: item.description,
    });
  }
  if (!sources.every((id) => seen.has(id))) throw fail();
  return {
    kind,
    targetKind: data.targetKind as RepairFailureDraft['targetKind'],
    address: { id: data.address.id, text: typeof data.address.text === 'string' ? data.address.text : null },
    customerNote: data.customerNote as string | null,
    items,
  };
}

export function buildRebookDto(draft: RepairFailureDraft, schedule: { date: string; slot: BookingSlot }, idempotencyKey: string): RepairFailureRebookDto {
  return {
    idempotencyKey,
    addressId: draft.address.id,
    date: schedule.date,
    slot: schedule.slot,
    ...(draft.customerNote ? { customerNote: draft.customerNote } : {}),
    items: draft.items.map((item) => ({
      sourceBookingId: item.sourceBookingId,
      ...(draft.kind === 'interruption' ? { sourceCaseId: item.sourceIncidentId } : { sourceIncidentId: item.sourceIncidentId }),
      ...(item.selectedVariantCode ? { selectedVariantCode: item.selectedVariantCode } : {}),
      description: item.description,
    })),
  };
}

/** Where the customer lands: the new booking's candidates or the new visit. Anything else is an unclear answer. */
export function parseRebookResult(data: unknown, draft: RepairFailureDraft): { kind: 'booking' | 'visit'; id: string } {
  const group = draft.targetKind === 'visit_group';
  const field = SOURCE_FIELD[draft.kind];
  if (!isRecord(data) || data.targetKind !== draft.targetKind || !Array.isArray(data.items) || data.items.length !== draft.items.length
    || new Set(data.items.map((item) => (isRecord(item) ? item.bookingId : null))).size !== draft.items.length
    || data.items.some((item) => !isRecord(item) || !isId(item.bookingId)
      || !draft.items.some((source) => source.sourceBookingId === item.sourceBookingId && source.sourceIncidentId === item[field]))) {
    throw new Error(REBOOK_UNCLEAR);
  }
  const id = group ? data.visitGroupId : data.bookingId;
  if (!isId(id) || (group ? data.bookingId !== null : data.visitGroupId !== null)) throw new Error(REBOOK_UNCLEAR);
  return { kind: group ? 'visit' : 'booking', id };
}

/** The devices of a visit that could not be repaired, in the visit's order. */
export function failedBookingIds(
  items: { booking?: { id?: string } | null }[] | undefined,
  devices: { bookingId: string; state: string }[] | undefined,
): string[] {
  return (items ?? []).flatMap((item) => {
    const id = item.booking?.id;
    return id && devices?.some((device) => device.bookingId === id && device.state === 'failed') ? [id] : [];
  });
}

/** How a cancelled booking can be booked again: from a failed repair, from a manager's interruption, or the ordinary "Đặt lại thợ". */
export type CancelledRebookKind = 'repair-failure' | 'interrupted' | 'ordinary';
export interface CancelledRebookSource {
  kind: CancelledRebookKind;
  /** The bookings to book again when `kind` is `repair-failure`. */
  sourceBookingIds: string[];
}

/**
 * Asks the server which kind of cancellation this was, the way the web does: a verified failed-repair draft first (403 and 404
 * mean there is none), then a resolved support case of this order that closed it for rebooking. An unreadable answer throws
 * so the caller can offer a retry and never guesses a kind.
 */
export async function classifyCancelledBooking(
  bookingId: string,
  orderId: string | null,
  listCases: (orderId: string) => Promise<{ bookingId: string | null; caseType: string; status: string; serviceOrderId: string | null; resolutionCode?: string | null }[]>,
  readDraft: (bookingId: string) => Promise<unknown> = bookingsApi.getRepairFailureDraft,
): Promise<CancelledRebookSource> {
  let draft: unknown = null;
  try {
    draft = await readDraft(bookingId);
  } catch (error) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (status !== 403 && status !== 404) throw error;
  }
  if (draft !== null) {
    const items = isRecord(draft) && Array.isArray(draft.items) ? draft.items : [];
    const sources = items.map((item) => (isRecord(item) && typeof item.sourceBookingId === 'string' ? item.sourceBookingId : ''));
    parseRepairFailureDraft(draft, bookingId, sources);
    if (!sources.includes(bookingId)) throw new Error(DRAFT_NOT_READY);
    return { kind: 'repair-failure', sourceBookingIds: sources };
  }
  if (!orderId) return { kind: 'ordinary', sourceBookingIds: [] };
  const cases = (await listCases(orderId)).filter((item) => item.resolutionCode === 'interrupted_for_rebook');
  if (!cases.length) return { kind: 'ordinary', sourceBookingIds: [] };
  const matching = cases.some((item) => (item.bookingId === bookingId || (item.bookingId === null && item.caseType === 'technician_replacement'))
    && item.serviceOrderId === orderId && ['mid_job_interruption', 'technician_replacement'].includes(item.caseType) && item.status === 'resolved');
  // A resolved interruption that does not describe this booking is not evidence for it, and not for "ordinary" either.
  if (!matching) throw new Error(INTERRUPTION_NOT_READY);
  return { kind: 'interrupted', sourceBookingIds: [bookingId] };
}
