// src/screens/chat/chat-attachment.ts
//
// A photo or short video sent in the technician-customer chat (PO 18/10/2026), the same rules as the web:
// a photo up to 10 MB (re-encoded as JPEG), a video up to 50 MB after the on-device shrink, uploaded with
// progress and retried on a weak network. Pure of React so the rules can be tested.
import * as ImagePicker from 'expo-image-picker';
import { messagingApi, CHAT_IMAGE_MAX_BYTES, CHAT_VIDEO_MAX_BYTES, type ChatMessage } from '../../api/messaging.api';
import { jpegForUpload } from '../../services/image-for-ai';
import { shrinkVideo } from '../../services/video-shrink';
import { uploadWithRetry } from '../../services/upload-retry';

export interface PickedAttachment {
  kind: 'image' | 'video';
  uri: string;
  name: string;
  type: string;
  sizeBytes: number | null;
  durationMs: number | null;
}

/** A refusal found on the device before anything is sent; its message is meant for the person. */
export class AttachmentProblem extends Error {}

export type AttachmentPhase = 'preparing' | 'uploading';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_VIDEO_MS = 60_000;

/** Null when the file can go, otherwise what to tell the person. */
export function attachmentProblem(file: Pick<PickedAttachment, 'kind' | 'type' | 'sizeBytes' | 'durationMs'>): string | null {
  const type = (file.type || '').toLowerCase();
  if (file.kind === 'image') {
    if (type && !IMAGE_TYPES.includes(type)) return 'Chỉ gửi được ảnh (JPG, PNG, WebP) hoặc video (MP4, MOV, WebM).';
    return file.sizeBytes !== null && file.sizeBytes > CHAT_IMAGE_MAX_BYTES ? 'Ảnh lớn hơn 10 MB, vui lòng chọn ảnh nhỏ hơn.' : null;
  }
  if (type && !VIDEO_TYPES.includes(type)) return 'Chỉ gửi được ảnh (JPG, PNG, WebP) hoặc video (MP4, MOV, WebM).';
  if (file.durationMs !== null && file.durationMs > MAX_VIDEO_MS + 500) return 'Video dài hơn 60 giây, vui lòng quay ngắn hơn.';
  return null;
}

export interface SendDeps {
  jpeg: typeof jpegForUpload;
  shrink: typeof shrinkVideo;
  send: typeof messagingApi.sendAttachment;
  retry: typeof uploadWithRetry;
}

const defaultDeps: SendDeps = {
  jpeg: jpegForUpload,
  shrink: shrinkVideo,
  send: (...args) => messagingApi.sendAttachment(...args),
  retry: uploadWithRetry,
};

/** Prepares (JPEG / light video copy) and uploads one attachment. Throws an Error with a text for the person, or the upload error. */
export async function sendChatAttachment(
  conversationId: string,
  picked: PickedAttachment,
  opts: {
    caption?: string;
    clientMessageId: string;
    onPhase?: (phase: AttachmentPhase) => void;
    onProgress?: (fraction: number) => void;
    onRetry?: () => void;
    signal?: AbortSignal;
  },
  deps: SendDeps = defaultDeps,
): Promise<ChatMessage> {
  const problem = attachmentProblem(picked);
  if (problem) throw new AttachmentProblem(problem);

  opts.onPhase?.('preparing');
  let file = { uri: picked.uri, name: picked.name, type: picked.type };
  let size = picked.sizeBytes;
  if (picked.kind === 'image') {
    const jpeg = await deps.jpeg(picked.uri);
    if (jpeg) file = { uri: jpeg, name: `${picked.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, type: 'image/jpeg' };
    else if (!/^image\/(jpeg|png|webp)$/i.test(picked.type)) throw new AttachmentProblem('Ảnh này không đọc được, vui lòng chọn ảnh khác.');
  } else {
    const shrunk = await deps.shrink(
      { uri: picked.uri, name: picked.name, sizeBytes: picked.sizeBytes, durationMs: picked.durationMs },
      { onProgress: opts.onProgress, signal: opts.signal },
    );
    if (shrunk) {
      file = shrunk;
      size = null; // unknown until sent; the server checks the real size
    }
    if (size !== null && size > CHAT_VIDEO_MAX_BYTES) throw new AttachmentProblem('Video lớn hơn 50 MB, vui lòng quay ngắn hơn.');
  }

  opts.onPhase?.('uploading');
  opts.onProgress?.(0);
  return deps.retry(
    ({ onProgress, signal }) => deps.send(conversationId, file, opts.caption, opts.clientMessageId, { onProgress, signal }),
    { onProgress: opts.onProgress, onRetry: opts.onRetry, signal: opts.signal },
  );
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedAttachment {
  const kind = asset.type === 'video' ? 'video' : 'image';
  return {
    kind,
    uri: asset.uri,
    name: asset.fileName || asset.uri.split('/').pop() || (kind === 'video' ? 'video.mp4' : 'photo.jpg'),
    type: asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    sizeBytes: typeof asset.fileSize === 'number' ? asset.fileSize : null,
    durationMs: typeof asset.duration === 'number' ? asset.duration : null,
  };
}

export type PickSource = 'library' | 'camera-photo' | 'camera-video';

/** One photo or video; `problem` explains a refused permission, null `picked` with no problem means cancelled. */
export async function pickChatAttachment(source: PickSource): Promise<{ picked: PickedAttachment | null; problem?: string }> {
  const camera = source !== 'library';
  const permission = camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { picked: null, problem: camera ? 'Hãy cho phép FixHome dùng camera để gửi ảnh hoặc video.' : 'Hãy cho phép FixHome truy cập thư viện để gửi ảnh hoặc video.' };
  }
  const result = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: source === 'camera-video' ? ['videos'] : ['images'], videoMaxDuration: 60, quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false, quality: 1 });
  if (result.canceled || !result.assets[0]) return { picked: null };
  return { picked: toPicked(result.assets[0]) };
}
