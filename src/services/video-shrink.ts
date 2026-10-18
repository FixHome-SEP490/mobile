// Videos of the problem made light on the phone before they go up (PO 18/10/2026:
// weak connections). A minute filmed on a phone is 50-150 MB; the technician only
// needs to see the problem. react-native-compressor re-encodes it to H.264 at
// most 1280 px on the long side and about 1.2 Mbit/s (around 9 MB a minute).
//
// The native module only exists in a full build; in Expo Go, or when it fails,
// hangs or makes nothing smaller, the original goes and the server makes its
// own viewing copy. Location stamps are blanked by the server either way.

/** Files below this are sent as they are. */
const SKIP_BELOW_MB = 5;
const TARGET_LONG_SIDE = 1280;
const TARGET_BITRATE = 1_200_000;
/** The phone's own updates come every frame on iOS; the screen needs a few a second. */
const PROGRESS_EVERY_MS = 250;

interface CompressorModule {
  Video: {
    compress(
      uri: string,
      options: Record<string, unknown>,
      onProgress?: (progress: number) => void,
    ): Promise<string>;
    cancelCompression(id: string): void;
  };
  getFileSize?: (uri: string) => Promise<string | number>;
}

let cached: CompressorModule | null | undefined;

/** The compressor, or null in Expo Go / tests. Loaded on first use only. */
export function loadCompressor(): CompressorModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-compressor') as CompressorModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True in a full build, where a picked video is made light before it goes. */
export function canShrinkVideos(): boolean {
  return loadCompressor() !== null;
}

/** Test seam. */
export function setCompressorForTests(module: CompressorModule | null | undefined): void {
  cached = module;
}

export interface ShrunkVideo {
  uri: string;
  type: 'video/mp4';
  name: string;
}

/**
 * The light copy, or null when the original should go as it is. Never throws.
 * Gives up after twice the clip's length plus 15 s: a stuck conversion must not
 * hold the upload (known to happen on some devices).
 */
export async function shrinkVideo(
  video: { uri: string; name: string; sizeBytes: number | null; durationMs: number | null },
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<ShrunkVideo | null> {
  if (video.sizeBytes !== null && video.sizeBytes < SKIP_BELOW_MB * 1024 * 1024) return null;
  const compressor = loadCompressor();
  if (!compressor || opts.signal?.aborted) return null;
  let cancellationId: string | null = null;
  let last = 0;
  const limitMs = 2 * (video.durationMs ?? 60_000) + 15_000;
  const work = compressor.Video.compress(
    video.uri,
    {
      compressionMethod: 'manual',
      maxSize: TARGET_LONG_SIDE,
      bitrate: TARGET_BITRATE,
      minimumFileSizeForCompress: SKIP_BELOW_MB,
      getCancellationId: (id: string) => {
        cancellationId = id;
      },
    },
    (progress: number) => {
      const now = Date.now();
      if (now - last < PROGRESS_EVERY_MS && progress < 1) return;
      last = now;
      opts.onProgress?.(Math.max(0, Math.min(1, progress)));
    },
  );
  const cancel = () => {
    if (cancellationId) {
      try {
        compressor.Video.cancelCompression(cancellationId);
      } catch {
        // Already finished.
      }
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      cancel();
      resolve(null);
    }, limitMs);
    opts.signal?.addEventListener('abort', () => {
      cancel();
      resolve(null);
    });
  });
  try {
    const uri = await Promise.race([work, giveUp]);
    if (!uri || opts.signal?.aborted || uri === video.uri) return null;
    if (compressor.getFileSize && video.sizeBytes !== null) {
      const size = Number(await compressor.getFileSize(uri).catch(() => NaN));
      // Not smaller after all: keep the original.
      if (Number.isFinite(size) && size >= video.sizeBytes * 0.9) return null;
    }
    const base = video.name.replace(/\.[^.]+$/, '') || 'video';
    return { uri, type: 'video/mp4', name: `${base}.mp4` };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
