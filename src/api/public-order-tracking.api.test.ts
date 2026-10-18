import {
  createPublicOrderTrackingApi,
  PublicOrderTrackingRateLimitError,
  type PublicOrderTrackingResult,
} from './public-order-tracking.api';

const result = {
  code: 'FH-20261017-AB12CD34',
  status: 'EN_ROUTE',
  serviceName: 'Sửa điều hòa',
  technician: { fullName: 'Kỹ thuật viên A', phoneNumber: '0900000000', passwordHash: 'private' },
  destination: { lat: 10.75, lng: 106.67 },
  technicianLocation: { lat: 10.76, lng: 106.68, updatedAt: '2026-10-17T00:00:00.000Z' },
  timeline: [{ status: 'EN_ROUTE', timestamp: '2026-10-17T00:00:00.000Z', actor: 'private' }],
};
const envelope = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'Success', data } });
const request = { orderCode: ' FH-20261017-AB12CD34 ', phone: ' 0900000000 ' };

describe('publicOrderTrackingApi', () => {
  let now: number;
  let post: jest.Mock;
  let api: ReturnType<typeof createPublicOrderTrackingApi>;

  beforeEach(() => {
    now = 0;
    post = jest.fn(async () => envelope(result));
    api = createPublicOrderTrackingApi({ post } as never, () => now);
  });

  it('uses the public route and returns only approved tracking fields', async () => {
    const tracked = await api.lookup(request);
    expect(post).toHaveBeenCalledWith('/service-orders/public/track', { orderCode: 'FH-20261017-AB12CD34', phone: '0900000000' });
    expect(tracked).toEqual({
      code: result.code,
      status: 'EN_ROUTE',
      serviceName: 'Sửa điều hòa',
      technician: { fullName: 'Kỹ thuật viên A' },
      technicianLocation: result.technicianLocation,
      destination: result.destination,
      timeline: [{ status: 'EN_ROUTE', timestamp: '2026-10-17T00:00:00.000Z' }],
    } satisfies PublicOrderTrackingResult);
    expect(JSON.stringify(tracked)).not.toContain('0900000000');
    expect(JSON.stringify(tracked)).not.toContain('passwordHash');
    expect(JSON.stringify(tracked)).not.toContain('actor');
  });

  it('omits a malformed public destination coordinate pair', async () => {
    post.mockResolvedValueOnce(envelope({ ...result, destination: { lat: 10.75 } }));
    await expect(api.lookup(request)).resolves.toMatchObject({ destination: null });
  });

  it('omits malformed technician coordinates even while the order is active', async () => {
    post.mockResolvedValueOnce(envelope({ ...result, technicianLocation: { lat: 10.76, lng: 181, updatedAt: result.technicianLocation.updatedAt } }));
    await expect(api.lookup(request)).resolves.toMatchObject({ technicianLocation: null });
  });

  it('shares one five-request rolling budget across manual and polling lookups', async () => {
    const manualLookup = () => api.lookup(request);
    const pollLookup = () => api.lookup(request);
    for (const lookup of [manualLookup, pollLookup, pollLookup, manualLookup, pollLookup]) {
      await lookup();
      now += 10000;
    }
    await expect(api.lookup(request)).rejects.toMatchObject({ name: 'PublicOrderTrackingRateLimitError', retryAfterMs: 10000 });
    expect(post).toHaveBeenCalledTimes(5);
    now = 60000;
    await expect(api.lookup(request)).resolves.toMatchObject({ code: result.code });
    expect(post).toHaveBeenCalledTimes(6);
  });

  it('honors Retry-After from HTTP 429 and blocks further calls until backoff ends', async () => {
    post.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '3' } } });
    await expect(api.lookup(request)).rejects.toBeInstanceOf(PublicOrderTrackingRateLimitError);
    await expect(api.lookup(request)).rejects.toMatchObject({ retryAfterMs: 3000 });
    expect(post).toHaveBeenCalledTimes(1);
    now = 3000;
    await expect(api.lookup(request)).resolves.toMatchObject({ code: result.code });
  });

  it('uses the same generic not-found error for code or phone mismatch', async () => {
    post.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(api.lookup(request)).rejects.toThrow('Không tìm thấy đơn hàng phù hợp với mã đơn và số điện thoại đã nhập.');
  });

  it('clears location outside active statuses and rejects the previous double-wrapped response shape', async () => {
    post.mockResolvedValueOnce(envelope({ ...result, status: 'COMPLETED', technicianLocation: result.technicianLocation }));
    await expect(api.lookup(request)).resolves.toMatchObject({ status: 'COMPLETED', technicianLocation: null });
    post.mockResolvedValueOnce(envelope({ data: result }));
    await expect(api.lookup(request)).rejects.toThrow('Không thể tra cứu lúc này. Vui lòng thử lại.');
  });
});
