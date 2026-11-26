// Uploads each device's photos once, then sends the visit; shared by the booking screen's device tabs.
import { mediaApi } from '../../api/media.api';
import { visitGroupsApi, type Visit } from '../../api/visit-groups.api';
import type { BookingSchedule } from '../../utils/booking-session';
import { buildVisitDto, type VisitDeviceDraft, type VisitPhotoDraft } from './customer-visit-draft';
import { bookingDraftsApi } from '../../api/booking-drafts.api';

export async function sendVisit(args: {
  devices: VisitDeviceDraft[];
  addressId: string;
  schedule: BookingSchedule;
  note: string;
  idempotencyKey: string;
  aiSessionId?: string;
  /** Called with the uploaded drafts so a retry reuses the ids already issued. */
  onUploaded?: (devices: VisitDeviceDraft[]) => void;
  /** Send through the saved draft (web "submit" of the draft): the draft is consumed with the visit. */
  draft?: { id: string; version: number; operationKey: string };
}): Promise<Pick<Visit, 'id' | 'leadBookingId'>> {
  const withUploads: VisitDeviceDraft[] = [];
  for (const device of args.devices) {
    const photos: VisitPhotoDraft[] = [];
    for (const photo of device.photos) {
      if (photo.uploadId) { photos.push(photo); continue; }
      const up = await mediaApi.uploadBookingPhoto({ uri: photo.uri, name: photo.name, type: photo.type });
      photos.push({ ...photo, uploadId: up.uploadId });
    }
    withUploads.push({ ...device, photos });
  }
  args.onUploaded?.(withUploads);
  const dto = buildVisitDto({ ...args, devices: withUploads });
  if (!args.draft) return visitGroupsApi.create(dto);
  const sent = await bookingDraftsApi.submit(args.draft.id, {
    expectedVersion: args.draft.version, operationKey: args.draft.operationKey, request: { kind: 'visit_group', data: dto },
  });
  if (!sent.visitGroupId) throw new Error('Chưa xác nhận được mã lượt sửa từ bản nháp.');
  return { id: sent.visitGroupId, leadBookingId: sent.bookingId ?? null };
}
