// Uploads each device's photos once, then sends the visit; shared by the booking screen's device tabs.
import { mediaApi } from '../../api/media.api';
import { visitGroupsApi, type Visit } from '../../api/visit-groups.api';
import type { BookingSchedule } from '../../utils/booking-session';
import { buildVisitDto, type VisitDeviceDraft, type VisitPhotoDraft } from './customer-visit-draft';

export async function sendVisit(args: {
  devices: VisitDeviceDraft[];
  addressId: string;
  schedule: BookingSchedule;
  note: string;
  idempotencyKey: string;
  aiSessionId?: string;
  /** Called with the uploaded drafts so a retry reuses the ids already issued. */
  onUploaded?: (devices: VisitDeviceDraft[]) => void;
}): Promise<Visit> {
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
  return visitGroupsApi.create(buildVisitDto({ ...args, devices: withUploads }));
}
