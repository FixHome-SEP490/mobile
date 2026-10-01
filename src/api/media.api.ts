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
};
