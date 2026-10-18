import type { AxiosInstance } from 'axios';
import apiClient from './client';
import type { CanonicalOrderStatus } from './orders.api';

const TRACKING_WINDOW_MS = 60_000;
const TRACKING_LIMIT = 5;
const DEFAULT_429_BACKOFF_MS = 60_000;
const ACTIVE_TRACKING_STATUSES = new Set<CanonicalOrderStatus>(['EN_ROUTE', 'UNDER_REPAIR']);
const ORDER_STATUSES = new Set<CanonicalOrderStatus>(['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED']);

export type PublicOrderTrackingResult = {
  code: string;
  status: CanonicalOrderStatus;
  serviceName?: string;
  technician?: { fullName: string };
  technicianLocation: { lat: number; lng: number; updatedAt: string | null } | null;
  destination: { lat: number; lng: number } | null;
  timeline: { status: string; timestamp: string }[];
};

export type PublicOrderTrackingQuery = { orderCode: string; phone: string };

export class PublicOrderTrackingRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Quá nhiều lượt tra cứu. Vui lòng thử lại sau.');
    this.name = 'PublicOrderTrackingRateLimitError';
  }
}

type MutableApiClient = Pick<AxiosInstance, 'post'>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function globalData(value: unknown): unknown {
  const envelope = object(value);
  if (!envelope || envelope.success !== true || typeof envelope.statusCode !== 'number'
    || !Number.isInteger(envelope.statusCode) || envelope.statusCode < 200 || envelope.statusCode >= 300
    || typeof envelope.message !== 'string' || !('data' in envelope)) {
    throw new Error('Không thể tra cứu lúc này. Vui lòng thử lại.');
  }
  return envelope.data;
}

function coordinatePair(value: unknown): { lat: number; lng: number } | null {
  const row = object(value);
  if (!row || typeof row.lat !== 'number' || !Number.isFinite(row.lat) || Math.abs(row.lat) > 90
    || typeof row.lng !== 'number' || !Number.isFinite(row.lng) || Math.abs(row.lng) > 180) return null;
  return { lat: row.lat, lng: row.lng };
}

function normalizedTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function normalizePublicOrderTracking(value: unknown): PublicOrderTrackingResult {
  const row = object(value);
  const status = typeof row?.status === 'string' ? row.status.toUpperCase() as CanonicalOrderStatus : null;
  if (!row || typeof row.code !== 'string' || !row.code.trim() || !status || !ORDER_STATUSES.has(status)
    || !Array.isArray(row.timeline)) throw new Error('Không thể tra cứu lúc này. Vui lòng thử lại.');

  const technician = row.technician === undefined || row.technician === null ? undefined : object(row.technician);
  if (row.technician !== undefined && row.technician !== null
    && (!technician || typeof technician.fullName !== 'string')) {
    throw new Error('Không thể tra cứu lúc này. Vui lòng thử lại.');
  }
  const timeline = row.timeline.map((item) => {
    const event = object(item);
    const timestamp = normalizedTimestamp(event?.timestamp);
    if (!event || typeof event.status !== 'string' || !event.status || !timestamp) {
      throw new Error('Không thể tra cứu lúc này. Vui lòng thử lại.');
    }
    return { status: event.status.toUpperCase(), timestamp };
  });

  const locationRow = object(row.technicianLocation);
  const locationPair = coordinatePair(locationRow);
  const updatedAt = locationRow ? normalizedTimestamp(locationRow.updatedAt, true) : null;
  const technicianLocation = ACTIVE_TRACKING_STATUSES.has(status) && locationPair && updatedAt !== null
    ? { ...locationPair, updatedAt }
    : null;
  const destination = coordinatePair(row.destination);
  if (row.serviceName !== undefined && typeof row.serviceName !== 'string') {
    throw new Error('Không thể tra cứu lúc này. Vui lòng thử lại.');
  }

  return {
    code: row.code,
    status,
    ...(typeof row.serviceName === 'string' ? { serviceName: row.serviceName } : {}),
    ...(technician ? { technician: { fullName: technician.fullName as string } } : {}),
    technicianLocation,
    destination,
    timeline,
  };
}

export function parseRetryAfterMs(value: unknown, now = Date.now()): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const until = Date.parse(value);
  return Number.isFinite(until) ? Math.max(0, until - now) : null;
}

class PublicTrackingRequestBudget {
  private readonly requestTimes: number[] = [];
  private blockedUntil = 0;

  retryAfterMs(now: number): number {
    while (this.requestTimes.length && now - this.requestTimes[0] >= TRACKING_WINDOW_MS) this.requestTimes.shift();
    const windowWait = this.requestTimes.length >= TRACKING_LIMIT
      ? Math.max(0, this.requestTimes[0] + TRACKING_WINDOW_MS - now)
      : 0;
    return Math.max(windowWait, this.blockedUntil - now, 0);
  }

  take(now: number): void {
    const retryAfterMs = this.retryAfterMs(now);
    if (retryAfterMs > 0) throw new PublicOrderTrackingRateLimitError(retryAfterMs);
    this.requestTimes.push(now);
  }

  backoff(now: number, retryAfterMs: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, now + retryAfterMs);
  }
}

export function createPublicOrderTrackingApi(client: MutableApiClient, now: () => number = Date.now) {
  const budget = new PublicTrackingRequestBudget();

  return {
    async lookup(query: PublicOrderTrackingQuery): Promise<PublicOrderTrackingResult> {
      if (typeof query?.orderCode !== 'string' || !query.orderCode.trim() || query.orderCode.trim().length > 50
        || typeof query.phone !== 'string' || !query.phone.trim() || query.phone.trim().length > 20) {
        throw new Error('Nhập mã đơn và số điện thoại đã đăng ký.');
      }

      budget.take(now());
      try {
        const response = await client.post('/service-orders/public/track', {
          orderCode: query.orderCode.trim(),
          phone: query.phone.trim(),
        });
        return normalizePublicOrderTracking(globalData(response.data));
      } catch (error) {
        if (error instanceof PublicOrderTrackingRateLimitError) throw error;
        const response = object(object(error)?.response);
        const status = response?.status;
        if (response && status === 429) {
          const headers = response.headers;
          const headerBag = object(headers);
          const retryHeader = typeof (headers as { get?: unknown } | null)?.get === 'function'
            ? (headers as { get: (name: string) => unknown }).get('retry-after')
            : headerBag?.['retry-after'] ?? headerBag?.['Retry-After'];
          const retryAfterMs = Math.max(1000, parseRetryAfterMs(retryHeader, now()) ?? DEFAULT_429_BACKOFF_MS);
          budget.backoff(now(), retryAfterMs);
          throw new PublicOrderTrackingRateLimitError(retryAfterMs);
        }
        if (status === 403 || status === 404) {
          throw new Error('Không tìm thấy đơn hàng phù hợp với mã đơn và số điện thoại đã nhập.');
        }
        throw new Error('Không thể tra cứu lúc này. Vui lòng thử lại.');
      }
    },
  };
}

export const publicOrderTrackingApi = createPublicOrderTrackingApi(apiClient);
