// The chat's photos and videos on their way to the technician (PO 18/10/2026).
import { ChatUploadQueue } from './chat-upload-queue';
jest.mock('../../api/media.api', () => ({ mediaApi: { uploadBookingPhoto: jest.fn(), uploadBookingVideo: jest.fn() } }));
jest.mock('../../services/image-for-ai', () => ({ jpegForUpload: jest.fn() }));
jest.mock('../../services/video-shrink', () => ({ shrinkVideo: jest.fn() }));


const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const video = (id: string, extra: Record<string, unknown> = {}) => ({ id, uri: `file:///${id}.mov`, name: `${id}.mov`, type: 'video/quicktime', sizeBytes: 80 * 1024 * 1024, durationMs: 40_000, ...extra });
const once = <T>(send: (a: { onProgress: (n: number) => void; signal: AbortSignal }) => Promise<T>, opts: { onProgress?: (n: number) => void; signal?: AbortSignal }) =>
  send({ onProgress: opts.onProgress ?? (() => undefined), signal: opts.signal ?? new AbortController().signal });

function harness() {
  const shrink = jest.fn(async () => ({ uri: 'file:///light.mp4', type: 'video/mp4' as const, name: 'light.mp4' }));
  const jpeg = jest.fn(async (uri: string) => `${uri}.jpg`);
  const uploadPhoto = jest.fn(async () => ({ uploadId: 'photo-1', mimeType: 'image/jpeg', sizeBytes: 1 }));
  const uploadVideo = jest.fn(async () => ({ uploadId: 'video-1', mimeType: 'video/mp4', sizeBytes: 1 }));
  const queue = new ChatUploadQueue({ shrink, jpeg, uploadPhoto: uploadPhoto as never, uploadVideo: uploadVideo as never, retry: once as never });
  return { queue, shrink, jpeg, uploadPhoto, uploadVideo };
}

describe('ChatUploadQueue', () => {
  it('makes a picked video light at once, and sends it only with the next message', async () => {
    const { queue, shrink, uploadVideo } = harness();
    const changes = jest.fn();
    queue.subscribe(changes);
    queue.addVideo(video('v1'));
    expect(queue.snapshot()[0]).toMatchObject({ state: 'preparing', sent: false });
    await flush();
    expect(shrink).toHaveBeenCalledWith({ uri: 'file:///v1.mov', name: 'v1.mov', sizeBytes: 80 * 1024 * 1024, durationMs: 40_000 }, expect.anything());
    expect(queue.snapshot()[0]).toMatchObject({ state: 'ready', prepared: { uri: 'file:///light.mp4' } });
    expect(uploadVideo).not.toHaveBeenCalled();
    expect(queue.summary().total).toBe(0);

    queue.sendWaitingVideos();
    await flush();
    // The light copy goes, not the 80 MB original.
    expect(uploadVideo).toHaveBeenCalledWith({ uri: 'file:///light.mp4', type: 'video/mp4', name: 'light.mp4' }, expect.anything());
    expect(queue.snapshot()[0]).toMatchObject({ state: 'done', uploadId: 'video-1' });
    expect(queue.uploadIds()).toEqual([{ uploadId: 'video-1', kind: 'video' }]);
    expect(changes).toHaveBeenCalled();
  });

  it('sends the original when the phone cannot make it lighter, and a photo as JPEG at once', async () => {
    const { queue, shrink, uploadVideo, uploadPhoto, jpeg } = harness();
    shrink.mockResolvedValueOnce(null as never);
    queue.addVideo(video('v1'));
    queue.addSentImage({ uri: 'file:///p.heic' });
    await flush();
    expect(jpeg).toHaveBeenCalledWith('file:///p.heic');
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///p.heic.jpg', name: 'tro-ly.jpg', type: 'image/jpeg' }, expect.anything());
    queue.sendWaitingVideos();
    await flush();
    expect(uploadVideo).toHaveBeenCalledWith({ uri: 'file:///v1.mov', name: 'v1.mov', type: 'video/quicktime' }, expect.anything());
    // Photos first, then videos, as the booking form lists them.
    expect(queue.uploadIds()).toEqual([{ uploadId: 'photo-1', kind: 'image' }, { uploadId: 'video-1', kind: 'video' }]);
  });

  it('sends one file at a time and reports progress that only moves forward', async () => {
    const { queue, uploadPhoto } = harness();
    let release!: () => void;
    let report!: (n: number) => void;
    uploadPhoto.mockImplementationOnce(((_image: unknown, opts: { onProgress: (n: number) => void }) => {
      report = opts.onProgress;
      return new Promise((resolve) => { release = () => resolve({ uploadId: 'photo-a', mimeType: 'image/jpeg', sizeBytes: 1 }); });
    }) as never);
    queue.addSentImage({ uri: 'file:///a.jpg' });
    queue.addSentImage({ uri: 'file:///b.jpg' });
    await flush();
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    report(0.6);
    report(0.4);
    expect(queue.snapshot()[0].progress).toBe(0.6);
    expect(queue.summary()).toMatchObject({ total: 2, busy: 2, done: 0 });
    release();
    await flush();
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(queue.summary()).toMatchObject({ done: 2, busy: 0, progress: 1 });
  });

  it('keeps a failed one with the reason, sends it again on request, and forgets a removed one', async () => {
    const { queue, uploadPhoto } = harness();
    uploadPhoto.mockRejectedValueOnce(new Error('Network Error') as never).mockRejectedValueOnce({ response: { status: 401 } } as never);
    queue.addSentImage({ uri: 'file:///a.jpg' });
    queue.addSentImage({ uri: 'file:///b.jpg' });
    await flush();
    const [a, b] = queue.snapshot();
    expect(a).toMatchObject({ state: 'failed', error: 'Mạng yếu nên chưa gửi được. Bấm Thử lại khi mạng ổn hơn.' });
    expect(b.error).toContain('đăng nhập lại');
    expect(queue.summary().failed).toBe(2);
    queue.retryFailed();
    await flush();
    expect(queue.summary()).toMatchObject({ failed: 0, done: 2 });

    let signal: AbortSignal | undefined;
    uploadPhoto.mockImplementationOnce(((_i: unknown, opts: { signal: AbortSignal }) => { signal = opts.signal; return new Promise(() => undefined); }) as never);
    const c = queue.addSentImage({ uri: 'file:///c.jpg' });
    await flush();
    queue.remove(c.id);
    expect(signal?.aborted).toBe(true);
    expect(queue.snapshot()).toHaveLength(2);
  });

  it('a photo the phone cannot read fails with a plain reason, without uploading', async () => {
    const { queue, jpeg, uploadPhoto } = harness();
    jpeg.mockResolvedValueOnce(null as never);
    queue.addSentImage({ uri: 'file:///broken.jpg' });
    await flush();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(queue.snapshot()[0].error).toBe('Tệp này không đọc được, anh/chị chọn ảnh hoặc video khác giúp em.');
  });

  it('stops everything on start over', async () => {
    const { queue, shrink } = harness();
    let signal: AbortSignal | undefined;
    shrink.mockImplementationOnce(((_v: unknown, opts: { signal: AbortSignal }) => { signal = opts.signal; return new Promise(() => undefined); }) as never);
    queue.addVideo(video('v1'));
    expect(queue.videoCount).toBe(1);
    queue.reset();
    expect(signal?.aborted).toBe(true);
    expect(queue.snapshot()).toEqual([]);
    expect(queue.videoCount).toBe(0);
  });
});
