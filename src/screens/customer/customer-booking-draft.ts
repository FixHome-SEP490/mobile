// Turns the booking form into a draft snapshot and back (web NewBookingWizardPage buildSafeDraftSnapshot / resumeBookingDraft).
// Pure: the screen owns the state, this owns the rules, so each can be tested alone. Photos never travel in a draft.
import type { BookingDraft, SafeDraftItem, SafeDraftSnapshot } from '../../api/booking-drafts.api';
import type { BookingDeviceAttributes } from '../../api/catalog-pricing.api';
import type { BookingSchedule } from '../../utils/booking-session';
import type { VisitDeviceDraft } from './customer-visit-draft';

const VARIANT_CODE = /^[A-Z]{2}-\d{2}-\d{2}$/;

/** Today's date in Vietnam as YYYY-MM-DD: the first day a saved appointment can still be on. */
export const vnTodayKey = (now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const URL_LIKE = /(?:https?:|data:|blob:|file:|www\.)/i;

/** What Backend would refuse in a draft text (links), so the customer is told before saving instead of after. */
export const draftTextProblem = (text: string): string | null => (URL_LIKE.test(text) ? 'Mô tả và ghi chú không lưu nháp được khi có đường dẫn (http, www). Hãy xóa đường dẫn rồi lưu.' : null);

export function hasDraftInput(devices: Pick<VisitDeviceDraft, 'serviceId' | 'description'>[], note: string): boolean {
  return devices.some((d) => !!d.serviceId || d.description.trim().length > 0) || note.trim().length > 0;
}

function item(device: VisitDeviceDraft): SafeDraftItem {
  const safe: SafeDraftItem = {};
  if (device.serviceId) safe.serviceId = device.serviceId;
  const description = device.description.trim();
  if (description) safe.description = description.slice(0, 5000);
  const attrs = device.deviceAttributes;
  if (attrs && Object.keys(attrs).length > 0) safe.deviceAttributes = { ...attrs };
  if (device.selectedVariantCode && VARIANT_CODE.test(device.selectedVariantCode)) safe.selectedVariantCode = device.selectedVariantCode;
  return safe;
}

export function buildDraftSnapshot(input: {
  devices: VisitDeviceDraft[];
  addressId: string | null;
  schedule: BookingSchedule | null;
  note: string;
  /** 1 while the form is being filled; 4 once the customer reached the review. */
  step?: number;
}): SafeDraftSnapshot {
  const items = input.devices.slice(0, 5).map(item);
  const snapshot: SafeDraftSnapshot = {
    kind: items.length > 1 ? 'visit_group' : 'booking',
    // Backend: saved devices are all but the one being edited, so with n items it is n - 1 (never above n).
    savedDeviceCount: Math.max(0, items.length - 1),
    step: input.step ?? 1,
    items,
  };
  if (input.addressId) snapshot.addressId = input.addressId;
  if (input.schedule?.mode === 'urgent') snapshot.mode = 'urgent';
  else if (input.schedule) { snapshot.mode = 'scheduled'; snapshot.date = input.schedule.date; snapshot.slot = input.schedule.slot; }
  const note = input.note.trim();
  if (note) snapshot.customerNote = note.slice(0, 1000);
  return snapshot;
}

export interface DraftFormState {
  /** Máy 1; null when its service is gone. */
  main: { serviceId: string; description: string; attrs: BookingDeviceAttributes; variantCode: string | null } | null;
  extras: VisitDeviceDraft[];
  addressId: string | null;
  schedule: BookingSchedule | null;
  note: string;
  warnings: string[];
}

interface ServiceLike { id: string; name: string; code?: string | null; priceSummary?: unknown }

/** The saved form, checked against what still exists today. Whatever is gone is dropped and named in `warnings`. */
export function draftToFormState(
  draft: BookingDraft,
  context: { services: ServiceLike[]; addressIds: string[]; todayKey: string; deviceLimit: number },
): DraftFormState {
  const snap = draft.snapshot;
  const warnings: string[] = [];
  const items = Array.isArray(snap.items) ? snap.items.slice(0, context.deviceLimit) : [];
  const known = (id?: string) => (id ? context.services.find((s) => s.id === id) : undefined);

  let main: DraftFormState['main'] = null;
  const first = items[0];
  if (first) {
    if (first.serviceId && !known(first.serviceId)) warnings.push('Dịch vụ của máy 1 không còn được nhận. Hãy chọn lại dịch vụ.');
    else main = {
      serviceId: first.serviceId ?? '', description: first.description ?? '',
      attrs: first.deviceAttributes ?? {}, variantCode: first.selectedVariantCode ?? null,
    };
  }

  const extras: VisitDeviceDraft[] = [];
  items.slice(1).forEach((saved, index) => {
    const service = known(saved.serviceId);
    if (!service) { warnings.push(`Máy ${index + 2}: dịch vụ đã lưu không còn được nhận, máy này bị bỏ.`); return; }
    extras.push({
      key: `d-${index + 1}`, serviceId: service.id, serviceName: service.name, serviceCode: service.code ?? null,
      priceSummary: (service.priceSummary as VisitDeviceDraft['priceSummary']) ?? null,
      description: saved.description ?? '', photos: [],
      ...(saved.deviceAttributes ? { deviceAttributes: saved.deviceAttributes } : {}),
      ...(saved.selectedVariantCode ? { selectedVariantCode: saved.selectedVariantCode } : {}),
    });
  });

  let addressId: string | null = null;
  if (snap.addressId) {
    if (context.addressIds.includes(snap.addressId)) addressId = snap.addressId;
    else warnings.push('Địa chỉ đã lưu không còn trong sổ địa chỉ. Hãy chọn lại địa chỉ.');
  }

  let schedule: BookingSchedule | null = null;
  if (snap.mode === 'urgent') schedule = { mode: 'urgent' };
  else if (snap.mode === 'scheduled' && snap.date && snap.slot) {
    if (snap.date >= context.todayKey) schedule = { mode: 'scheduled', date: snap.date, slot: snap.slot };
    else warnings.push('Buổi hẹn đã lưu không còn khả dụng. Hãy chọn lại ngày và buổi.');
  }

  return { main, extras, addressId, schedule, note: snap.customerNote ?? '', warnings };
}
