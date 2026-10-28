// src/screens/customer/ai-chat-logic.ts
//
// The rules the web assistant follows (PO 18/10/2026: the app's assistant works
// the same way), kept apart from the screen so they are tested on their own.

import type { AiDeviceSuggestion, AiReply, RecommendedService } from '../../api/ai.api';

/**
 * One-tap answers to the question the assistant just asked, or none when it is
 * not a yes/no one. Same as the web's `quickReplies`.
 */
export function quickReplies(question: string | undefined | null): string[] {
  const q = (question || '').normalize('NFC').trim().toLowerCase();
  if (!q.endsWith('?')) return [];
  const words = q.slice(0, -1).trim().split(/\s+/);
  const last = words[words.length - 1];
  if (last === 'chưa') return ['Rồi', 'Chưa', 'Không rõ'];
  if (last === 'không') return ['Có', 'Không', 'Không rõ'];
  return [];
}

/** A reply is written out in at most this many steps, so a long one still takes about a second. */
export const REVEAL_STEPS = 40;
export const REVEAL_MS = 28;

/** The text as it grows, whole words, the last step the full text. Same as the web's `revealSteps`. */
export function revealSteps(text: string): string[] {
  const words = text.split(/(?<=\s)/);
  if (words.length <= 1) return [text];
  const size = Math.max(1, Math.ceil(words.length / REVEAL_STEPS));
  const steps: string[] = [];
  for (let end = size; end < words.length; end += size) steps.push(words.slice(0, end).join('').trimEnd());
  steps.push(text);
  return steps;
}

/** Catch-all services that must not replace a specific one the conversation already found. */
export const FALLBACK_SERVICE_CODES = new Set(['KIEM_TRA_CHAN_DOAN_THIET_BI', 'DICH_VU_KHAC']);

/** The service to keep pinned after a reply: the new one, unless it is a catch-all replacing a specific one. */
export function nextPinnedService(
  current: RecommendedService | null,
  offered: RecommendedService | undefined,
): RecommendedService | null {
  if (!offered) return current;
  const keepsSpecific = !!current && !FALLBACK_SERVICE_CODES.has(current.serviceCode) && FALLBACK_SERVICE_CODES.has(offered.serviceCode);
  return keepsSpecific ? current : offered;
}

/** The most appliances one visit takes; the chat offers them only from two. */
export const AI_VISIT_DEVICE_LIMIT = 3;

/** The appliances of a reply that can be booked now, in the order the assistant gave them. */
export function bookableDevices(reply: { devices?: AiDeviceSuggestion[] } | null | undefined): AiDeviceSuggestion[] {
  return (reply?.devices ?? []).filter((device) => !!device.service?.serviceId).slice(0, AI_VISIT_DEVICE_LIMIT);
}

/**
 * The devices to keep pinned after a reply: two or more bookable ones replace the list, a reply with a list but
 * fewer than two empties it, and a reply without the list keeps what was there.
 */
export function nextPinnedDevices(current: AiDeviceSuggestion[], reply: { devices?: AiDeviceSuggestion[] } | null | undefined): AiDeviceSuggestion[] {
  if (!Array.isArray(reply?.devices)) return current;
  const devices = bookableDevices(reply);
  return devices.length >= 2 ? devices : [];
}

/** Videos in the chat: never sent to the AI, kept for the technician (PO 18/10/2026). */
export const AI_MAX_VIDEOS = 2;
export const AI_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** What may be picked when the phone makes it light before sending (a long 4K clip). */
export const VIDEO_SOURCE_MAX_BYTES = 600 * 1024 * 1024;
/** A clip of the problem is at most a minute; the phone cannot cut a longer one. */
export const VIDEO_MAX_MS = 60_000;
export const AI_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const VIDEO_NOT_ANALYSED = 'Video được gửi kèm cho kỹ thuật viên xem, trợ lý AI không xem video.';

export interface AttachedVideo {
  id: string;
  uri: string;
  name: string;
  type: string;
  sizeBytes: number | null;
  durationMs: number | null;
}

/**
 * Null when the video can go, otherwise what to tell the customer. `maxBytes`
 * is larger where the phone makes the clip light before sending.
 */
export function videoProblem(
  video: Pick<AttachedVideo, 'type' | 'sizeBytes'> & { durationMs?: number | null },
  alreadyAttached: number,
  maxBytes = AI_VIDEO_MAX_BYTES,
): string | null {
  if (alreadyAttached >= AI_MAX_VIDEOS) return `Gửi được tối đa ${AI_MAX_VIDEOS} video.`;
  if (!AI_VIDEO_TYPES.includes((video.type || '').toLowerCase())) return 'Chỉ gửi được video MP4, MOV hoặc WebM.';
  if (video.durationMs != null && video.durationMs > VIDEO_MAX_MS + 1000) return 'Video dài hơn 60 giây. Anh/chị quay đoạn ngắn hơn giúp em nhé.';
  if (video.sizeBytes != null && video.sizeBytes > maxBytes) return 'Video lớn hơn 50 MB, vui lòng quay ngắn hơn.';
  return null;
}

