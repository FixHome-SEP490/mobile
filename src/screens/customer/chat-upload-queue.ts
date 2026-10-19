// src/screens/customer/chat-upload-queue.ts
//
// The photos and videos of the chat with the assistant on their way to the
// technician (PO 18/10/2026: at most three photos and two videos per
// conversation; weak connections). A video is made light as soon as it is
// picked; what is sent goes up at once, in the background, one file at a time
// so a weak connection is not split, and is retried when the connection drops.
// "Đặt thợ" then only takes what arrived, or waits for or leaves out the rest.
// Kept apart from the screen so it is tested on its own.

import { mediaApi } from '../../api/media.api';
import { jpegForUpload } from '../../services/image-for-ai';
import { shrinkVideo, type ShrunkVideo } from '../../services/video-shrink';
import { UploadCancelledError, uploadErrorText, uploadWithRetry } from '../../services/upload-retry';
import { AI_MAX_VIDEOS, type AttachedVideo } from './ai-chat-logic';

/** Photos in the whole conversation (the assistant also takes at most three per message). */
export const AI_CHAT_MAX_IMAGES = 3;
export const ATTACHMENT_LIMIT_TEXT = `Mỗi cuộc trò chuyện gửi được tối đa ${AI_CHAT_MAX_IMAGES} ảnh và ${AI_MAX_VIDEOS} video.`;

export type UploadState = 'preparing' | 'ready' | 'uploading' | 'done' | 'failed';

export interface ChatUpload {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  name: string;
  type: string;
  durationMs: number | null;
  sizeBytes: number | null;
  /** In the composer still (a video waiting for the next message), or sent. */
  sent: boolean;
  state: UploadState;
  /** 0..1 of the conversion while preparing, of the upload while uploading. */
  progress: number;
  prepared?: ShrunkVideo;
  uploadId?: string;
  error?: string;
  retrying?: boolean;
}

export interface UploadSummary {
  total: number;
  done: number;
  failed: number;
  busy: number;
  /** Upload progress of what is still on its way, 0..1. */
  progress: number;
}

export interface QueueDeps {
  shrink: typeof shrinkVideo;
  jpeg: typeof jpegForUpload;
  uploadPhoto: typeof mediaApi.uploadBookingPhoto;
  uploadVideo: typeof mediaApi.uploadBookingVideo;
  retry: typeof uploadWithRetry;
}

let counter = 0;
const nextId = () => `u${Date.now()}_${counter++}`;

