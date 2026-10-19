// Videos made light on the phone before they go up (PO 18/10/2026).
import { canShrinkVideos, setCompressorForTests, shrinkVideo } from './video-shrink';

const MB = 1024 * 1024;
const clip = (extra: Record<string, unknown> = {}) => ({ uri: 'file:///IMG_1.MOV', name: 'IMG_1.MOV', sizeBytes: 80 * MB, durationMs: 30_000, ...extra });

function compressor(result: Promise<string> | string = 'file:///light.mp4', size: number | string = 9 * MB) {
  const module = {
    Video: {
      compress: jest.fn((_uri: string, options: { getCancellationId: (id: string) => void }, onProgress: (n: number) => void) => {
        options.getCancellationId('job-1');
        onProgress(0.5);
        return typeof result === 'string' ? Promise.resolve(result) : result;
      }),
      cancelCompression: jest.fn(),
    },
    getFileSize: jest.fn(async () => size),
  };
  setCompressorForTests(module);
  return module;
}

afterEach(() => {
  setCompressorForTests(undefined);
  jest.useRealTimers();
});

describe('shrinkVideo', () => {
  it('re-encodes a heavy clip to at most 1280 px and about 1.2 Mbit/s', async () => {
    const module = compressor();
    const progress = jest.fn();
    await expect(shrinkVideo(clip(), { onProgress: progress })).resolves.toEqual({ uri: 'file:///light.mp4', type: 'video/mp4', name: 'IMG_1.mp4' });
    expect(module.Video.compress).toHaveBeenCalledWith('file:///IMG_1.MOV', expect.objectContaining({ compressionMethod: 'manual', maxSize: 1280, bitrate: 1_200_000 }), expect.any(Function));
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(canShrinkVideos()).toBe(true);
  });

  it('keeps the original when it is already light, when the copy is not smaller, or without the module', async () => {
    const module = compressor();
    await expect(shrinkVideo(clip({ sizeBytes: 3 * MB }))).resolves.toBeNull();
    expect(module.Video.compress).not.toHaveBeenCalled();
    compressor('file:///light.mp4', 79 * MB);
    await expect(shrinkVideo(clip())).resolves.toBeNull();
    compressor(Promise.reject(new Error('Exynos encoder failed')));
    await expect(shrinkVideo(clip())).resolves.toBeNull();
    setCompressorForTests(null);
    await expect(shrinkVideo(clip())).resolves.toBeNull();
    expect(canShrinkVideos()).toBe(false);
  });

  it('gives up on a conversion that hangs, after twice the clip plus 15 s, and cancels it', async () => {
    jest.useFakeTimers();
    const module = compressor(new Promise(() => undefined));
    const result = shrinkVideo(clip({ durationMs: 20_000 }));
    await jest.advanceTimersByTimeAsync(54_999);
    expect(module.Video.cancelCompression).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBeNull();
    expect(module.Video.cancelCompression).toHaveBeenCalledWith('job-1');
  });

  it('stops when the customer removes the video', async () => {
    const module = compressor(new Promise(() => undefined));
    const controller = new AbortController();
    const result = shrinkVideo(clip(), { signal: controller.signal });
    controller.abort();
    await expect(result).resolves.toBeNull();
    expect(module.Video.cancelCompression).toHaveBeenCalledWith('job-1');
  });
});
