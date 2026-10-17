import apiClient from './client';

export interface MediaUploadImage {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface UploadedPublicMedia {
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

const MEDIA_UPLOAD_TIMEOUT = 60_000;
const BOOKING_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UploadedBookingPhoto {
  uploadId: string;
  mimeType: MediaUploadImage['type'];
  sizeBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && 'data' in value) return value.data;
  return value;
}

function normalizeUploadedMedia(value: unknown): UploadedPublicMedia {
  const raw = unwrapData(value);
  if (!isRecord(raw)) {
    throw new Error('Backend trả về ảnh đại diện không hợp lệ.');
  }

  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim() : '';
  const filename = typeof raw.filename === 'string' ? raw.filename.trim() : '';
  const sizeBytes = Number(raw.sizeBytes);

  if (
    !/^https?:\/\//i.test(url)
    || !/^image\/(jpeg|png|webp)$/i.test(mimeType)
    || !filename
    || !Number.isFinite(sizeBytes)
    || sizeBytes <= 0
  ) {
    throw new Error('Backend trả về ảnh đại diện không hợp lệ.');
  }

  return { url, mimeType, sizeBytes, filename };
}

function normalizeUploadedBookingPhoto(value: unknown): UploadedBookingPhoto {
  const raw = isRecord(value) && isRecord(value.data) ? value.data : null;
  const uploadId = typeof raw?.uploadId === 'string' ? raw.uploadId.trim() : '';
  const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : '';
  const sizeBytes = raw?.sizeBytes;

  if (
    !UUID_PATTERN.test(uploadId)
    || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
    || typeof sizeBytes !== 'number'
    || !Number.isInteger(sizeBytes)
    || sizeBytes <= 0
    || sizeBytes > BOOKING_PHOTO_MAX_BYTES
  ) {
    throw new Error('Backend trả về thông tin ảnh yêu cầu không hợp lệ.');
  }

  return {
    uploadId,
    mimeType: mimeType as MediaUploadImage['type'],
    sizeBytes,
  };
}

const BOOKING_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const BOOKING_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export interface MediaUploadVideo {
  uri: string;
  name: string;
  type: string;
}

export interface UploadedBookingVideo {
  uploadId: string;
  mimeType: string;
  sizeBytes: number;
}

function normalizeUploadedBookingVideo(value: unknown): UploadedBookingVideo {
  const raw = isRecord(value) && isRecord(value.data) ? value.data : null;
  const uploadId = typeof raw?.uploadId === 'string' ? raw.uploadId.trim() : '';
  const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : '';
  const sizeBytes = raw?.sizeBytes;
  if (
    !UUID_PATTERN.test(uploadId)
    || !BOOKING_VIDEO_TYPES.includes(mimeType)
    || typeof sizeBytes !== 'number'
    || !Number.isInteger(sizeBytes)
    || sizeBytes <= 0
    || sizeBytes > BOOKING_VIDEO_MAX_BYTES
  ) {
    throw new Error('Backend trả về thông tin video yêu cầu không hợp lệ.');
  }
  return { uploadId, mimeType, sizeBytes };
}

export const mediaApi = {
  async uploadPublicImage(image: MediaUploadImage): Promise<UploadedPublicMedia> {
    const form = new FormData();
    form.append('file', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as unknown as Blob);

    const response = await apiClient.post('/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: MEDIA_UPLOAD_TIMEOUT,
    });

    return normalizeUploadedMedia(response.data);
  },

  async uploadBookingPhoto(image: MediaUploadImage): Promise<UploadedBookingPhoto> {
    const form = new FormData();
    form.append('file', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as unknown as Blob);

    const response = await apiClient.post('/media/booking-photo-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: MEDIA_UPLOAD_TIMEOUT,
    });

    if (response.status !== 201) {
      throw new Error('Không xác nhận được ảnh yêu cầu đã tải lên.');
    }

    return normalizeUploadedBookingPhoto(response.data);
  },

  /** A short private video of the problem (PO 18/10/2026): mp4/mov/webm up to 50 MB, never sent to the AI. */
  async uploadBookingVideo(video: MediaUploadVideo): Promise<UploadedBookingVideo> {
    const form = new FormData();
    form.append('file', { uri: video.uri, name: video.name, type: video.type } as unknown as Blob);
    const response = await apiClient.post('/media/booking-video-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180_000,
    });
    if (response.status !== 201) throw new Error('Không xác nhận được video yêu cầu đã tải lên.');
    return normalizeUploadedBookingVideo(response.data);
  },
};