export class ChatUploadQueue {
  private items: ChatUpload[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly controllers = new Map<string, AbortController>();
  private pumping = false;
  private readonly deps: QueueDeps;

  constructor(deps: Partial<QueueDeps> = {}) {
    this.deps = {
      shrink: shrinkVideo,
      jpeg: jpegForUpload,
      uploadPhoto: (image, opts) => mediaApi.uploadBookingPhoto(image, opts),
      uploadVideo: (video, opts) => mediaApi.uploadBookingVideo(video, opts),
      retry: uploadWithRetry,
      ...deps,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current list, a new array after every change (for useSyncExternalStore). */
  snapshot = (): ChatUpload[] => this.items;

  get imageCount(): number {
    return this.items.filter((item) => item.kind === 'image').length;
  }

  get videoCount(): number {
    return this.items.filter((item) => item.kind === 'video').length;
  }

  summary(): UploadSummary {
    const sent = this.items.filter((item) => item.sent);
    const busy = sent.filter((item) => item.state === 'preparing' || item.state === 'ready' || item.state === 'uploading');
    return {
      total: sent.length,
      done: sent.filter((item) => item.state === 'done').length,
      failed: sent.filter((item) => item.state === 'failed').length,
      busy: busy.length,
      progress: busy.length ? busy.reduce((sum, item) => sum + (item.state === 'uploading' ? item.progress : 0), 0) / busy.length : 1,
    };
  }

  /** What reached the server, for the booking. */
  uploadIds(): { uploadId: string; kind: 'image' | 'video' }[] {
    const done = this.items.flatMap((item) => (item.sent && item.state === 'done' && item.uploadId ? [{ uploadId: item.uploadId, kind: item.kind }] : []));
    // Photos first, then videos, as the booking form lists them.
    return [...done.filter((item) => item.kind === 'image'), ...done.filter((item) => item.kind === 'video')];
  }

  /** A video waiting in the composer: it is made light at once, while the customer writes. */
  addVideo(video: AttachedVideo): ChatUpload {
    const item: ChatUpload = {
      id: video.id || nextId(), kind: 'video', uri: video.uri, name: video.name, type: video.type,
      durationMs: video.durationMs, sizeBytes: video.sizeBytes, sent: false, state: 'preparing', progress: 0,
    };
    this.set([...this.items, item]);
    void this.prepare(item.id);
    return item;
  }

  /** A photo sent in the chat: it goes up now. */
  addSentImage(image: { uri: string }): ChatUpload {
    const item: ChatUpload = {
      id: nextId(), kind: 'image', uri: image.uri, name: 'tro-ly.jpg', type: 'image/jpeg',
      durationMs: null, sizeBytes: null, sent: true, state: 'ready', progress: 0,
    };
    this.set([...this.items, item]);
    void this.pump();
    return item;
  }

  /** The composer's videos go with this message. */
  sendWaitingVideos(): ChatUpload[] {
    const waiting = this.items.filter((item) => !item.sent);
    if (!waiting.length) return [];
    this.set(this.items.map((item) => (item.sent ? item : { ...item, sent: true })));
    void this.pump();
    return waiting;
  }

  remove(id: string): void {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.set(this.items.filter((item) => item.id !== id));
  }

  retry(id: string): void {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || item.state !== 'failed') return;
    const needsPrep = item.kind === 'video' && !item.prepared && item.error === undefined;
    this.patch(id, { state: needsPrep ? 'preparing' : 'ready', progress: 0, error: undefined });
    void this.pump();
  }

  retryFailed(): void {
    for (const item of this.items) if (item.state === 'failed') this.retry(item.id);
  }

  /** Forget everything (start over): stops every conversion and upload. */
  reset(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.set([]);
  }

  private set(items: ChatUpload[]) {
    this.items = items;
    for (const listener of [...this.listeners]) listener();
  }

  private patch(id: string, change: Partial<ChatUpload>) {
    if (!this.items.some((item) => item.id === id)) return;
    this.set(this.items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  private get(id: string): ChatUpload | undefined {
    return this.items.find((item) => item.id === id);
  }

  private async prepare(id: string) {
    const item = this.get(id);
    if (!item) return;
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const prepared = await this.deps.shrink(
      { uri: item.uri, name: item.name, sizeBytes: item.sizeBytes, durationMs: item.durationMs },
      { signal: controller.signal, onProgress: (progress) => this.patch(id, { progress }) },
    );
    if (this.controllers.get(id) === controller) this.controllers.delete(id);
    if (controller.signal.aborted || !this.get(id)) return;
    // Null means the original goes as it is.
    this.patch(id, { prepared: prepared ?? undefined, state: 'ready', progress: 0 });
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const next = this.items.find((item) => item.sent && item.state === 'ready');
        if (!next) break;
        await this.upload(next.id);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async upload(id: string) {
    const item = this.get(id);
    if (!item) return;
    this.patch(id, { state: 'uploading', progress: 0, error: undefined, retrying: false });
    const controller = new AbortController();
    this.controllers.set(id, controller);
    let shown = 0;
    const track = {
      signal: controller.signal,
      onProgress: (fraction: number) => {
        shown = Math.max(shown, fraction);
        this.patch(id, { progress: shown });
      },
      onRetry: () => this.patch(id, { retrying: true }),
    };
    try {
      let uploadId: string;
      if (item.kind === 'image') {
        const jpeg = await this.deps.jpeg(item.uri);
        if (!jpeg) throw Object.assign(new Error('Unreadable photo'), { response: { status: 400 } });
        uploadId = (await this.deps.retry(({ onProgress, signal }) => this.deps.uploadPhoto({ uri: jpeg, name: item.name, type: 'image/jpeg' }, { onProgress, signal }), track)).uploadId;
      } else {
        const file = item.prepared ?? { uri: item.uri, name: item.name, type: item.type };
        uploadId = (await this.deps.retry(({ onProgress, signal }) => this.deps.uploadVideo(file, { onProgress, signal }), track)).uploadId;
      }
      this.patch(id, { state: 'done', progress: 1, uploadId, retrying: false });
    } catch (error) {
      if (error instanceof UploadCancelledError || controller.signal.aborted) return;
      this.patch(id, { state: 'failed', progress: 0, error: uploadErrorText(error), retrying: false });
    } finally {
      if (this.controllers.get(id) === controller) this.controllers.delete(id);
    }
  }
}
