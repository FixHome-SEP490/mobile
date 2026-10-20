import apiClient from './client';
import { APP_CONFIG } from '../constants';
import { storageService } from '../services/storage.service';

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

/** Upload progress and cancellation, for uploads that must survive a weak connection (PO 18/10/2026). */
export interface UploadProgressOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** With progress the caller watches for a stall instead of a fixed timeout. */
const progressConfig = (opts: UploadProgressOptions, fallbackTimeout: number) => ({
  timeout: opts.onProgress ? 0 : fallbackTimeout,
  ...(opts.signal ? { signal: opts.signal } : {}),
  ...(opts.onProgress
    ? { onUploadProgress: (event: { loaded: number; total?: number }) => { if (event.total) opts.onProgress?.(event.loaded / event.total); } }
    : {}),
});

/** A short-lived link a video player streams and seeks (PO 18/10/2026); paths are relative to the API base. */
export interface VideoLink {
  url: string;
  posterUrl: string;
  expiresAt: string;
}

/** Validates a viewing-link answer: the paths must point at our own streaming routes. */
export function toVideoLink(data: unknown, prefix: string): VideoLink {
  const link = data as Partial<VideoLink> | null;
  if (!link || typeof link.url !== 'string' || !link.url.startsWith(prefix)
    || typeof link.posterUrl !== 'string' || typeof link.expiresAt !== 'string') {
    throw new Error('Unexpected API response: invalid video link');
  }
  return { url: link.url, posterUrl: link.posterUrl, expiresAt: link.expiresAt };
}

export const apiUrl = (path: string) => `${APP_CONFIG.API_BASE_URL}${path}`;

export const mediaApi = {
  /** A viewing link for a booking video: the player streams it instead of downloading it whole. */
  async getBookingVideoLink(bookingId: string, mediaId: string): Promise<VideoLink> {
    const res = await apiClient.get(`/bookings/${encodeURIComponent(bookingId)}/media/${encodeURIComponent(mediaId)}/stream`);
    return toVideoLink(isRecord(res.data) && 'data' in res.data ? res.data.data : res.data, '/bookings/media/stream/');
  },

  /**
   * A private booking photo as a data URI. Read through apiClient (not `<Image headers>`) so an expired
   * access token is refreshed and the photo also shows on web, where Image ignores request headers.
   */
  async getBookingPhotoUri(bookingId: string, mediaId: string): Promise<string> {
    const res = await apiClient.get(
      `/bookings/${encodeURIComponent(bookingId)}/media/${encodeURIComponent(mediaId)}/content`,
      { responseType: 'blob' },
    );
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unreadable photo')));
      reader.onerror = () => reject(reader.error ?? new Error('Unreadable photo'));
      reader.readAsDataURL(res.data as Blob);
    });
  },

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

  async uploadBookingPhoto(image: MediaUploadImage, opts: UploadProgressOptions = {}): Promise<UploadedBookingPhoto> {
    const form = new FormData();
    form.append('file', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as unknown as Blob);

    const response = await apiClient.post('/media/booking-photo-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...progressConfig(opts, MEDIA_UPLOAD_TIMEOUT),
    });

    if (response.status !== 201) {
      throw new Error('Không xác nhận được ảnh yêu cầu đã tải lên.');
    }

    return normalizeUploadedBookingPhoto(response.data);
  },

  /** A short private video of the problem (PO 18/10/2026): mp4/mov/webm up to 50 MB, never sent to the AI. */
  async uploadBookingVideo(video: MediaUploadVideo, opts: UploadProgressOptions = {}): Promise<UploadedBookingVideo> {
    const form = new FormData();
    form.append('file', { uri: video.uri, name: video.name, type: video.type } as unknown as Blob);
    const response = await apiClient.post('/media/booking-video-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...progressConfig(opts, 180_000),
    });
    if (response.status !== 201) throw new Error('Không xác nhận được video yêu cầu đã tải lên.');
    return normalizeUploadedBookingVideo(response.data);
  },
};
