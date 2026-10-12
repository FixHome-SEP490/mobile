import apiClient from './client';
import {
  technicianWarrantyApi,
  type TechnicianWarrantyClaimStatus,
  type TechnicianWarrantyVisitStatus,
} from './technician-warranty.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

const CLAIM_ID = '33333333-3333-4333-8333-333333333333';

const SENTINELS = [
  'SECRET_TEST_PHONE',
  'PRIVATE_TEST_ADDRESS',
  'PRIVATE_TEST_NAME',
  'PRIVATE_TEST_MEDIA',
  'PRIVATE_TEST_NOTE',
];

const CLAIM_STATUSES: TechnicianWarrantyClaimStatus[] = [
  'submitted',
  'accepted',
  'inspected',
  'in_progress',
  'awaiting_customer',
  'disputed',
  'resolved',
  'rejected',
];

const VISIT_STATUSES: TechnicianWarrantyVisitStatus[] = [
  'scheduled',
  'checked_in',
  'inspected',
  'completed',
  'cancelled',
];

function buildRawClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CLAIM_ID,
    serviceOrderId: 'service-order-id-private',
    warrantyCoverageId: 'coverage-id-private',
    status: 'submitted',
    description: 'Mô tả gốc nhạy cảm của khách hàng',
    evidenceRefs: ['PRIVATE_TEST_MEDIA'],
    customerResponse: 'disputed',
    resolutionNotes: 'PRIVATE_TEST_NOTE',
    submittedAt: '2026-10-01T08:00:00.000Z',
    technician: { id: 'tech-id', fullName: 'Tech' },
    order: {
      id: 'order-id',
      code: 'DH-001',
      serviceName: 'Sửa điều hòa',
      addressSummary: 'PRIVATE_TEST_ADDRESS',
      customerName: 'PRIVATE_TEST_NAME',
      customerPhone: 'SECRET_TEST_PHONE',
    },
    coverage: {
      id: 'cov-1',
      itemDescription: 'Block máy điều hòa',
      expiresAt: '2026-12-01T00:00:00.000Z',
    },
    visit: {
      id: 'visit-1',
      status: 'scheduled',
      scheduledAt: '2026-10-05T09:00:00.000Z',
      checkedInAt: null,
      findings: 'Ghi chú riêng tư của kỹ thuật viên',
      evidenceRefs: null,
      checkInLat: '10.1',
      checkInLng: '106.1',
    },
    ...overrides,
  };
}

function envelope(rows: unknown): { data: { data: unknown } } {
  return { data: { data: rows } };
}

function serialized(value: unknown): string {
  return JSON.stringify(value) ?? '';
}

beforeEach(() => jest.resetAllMocks());