/** "0:23" for the video tile. */
export function videoDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The type a picked video goes up as: the picker sometimes reports none, the file name tells. */
export function videoMimeType(uri: string, reported?: string | null): string {
  const declared = (reported || '').toLowerCase();
  if (declared.startsWith('video/')) return declared === 'video/x-m4v' ? 'video/mp4' : declared;
  const lower = uri.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

export interface ChatAttachmentId {
  uploadId: string;
  kind: 'image' | 'video';
}

/** The booking takes at most two videos beside its five photos, as the server allows. */
export const BOOKING_MAX_VIDEOS = 2;

/**
 * The upload ids the booking goes up with: the booking's own photos first, then
 * the chat's photos while there is room, then the chat's videos. Never twice.
 */
export function bookingMediaIds(photoUploadIds: string[], fromChat: ChatAttachmentId[], maxPhotos: number): string[] {
  const ids = [...photoUploadIds];
  let photos = ids.length;
  let videos = 0;
  for (const item of fromChat) {
    if (!item.uploadId || ids.includes(item.uploadId)) continue;
    if (item.kind === 'image') {
      if (photos >= maxPhotos) continue;
      photos += 1;
    } else {
      if (videos >= BOOKING_MAX_VIDEOS) continue;
      videos += 1;
    }
    ids.push(item.uploadId);
  }
  return ids;
}

/** "2 ảnh, 1 video" for the note on the booking form. */
export function chatAttachmentSummary(fromChat: ChatAttachmentId[]): string {
  const photos = fromChat.filter((item) => item.kind === 'image').length;
  const videos = fromChat.filter((item) => item.kind === 'video').length;
  return [photos ? `${photos} ảnh` : '', videos ? `${videos} video` : ''].filter(Boolean).join(', ');
}

export interface PhotoLabel {
  text: string;
  uncertain: boolean;
  /** What the composer is filled with when the label is tapped. */
  correction: string;
}

interface LabelledMessage {
  sender: 'user' | 'bot';
  images?: string[];
  reply?: Pick<AiReply, 'photos'>;
}

/**
 * The label under photo `imageIndex` of the customer's message at `messageIndex`: what the assistant read it as,
 * from the first reply after it that reports its photos (same as the web's `photoLabel`).
 */
export function photoLabel(messages: LabelledMessage[], messageIndex: number, imageIndex: number): PhotoLabel | null {
  const sent = messages[messageIndex];
  if (!sent || sent.sender !== 'user' || !sent.images?.length) return null;
  for (let i = messageIndex + 1; i < messages.length; i++) {
    const message = messages[i];
    if (message.sender === 'user') return null;
    const photos = message.reply?.photos;
    if (!photos?.length) continue;
    const reading = photos.find((photo) => photo.index === imageIndex);
    const correction = sent.images.length > 1 ? `Ảnh ${imageIndex + 1} là ` : 'Ảnh này là ';
    if (!reading?.nameVi) return { text: 'Chưa nhận ra', uncertain: true, correction };
    return { text: reading.uncertain ? `${reading.nameVi}?` : reading.nameVi, uncertain: Boolean(reading.uncertain), correction };
  }
  return null;
}

/**
 * What the price range is made of: the low end is the service's own price, the high end adds the parts the fault
 * usually needs. Null when no part is involved.
 */
export function priceBreakdown(reply: Pick<AiReply, 'priceEstimate'>): string | null {
  const price = reply.priceEstimate;
  if (!price || !price.partsMax || price.labourMin == null) return null;
  const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
  const labour = price.labourMax && price.labourMax > price.labourMin
    ? `${money(price.labourMin)} – ${money(price.labourMax)}`
    : money(price.labourMin);
  return `Gồm tiền công dịch vụ ${labour}, cộng linh kiện nếu phải thay (tới ${money(price.partsMax)}).`;
}

/**
 * The words this turn adds to the booking description: a turn that told the assistant it was wrong goes in without
 * the "sai rồi" (`restVi`), and not at all when that was all it said.
 */
export function wordsForDescription(text: string, reply: Pick<AiReply, 'customerDisagreed'> | null | undefined): string {
  const disagreed = reply?.customerDisagreed;
  return disagreed ? (disagreed.restVi ?? text) : text;
}
