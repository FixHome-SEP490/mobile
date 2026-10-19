// Weak connections (PO 18/10/2026): the same rules as the web.
import { UploadCancelledError, isRetryable, uploadErrorText, uploadWithRetry } from './upload-retry';

const network = () => Object.assign(new Error('Network Error'), { response: undefined });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('uploadWithRetry', () => {
  it('sends again after a network failure, never after a refusal', async () => {
    expect(isRetryable(network())).toBe(true);
    expect(isRetryable({ response: { status: 503 } })).toBe(true);
    expect(isRetryable({ response: { status: 413 } })).toBe(false);

    const send = jest.fn().mockRejectedValueOnce(network()).mockResolvedValueOnce('ok');
    const result = uploadWithRetry(send, { pausesMs: [2000] });
    await jest.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);

    const refused = jest.fn().mockRejectedValue({ response: { status: 422 } });
    await expect(uploadWithRetry(refused)).rejects.toEqual({ response: { status: 422 } });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('abandons an attempt where nothing moves, and stops for good when cancelled', async () => {
    const signals: AbortSignal[] = [];
    const send = jest.fn(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(network())));
    });
    const controller = new AbortController();
    const result = uploadWithRetry(send, { stallMs: 30_000, pausesMs: [1000], signal: controller.signal });
    const caught = result.catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(signals[0].aborted).toBe(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    controller.abort();
    expect(await caught).toBeInstanceOf(UploadCancelledError);
  });

  // Review 18/10/2026: after the last byte the server is still storing the file; resending it then wastes everything.
  it('does not treat the wait for the answer after the last byte as a stall', async () => {
    let signal!: AbortSignal;
    let answer!: (value: string) => void;
    const send = jest.fn((attempt: { onProgress: (n: number) => void; signal: AbortSignal }) => {
      signal = attempt.signal;
      attempt.onProgress(1);
      return new Promise<string>((resolve) => { answer = resolve; });
    });
    const result = uploadWithRetry(send, { stallMs: 30_000, responseMs: 120_000 });
    await jest.advanceTimersByTimeAsync(90_000);
    expect(signal.aborted).toBe(false);
    answer('stored');
    await expect(result).resolves.toBe('stored');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('says what went wrong in plain words', () => {
    expect(uploadErrorText(network())).toBe('Mạng yếu nên chưa gửi được. Bấm Thử lại khi mạng ổn hơn.');
    expect(uploadErrorText({ response: { status: 422, data: { error: { code: 'VIDEO_TOO_LONG' } } } })).toContain('dài hơn 60 giây');
    expect(uploadErrorText({ response: { status: 413 } })).toContain('50 MB');
    expect(uploadErrorText({ response: { status: 401 } })).toContain('đăng nhập lại');
  });
});