describe('Technician assigned warranty GET-only adapter', () => {
  it('calls GET /warranty-claims/mine with no params when no filter is given', async () => {
    api.get.mockResolvedValue(envelope([]));
    const rows = await technicianWarrantyApi.listAssigned();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/warranty-claims/mine');
    expect(api.get.mock.calls[0]).toHaveLength(1);
    expect(rows).toEqual([]);
  });

  it('sends only params {status} when a valid filter is provided', async () => {
    api.get.mockResolvedValue(envelope([]));
    await technicianWarrantyApi.listAssigned('accepted');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/warranty-claims/mine', {
      params: { status: 'accepted' },
    });
  });

  it('rejects an unknown status before any GET is sent', async () => {
    await expect(
      technicianWarrantyApi.listAssigned('bogus' as unknown as TechnicianWarrantyClaimStatus),
    ).rejects.toThrow();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('never uses POST for the assigned warranty overview', async () => {
    api.get.mockResolvedValue(envelope([buildRawClaim()]));
    await technicianWarrantyApi.listAssigned();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(CLAIM_STATUSES)('accepts claim status %s and projects only the safe overview', async (status) => {
    api.get.mockResolvedValue(envelope([buildRawClaim({ status })]));
    const rows = await technicianWarrantyApi.listAssigned();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(status);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        'coverageExpiresAt',
        'coverageItemDescription',
        'id',
        'orderCode',
        'scheduledAt',
        'serviceName',
        'status',
        'submittedAt',
        'visitStatus',
      ].sort(),
    );
  });

  it.each(VISIT_STATUSES)('accepts visit status %s', async (visitStatus) => {
    api.get.mockResolvedValue(
      envelope([buildRawClaim({ visit: { id: 'visit-1', status: visitStatus, scheduledAt: null } })]),
    );
    const rows = await technicianWarrantyApi.listAssigned();
    expect(rows).toHaveLength(1);
    expect(rows[0].visitStatus).toBe(visitStatus);
  });

  it('treats a legitimate {data:[]} envelope as a valid empty list', async () => {
    api.get.mockResolvedValue(envelope([]));
    await expect(technicianWarrantyApi.listAssigned()).resolves.toEqual([]);
  });

  it.each([
    ['null body', null],
    ['empty object', {}],
    ['null data', { data: null }],
    ['object data', { data: {} }],
    ['string body', 'bad'],
    ['string data', { data: 'bad' }],
    ['numeric data', { data: 42 }],
    ['missing data key', { meta: {} }],
  ])('fail-closed with a generic Vietnamese error for malformed success: %s', async (_label, body) => {
    api.get.mockResolvedValue({ data: body });
    const error = await technicianWarrantyApi.listAssigned().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch('Vui lòng thử lại');
    expect(serialized((error as Error).message)).not.toMatch(/SECRET_TEST_PHONE|PRIVATE_TEST/);
  });

  it('rejects an unknown claim status inside a row', async () => {
    api.get.mockResolvedValue(envelope([buildRawClaim({ status: 'archived' })]));
    await expect(technicianWarrantyApi.listAssigned()).rejects.toThrow('Vui lòng thử lại');
  });

  it('rejects an unknown visit status inside a row', async () => {
    api.get.mockResolvedValue(
      envelope([buildRawClaim({ visit: { id: 'visit-1', status: 'on_the_way', scheduledAt: null } })]),
    );
    await expect(technicianWarrantyApi.listAssigned()).rejects.toThrow('Vui lòng thử lại');
  });

  it.each([
    ['missing id', { id: undefined }],
    ['missing status', { status: undefined }],
    ['missing submittedAt', { submittedAt: undefined }],
    ['missing order', { order: undefined }],
    ['null order', { order: null }],
    ['invalid submittedAt', { submittedAt: 'not-a-date' }],
    ['non-string order code', { order: { id: 'o', code: 123, serviceName: 'Sửa' } }],
  ])('rejects a row with %s', async (_label, override) => {
    const raw = buildRawClaim();
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) delete raw[key];
      else raw[key] = value as unknown;
    }
    api.get.mockResolvedValue(envelope([raw]));
    await expect(technicianWarrantyApi.listAssigned()).rejects.toThrow('Vui lòng thử lại');
  });

  it('rejects the whole list when one row is invalid instead of returning a partial list', async () => {
    api.get.mockResolvedValue(envelope([buildRawClaim(), buildRawClaim({ status: 'archived' })]));
    await expect(technicianWarrantyApi.listAssigned()).rejects.toThrow('Vui lòng thử lại');
  });

  it('maps null coverage and null visit to nulls without inventing values', async () => {
    api.get.mockResolvedValue(envelope([buildRawClaim({ coverage: null, visit: null })]));
    const rows = await technicianWarrantyApi.listAssigned();
    expect(rows[0]).toMatchObject({
      coverageItemDescription: null,
      coverageExpiresAt: null,
      visitStatus: null,
      scheduledAt: null,
    });
  });

  it('maps a null scheduledAt to null without guessing a date', async () => {
    api.get.mockResolvedValue(
      envelope([buildRawClaim({ visit: { id: 'visit-1', status: 'scheduled', scheduledAt: null } })]),
    );
    const rows = await technicianWarrantyApi.listAssigned();
    expect(rows[0].scheduledAt).toBeNull();
  });

  it('preserves legitimately empty orderCode and serviceName without faking values', async () => {
    api.get.mockResolvedValue(
      envelope([
        buildRawClaim({ order: { id: 'order-id', code: '', serviceName: '' } }),
      ]),
    );
    const rows = await technicianWarrantyApi.listAssigned();
    expect(rows[0].orderCode).toBe('');
    expect(rows[0].serviceName).toBe('');
  });

  it('never leaks private staff DTO fields into the projection', async () => {
    api.get.mockResolvedValue(envelope([buildRawClaim()]));
    const rows = await technicianWarrantyApi.listAssigned();
    const text = serialized(rows);
    for (const sentinel of SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
    expect(text).not.toContain('serviceOrderId');
    expect(text).not.toContain('customerResponse');
    expect(text).not.toContain('resolutionNotes');
  });

  it('never includes private sentinels in error strings for a malformed row', async () => {
    const raw = buildRawClaim();
    delete raw.id;
    api.get.mockResolvedValue(envelope([raw]));
    const error = await technicianWarrantyApi.listAssigned().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const text = serialized((error as Error).message);
    for (const sentinel of SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
  });

  it('does not log raw payloads or private fields', async () => {
    const logged: unknown[][] = [];
    const stash = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    const spy = (...args: unknown[]) => {
      logged.push(args);
    };
    console.log = spy as typeof console.log;
    console.warn = spy as typeof console.warn;
    console.error = spy as typeof console.error;
    try {
      api.get.mockResolvedValue(envelope([buildRawClaim()]));
      await technicianWarrantyApi.listAssigned();
      const malformed = buildRawClaim();
      delete malformed.id;
      api.get.mockResolvedValue(envelope([malformed]));
      await technicianWarrantyApi.listAssigned().catch(() => undefined);
    } finally {
      console.log = stash.log;
      console.warn = stash.warn;
      console.error = stash.error;
    }
    const text = serialized(logged);
    for (const sentinel of SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
  });

  it('propagates 401 as an error rather than an empty list', async () => {
    api.get.mockRejectedValue({ response: { status: 401 }, message: 'Request failed with status code 401' });
    await expect(technicianWarrantyApi.listAssigned()).rejects.toBeDefined();
  });

  it('propagates 403 as an error rather than an empty list', async () => {
    api.get.mockRejectedValue({ response: { status: 403 }, message: 'Request failed with status code 403' });
    await expect(technicianWarrantyApi.listAssigned()).rejects.toBeDefined();
  });

  it('propagates a network failure as an error rather than an empty list', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    await expect(technicianWarrantyApi.listAssigned()).rejects.toBeDefined();
  });
});
