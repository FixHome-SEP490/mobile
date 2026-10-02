import type { UserInfo } from '../../types';
import type { MediaUploadImage } from '../../api/media.api';

export interface CustomerAvatarAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface CustomerAvatarDeps {
  uploadImage: (image: MediaUploadImage) => Promise<{ url: string }>;
  updateProfile: (payload: { avatarUrl: string }) => Promise<UserInfo>;
}

const MIME_TO_EXTENSION: Record<MediaUploadImage['type'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function normalizeMime(value?: string | null): MediaUploadImage['type'] | null {
  if (!value) return null;
  const mime = value.toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    return mime;
  }
  return null;
}

export function normalizeCustomerAvatarAsset(
  asset: CustomerAvatarAsset,
): MediaUploadImage {
  const uri = asset.uri.trim();
  if (!uri) throw new Error('Không đọc được ảnh đã chọn.');

  const type = normalizeMime(asset.mimeType);
  if (!type) {
    throw new Error('Ảnh đại diện phải là JPEG, PNG hoặc WebP.');
  }

  const fallbackName = `avatar.${MIME_TO_EXTENSION[type]}`;
  const name = asset.fileName?.trim() || fallbackName;

  return { uri, name, type };
}

export async function persistCustomerAvatar(
  asset: CustomerAvatarAsset,
  deps: CustomerAvatarDeps,
): Promise<{ user: UserInfo; avatarUrl: string }> {
  const image = normalizeCustomerAvatarAsset(asset);
  const uploaded = await deps.uploadImage(image);
  const hostedUrl = uploaded.url.trim();

  if (!/^https?:\/\//i.test(hostedUrl)) {
    throw new Error('Không nhận được đường dẫn ảnh đại diện hợp lệ.');
  }

  const user = await deps.updateProfile({ avatarUrl: hostedUrl });
  const persistedUrl = user.avatarUrl?.trim() ?? '';
  if (!/^https?:\/\//i.test(persistedUrl)) {
    throw new Error('Hồ sơ trả về ảnh đại diện không hợp lệ.');
  }

  return { user, avatarUrl: persistedUrl };
}
