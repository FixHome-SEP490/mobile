import { Platform } from 'react-native';
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

/** Expo web: launchCameraAsync degrades to a file picker, so open the laptop webcam directly. */
function captureWebcamPhoto(): Promise<{ uri: string; mimeType: string; fileSize: number } | { error: string } | 'cancelled'> {
  return new Promise((resolve) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      resolve({ error: 'Trình duyệt chỉ cho dùng camera trên https hoặc localhost. Hãy mở app bằng http://localhost:<port>.' });
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((stream) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
      const video = document.createElement('video');
      video.style.cssText = 'max-width:100%;max-height:75%;transform:scaleX(-1)';
      video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:12px';
      const mk = (t: string, bg: string) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = `padding:12px 24px;border:0;border-radius:8px;font-size:16px;color:#fff;background:${bg};cursor:pointer`; return b; };
      const snap = mk('Chụp ảnh', '#2563eb'); const cancel = mk('Hủy', '#6b7280');
      const done = (r: Awaited<ReturnType<typeof captureWebcamPhoto>>) => { stream.getTracks().forEach((t) => t.stop()); overlay.remove(); resolve(r); };
      cancel.onclick = () => done('cancelled');
      snap.onclick = () => {
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d')?.drawImage(video, 0, 0);
        c.toBlob((blob) => (blob ? done({ uri: URL.createObjectURL(blob), mimeType: 'image/jpeg', fileSize: blob.size }) : done('cancelled')), 'image/jpeg', 0.8);
      };
      bar.append(snap, cancel); overlay.append(video, bar); document.body.appendChild(overlay);
    }, (e: { name?: string }) => resolve({ error: e?.name === 'NotAllowedError' ? 'Camera đang bị chặn cho trang này. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ, chọn Cho phép camera rồi tải lại trang.'
      : e?.name === 'NotFoundError' ? 'Không tìm thấy camera trên thiết bị này.'
      : e?.name === 'NotReadableError' ? 'Camera đang được ứng dụng khác sử dụng. Hãy tắt ứng dụng đó rồi thử lại.'
      : `Không mở được camera (${e?.name ?? 'lỗi không rõ'}).` }));
  });
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
  if (Platform.OS === 'web') {
    const shot = await captureWebcamPhoto();
    if (typeof shot === 'object' && 'error' in shot) return { ok: false, reason: 'permission', message: shot.error };
    if (shot === 'cancelled') return { ok: false, reason: 'cancelled', message: 'Bạn đã hủy chụp ảnh.' };
    return { ok: true, asset: { source: 'camera', uri: shot.uri, name: `capture-${Date.now()}.jpg`, type: 'image/jpeg', sizeBytes: shot.fileSize } };
  }
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
  if (Platform.OS === 'web') return true;
  try {
    return (await ImagePicker.requestCameraPermissionsAsync()).granted === true;
  } catch {
    return false;
  }
}
