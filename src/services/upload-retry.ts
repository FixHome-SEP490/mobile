// Uploads that survive a weak connection (PO 18/10/2026), the same rules as the web.
//
// A fixed timeout either kills a slow but healthy upload at 90% or waits minutes
// on a dead one. Instead an attempt is abandoned only when no byte has moved for
// a while, and it is tried again a few times with growing pauses. A refusal from
// the server (a 4xx other than 408/429) is final: sending again cannot help.

/** No byte moved for this long: the attempt is dead. */
export const UPLOAD_STALL_MS = 45_000;
/**
 * Once the last byte is out, the server still stores the file (up to 50 MB to
 * storage) before it answers, and progress events stop: that wait is not a stall.
 */
export const UPLOAD_RESPONSE_WAIT_MS = 3 * 60_000;
export const UPLOAD_ATTEMPTS = 4;
const PAUSES_MS = [2_000, 5_000, 10_000];

export interface UploadAttempt {
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  onRetry?: (attempt: number) => void;
  signal?: AbortSignal;
  stallMs?: number;
  responseMs?: number;
  attempts?: number;
  /** Test seam. */
  pausesMs?: number[];
}

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
  }
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/** Worth sending again: the network, a stall, a timeout, a busy or broken server. */
export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadCancelledError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(new UploadCancelledError());
    }
    signal?.addEventListener('abort', cancel);
  });
}

/** Runs `send` until it succeeds, aborting an attempt that stalls and retrying network failures. */
export async function uploadWithRetry<T>(send: (attempt: UploadAttempt) => Promise<T>, opts: UploadOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? UPLOAD_ATTEMPTS;
  const pauses = opts.pausesMs ?? PAUSES_MS;
  const stallMs = opts.stallMs ?? UPLOAD_STALL_MS;
  const responseMs = opts.responseMs ?? UPLOAD_RESPONSE_WAIT_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (opts.signal?.aborted) throw new UploadCancelledError();
    if (attempt > 1) {
      opts.onRetry?.(attempt);
      await wait(pauses[Math.min(attempt - 2, pauses.length - 1)] ?? 0, opts.signal);
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    opts.signal?.addEventListener('abort', cancel);
    let stall = setTimeout(cancel, stallMs);
    const progress = (fraction: number) => {
      clearTimeout(stall);
      stall = setTimeout(cancel, fraction >= 1 ? responseMs : stallMs);
      opts.onProgress?.(fraction);
    };
    try {
      return await send({ onProgress: progress, signal: controller.signal });
    } catch (error) {
      if (opts.signal?.aborted) throw new UploadCancelledError();
      lastError = error;
      if (!isRetryable(error)) throw error;
    } finally {
      clearTimeout(stall);
      opts.signal?.removeEventListener('abort', cancel);
    }
  }
  throw lastError;
}

/** What to tell the customer when a photo or video did not go up. */
export function uploadErrorText(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: { code?: string } } } })?.response;
  const status = response?.status;
  if (status === 401) return 'Phiên đăng nhập đã hết, anh/chị đăng nhập lại rồi bấm Thử lại.';
  if (response?.data?.error?.code === 'VIDEO_TOO_LONG') return 'Video dài hơn 60 giây. Anh/chị quay đoạn ngắn hơn giúp em nhé.';
  if (status === 413) return 'Video lớn hơn 50 MB. Anh/chị quay đoạn ngắn hơn giúp em nhé.';
  if (status === 400 || status === 422) return 'Tệp này không đọc được, anh/chị chọn ảnh hoặc video khác giúp em.';
  return 'Mạng yếu nên chưa gửi được. Bấm Thử lại khi mạng ổn hơn.';
}
