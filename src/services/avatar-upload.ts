// Ảnh đại diện dùng chung cho khách hàng và kỹ thuật viên.
//
// `backend` chỉ nhận URL http(s) ở `PATCH /users/me`, nên ảnh chọn trên máy
// phải qua `POST /media/upload` trước; đường dẫn `file://` không bao giờ được
// gửi thẳng vào hồ sơ. Người khác (khách xem kỹ thuật viên ở màn tìm thợ hay
// trong đơn) chỉ thấy được ảnh đã lưu trên máy chủ.
import type { UserInfo } from '../types';
import type { MediaUploadImage } from '../api/media.api';
import { extractApiErrorMessage } from '../utils/input-validation';

export interface AvatarAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface AvatarUploadDeps {
  uploadImage: (image: MediaUploadImage) => Promise<{ url: string }>;
  updateProfile: (payload: { avatarUrl: string }) => Promise<UserInfo>;
}

/** Lỗi do chính app phát hiện, câu đã là tiếng Việt cho người dùng. */
export class AvatarUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarUploadError';
  }
}

export interface PersistedAvatar {
  user: UserInfo;
  avatarUrl: string;
}

const MIME_TO_EXTENSION: Record<MediaUploadImage['type'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const HOSTED_URL = /^https?:\/\//i;

function normalizeMime(value?: string | null): MediaUploadImage['type'] | null {
  if (!value) return null;
  const mime = value.toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    return mime;
  }
  return null;
}

export function normalizeAvatarAsset(asset: AvatarAsset): MediaUploadImage {
  const uri = asset.uri.trim();
  if (!uri) throw new AvatarUploadError('Không đọc được ảnh đã chọn.');

  const type = normalizeMime(asset.mimeType);
  if (!type) {
    throw new AvatarUploadError('Ảnh đại diện phải là JPEG, PNG hoặc WebP.');
  }

  const fallbackName = `avatar.${MIME_TO_EXTENSION[type]}`;
  const name = asset.fileName?.trim() || fallbackName;

  return { uri, name, type };
}

/** Tải ảnh lên trước, rồi mới lưu URL máy chủ trả về vào hồ sơ. */
export async function persistAvatar(
  asset: AvatarAsset,
  deps: AvatarUploadDeps,
): Promise<PersistedAvatar> {
  const image = normalizeAvatarAsset(asset);
  const uploaded = await deps.uploadImage(image);
  const hostedUrl = uploaded.url.trim();

  if (!HOSTED_URL.test(hostedUrl)) {
    throw new AvatarUploadError('Không nhận được đường dẫn ảnh đại diện hợp lệ.');
  }

  const user = await deps.updateProfile({ avatarUrl: hostedUrl });
  const persistedUrl = user.avatarUrl?.trim() ?? '';
  if (!HOSTED_URL.test(persistedUrl)) {
    throw new AvatarUploadError('Hồ sơ trả về ảnh đại diện không hợp lệ.');
  }

  return { user, avatarUrl: persistedUrl };
}

/** Người dùng trong auth store sau khi lưu ảnh: lấy hồ sơ server, giữ ảnh đã lưu. */
export function withPersistedAvatar(current: UserInfo, persisted: PersistedAvatar): UserInfo {
  return { ...current, ...persisted.user, avatarUrl: persisted.avatarUrl };
}

export interface AvatarSessionStore {
  getState: () => {
    token: string | null;
    user: UserInfo | null;
    setAuth: (token: string, user: UserInfo) => void;
  };
}

/**
 * Cả luồng đổi ảnh: tải lên, lưu URL vào hồ sơ, rồi cập nhật người dùng trong
 * auth store để ảnh mới hiện ngay. Trả về URL đã lưu; lỗi ở bước nào thì ném
 * lỗi và store giữ nguyên ảnh cũ.
 */
export async function updateMyAvatar(
  asset: AvatarAsset,
  deps: AvatarUploadDeps,
  store: AvatarSessionStore,
): Promise<string> {
  const persisted = await persistAvatar(asset, deps);
  const { token, user, setAuth } = store.getState();
  // Phiên đã đổi người trong lúc tải lên thì không ghi đè hồ sơ của người khác.
  if (token && user && (!persisted.user.id || persisted.user.id === user.id)) {
    setAuth(token, withPersistedAvatar(user, persisted));
  }
  return persisted.avatarUrl;
}

/** Câu báo lỗi cho người dùng: lý do của server, câu của app, hoặc câu dự phòng. */
export function avatarErrorMessage(error: unknown): string {
  if (error instanceof AvatarUploadError) return error.message;
  return extractApiErrorMessage(error, 'Không thể tải ảnh lên. Vui lòng thử lại.');
}
