import * as ImagePicker from 'expo-image-picker';
import type { CameraOrderAsset } from './arrival-proof-controller';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function mimeFromExtension(uri: string): AllowedType | null {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

function normalizeType(mimeType: string | undefined, uri: string): AllowedType | null {
  if (mimeType !== undefined && mimeType !== '') {
    return (ALLOWED_TYPES as readonly string[]).includes(mimeType) ? (mimeType as AllowedType) : null;
  }
  return mimeFromExtension(uri);
}

function fileName(uri: string, type: AllowedType): string {
  const base = uri.split('?')[0].split('/').pop() || 'capture';
  if (/\.(jpe?g|png|webp)$/i.test(base)) return base;
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `${base}.${extension}`;
}

export type CameraCaptureResult =
  | { ok: true; asset: CameraOrderAsset }
  | { ok: false; reason: 'permission' | 'cancelled' | 'invalid'; message: string };

/**
 * Presentation-owned camera capture. Camera only — never the media library.
 * Size comes from the actual native asset metadata; a missing or non-positive
 * size is invalid, never replaced by a fallback. The asset lives in local
 * memory only and is never persisted here.
 */
export async function captureCameraPhoto(): Promise<CameraCaptureResult> {
  let granted = false;
  try {
    granted = (await ImagePicker.requestCameraPermissionsAsync()).granted === true;
  } catch {
    granted = false;
  }
  if (!granted) {
    return { ok: false, reason: 'permission', message: 'Bạn chưa cho phép dùng camera. Hãy mở cài đặt thiết bị để cho phép, sau đó chụp lại.' };
  }
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (shot.canceled || !shot.assets?.[0]) {
    return { ok: false, reason: 'cancelled', message: 'Bạn đã hủy chụp ảnh.' };
  }
  const picked = shot.assets[0];
  const type = normalizeType(picked.mimeType ?? undefined, picked.uri);
  const sizeBytes = typeof picked.fileSize === 'number' ? picked.fileSize : Number.NaN;
  if (!picked.uri || !type || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return { ok: false, reason: 'invalid', message: 'Ảnh vừa chụp không đọc được thông tin hợp lệ. Hãy chụp lại bằng camera.' };
  }
  return { ok: true, asset: { source: 'camera', uri: picked.uri, name: fileName(picked.uri, type), type, sizeBytes } };
}

/** Re-check camera permission immediately before an upload; a stale granted capture must not send. */
export async function confirmCameraPermission(): Promise<boolean> {
  try {
    return (await ImagePicker.requestCameraPermissionsAsync()).granted === true;
  } catch {
    return false;
  }
}
