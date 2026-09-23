import {
  createServiceCatalogLoader,
  createServiceDetailLoader,
  initialCatalogState,
  initialServiceDetailState,
  resolveServicePrice,
  serviceDetailTarget,
  serviceIdFromRoute,
  type CatalogState,
  type ServiceDetailState,
} from './service-catalog';
import type { ServiceItem } from '../../api/services.api';

jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  id: UUID_A,
  name: 'Vệ sinh máy lạnh',
  categoryId: UUID_B,
  pricingMode: 'fixed_price' as const,
  fixedPrice: 150000,
  basePrice: null,
  minPrice: null,
  maxPrice: null,
  description: 'Vệ sinh dàn lạnh',
  scopeDescription: null,
  isActive: true,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('serviceDetailTarget (real UUID gate)', () => {
  it('accepts only well-formed UUIDs, never fake numeric ids', () => {
    expect(serviceDetailTarget(UUID_A)).toBe(UUID_A);
    expect(serviceDetailTarget('1')).toBeNull();
    expect(serviceDetailTarget('42')).toBeNull();
    expect(serviceDetailTarget('')).toBeNull();
    expect(serviceDetailTarget('not-a-uuid')).toBeNull();
    expect(serviceDetailTarget(undefined)).toBeNull();
    expect(serviceDetailTarget(null)).toBeNull();
  });
});

describe('resolveServicePrice (Backend-only pricing display)', () => {
  it('shows the documented fixed price for fixed_price services', () => {
    expect(resolveServicePrice(catalogRow())).toMatchObject({ kind: 'fixed' });
    expect(resolveServicePrice(catalogRow()).text).toContain('150');
  });

  it('shows a min/max range when documented, never inventing a single price', () => {
    const view = resolveServicePrice(catalogRow({
      pricingMode: 'inspection_required',
      fixedPrice: null,
      minPrice: 100000,
      maxPrice: 300000,
    }));
    expect(view.kind).toBe('range');
    expect(view.text).toContain('100');
    expect(view.text).toContain('300');
  });

  it.each([
    ['inspection without bounds', { pricingMode: 'inspection_required', fixedPrice: null, minPrice: null, maxPrice: null }],
    ['unknown pricing mode', { pricingMode: 'SOMETHING_ELSE' }],
    ['negative fixed price', { pricingMode: 'fixed_price', fixedPrice: -5 }],
    ['NaN bounds', { pricingMode: 'inspection_required', minPrice: NaN, maxPrice: 300000 }],
    ['null service', null],
  ])('falls back to survey pricing for %s without ETA or warranty', (_label, overrides) => {
    const service = overrides === null ? null : catalogRow(overrides as Record<string, unknown>);
    const view = resolveServicePrice(service as Parameters<typeof resolveServicePrice>[0]);
    expect(view.kind).toBe('survey');
    expect(view.text).toBe('Giá sẽ được báo sau khi khảo sát');
  });

  it('never promises ETA or warranty text', () => {
    const rendered = JSON.stringify([
      resolveServicePrice(catalogRow()),
      resolveServicePrice(catalogRow({ pricingMode: 'inspection_required' })),
    ]);
    expect(rendered).not.toMatch(/phút|giờ|ngày|bảo hành|ETA/i);
  });
});

describe('createServiceCatalogLoader (paged search, stale-safe)', () => {
  function setup() {
    const row = (overrides: Record<string, unknown> = {}) =>
      ({ ...catalogRow(), ...overrides }) as unknown as ServiceItem;
    const getServices = jest.fn<Promise<{ data: ServiceItem[]; total: number }>, [Record<string, unknown>?]>()
      .mockResolvedValue({ data: [row()], total: 1 });
    const write = jest.fn<void, [CatalogState]>();
    const loader = createServiceCatalogLoader(getServices, write);
    const state = () => write.mock.calls[write.mock.calls.length - 1][0];
    return { getServices, write, loader, state, row };
  }

  it('loads the first page and reports totals honestly', async () => {
    const h = setup();
    await h.loader.search('');
    expect(h.getServices).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(h.state()).toMatchObject({ services: expect.any(Array), total: 1, loading: false, error: null });
  });

  it('passes the search term to the Backend instead of filtering locally', async () => {
    const h = setup();
    await h.loader.search('máy lạnh');
    expect(h.getServices).toHaveBeenCalledWith(expect.objectContaining({ search: 'máy lạnh', page: 1 }));
  });

  it('shows an honest empty state for a zero catalog', async () => {
    const h = setup();
    h.getServices.mockResolvedValue({ data: [], total: 0 });
    await h.loader.search('');
    expect(h.state()).toMatchObject({ services: [], total: 0, loading: false, error: null });
  });

  it('keeps last-good rows on timeout and recovers on manual retry', async () => {
    const h = setup();
    await h.loader.search('');
    h.getServices.mockRejectedValueOnce(new Error('timeout'));
    await h.loader.search('máy');
    expect(h.state().services).toHaveLength(1);
    expect(h.state().error).toBeTruthy();
    h.getServices.mockResolvedValue({ data: [h.row()], total: 1 });
    await h.loader.retry();
    expect(h.state()).toMatchObject({ error: null });
  });

  it('reports 401 without leaking and stops', async () => {
    const h = setup();
    h.getServices.mockRejectedValue({ response: { status: 401 } });
    await h.loader.search('');
    expect(h.state().services).toEqual([]);
    expect(h.state().error).toContain('đăng nhập');
  });

  it('drops a stale search response that resolves after a newer query', async () => {
    const h = setup();
    const first = deferred<{ data: ServiceItem[]; total: number }>();
    h.getServices.mockReturnValueOnce(first.promise).mockResolvedValue({ data: [h.row({ id: UUID_B })], total: 1 });
    const older = h.loader.search('máy');
    const newer = h.loader.search('máy lạnh');
    h.write.mockClear();
    first.resolve({ data: [h.row({ name: 'STALE' })], total: 1 });
    await older;
    await newer;
    expect(h.write).toHaveBeenCalled();
    const last = h.write.mock.calls[h.write.mock.calls.length - 1][0];
    expect(JSON.stringify(last)).not.toMatch(/STALE/);
  });

  it('appends further pages while items remain and stops at the total', async () => {
    const h = setup();
    h.getServices.mockResolvedValue({ data: [h.row()], total: 45 });
    await h.loader.search('');
    expect(h.state().services).toHaveLength(1);
    h.getServices.mockResolvedValue({ data: [h.row({ id: UUID_B })], total: 45 });
    await h.loader.loadMore();
    expect(h.getServices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(h.state().services).toHaveLength(2);
  });

  it('never requests beyond the known total', async () => {
    const h = setup();
    await h.loader.search('');
    h.write.mockClear();
    await h.loader.loadMore();
    expect(h.getServices).toHaveBeenCalledTimes(1);
  });

  it('shares the initial state shape', () => {
    expect(initialCatalogState).toMatchObject({ services: [], total: 0, page: 1, loading: true, error: null });
  });
});

describe('createServiceDetailLoader (verified active detail)', () => {
  function setup() {
    const getServiceById = jest.fn().mockResolvedValue(catalogRow());
    const write = jest.fn<void, [ServiceDetailState]>();
    const loader = createServiceDetailLoader(getServiceById, write);
    const state = () => write.mock.calls[write.mock.calls.length - 1][0];
    return { getServiceById, write, loader, state };
  }

  it('fetches the real service by UUID and verifies the response id', async () => {
    const h = setup();
    await h.loader.focus(UUID_A);
    expect(h.getServiceById).toHaveBeenCalledWith(UUID_A);
    expect(h.state()).toMatchObject({ service: expect.objectContaining({ id: UUID_A }), error: null, loading: false });
  });

  it('never requests an invalid id and rejects mismatched payloads', async () => {
    const h = setup();
    await h.loader.focus('7');
    expect(h.getServiceById).not.toHaveBeenCalled();
    expect(h.state().service).toBeNull();
    expect(h.state().error).toContain('không hợp lệ');

    h.getServiceById.mockResolvedValue(catalogRow({ id: UUID_B }));
    await h.loader.focus(UUID_A);
    expect(h.state().service).toBeNull();
  });

  it('shows a safe not-found message on 404 without leaking other services', async () => {
    const h = setup();
    h.getServiceById.mockRejectedValue({ response: { status: 404 } });
    await h.loader.focus(UUID_A);
    expect(h.state().service).toBeNull();
    expect(h.state().error).toContain('Không tìm thấy');
  });

  it('writes nothing after blur', async () => {
    const h = setup();
    const pending = deferred<unknown>();
    h.getServiceById.mockReturnValueOnce(pending.promise);
    const first = h.loader.focus(UUID_A);
    h.loader.blur();
    h.write.mockClear();
    pending.resolve(catalogRow());
    await first;
    expect(h.write).not.toHaveBeenCalled();
  });

  it('shares the initial state shape', () => {
    expect(initialServiceDetailState).toMatchObject({ service: null, loading: true, error: null });
  });
});

describe('CAT-001 refocus lifecycle (review remediation)', () => {
  function setup() {
    const getServiceById = jest.fn().mockImplementation((id: string) =>
      Promise.resolve(catalogRow({ id })),
    );
    const write = jest.fn<void, [ServiceDetailState]>();
    const loader = createServiceDetailLoader(getServiceById, write);
    const state = () => write.mock.calls[write.mock.calls.length - 1][0];
    return { getServiceById, write, loader, state };
  }

  it('focus(A) -> blur() -> focus(B) renders B and drops the stale A response', async () => {
    const h = setup();
    const pendingA = deferred<unknown>();
    h.getServiceById.mockReturnValueOnce(pendingA.promise);
    const first = h.loader.focus(UUID_A);
    h.loader.blur();
    const second = h.loader.focus(UUID_B);
    pendingA.resolve(catalogRow({ id: UUID_A }));
    await first;
    await second;
    expect(h.getServiceById).toHaveBeenCalledWith(UUID_B);
    expect(h.state()).toMatchObject({
      service: expect.objectContaining({ id: UUID_B }),
      loading: false,
      error: null,
    });
    const rendered = JSON.stringify(h.state());
    expect(rendered).not.toMatch(/STALE_MARKER/);
  });
});

describe('CAT-002 nullable route params (review remediation)', () => {
  it('serviceIdFromRoute fails closed on missing params without throwing', () => {
    expect(serviceIdFromRoute(null)).toBe('');
    expect(serviceIdFromRoute(undefined)).toBe('');
    expect(serviceIdFromRoute({})).toBe('');
    expect(serviceIdFromRoute({ params: null })).toBe('');
    expect(serviceIdFromRoute({ params: {} })).toBe('');
    expect(serviceIdFromRoute({ params: { serviceId: 7 } })).toBe('');
    expect(serviceIdFromRoute({ params: { serviceId: UUID_A } })).toBe(UUID_A);
  });
});

describe('CONCURRENCY probe: loadMore during a pending fresh search', () => {
  function setup() {
    const row = (id: string, name: string) =>
      ({ ...catalogRow(), id, name }) as unknown as ServiceItem;
    const getServices = jest.fn<Promise<{ data: ServiceItem[]; total: number }>, [Record<string, unknown>?]>();
    const write = jest.fn<void, [CatalogState]>();
    const loader = createServiceCatalogLoader(getServices, write, 5);
    const state = () => write.mock.calls[write.mock.calls.length - 1][0];
    return { getServices, write, loader, state, row };
  }

  it('page-2 append must not supersede or mix with a pending fresh page-1', async () => {
    const h = setup();
    const oldRows = Array.from({ length: 5 }, (_, index) => h.row(`old-${index}`, `OLD ${index}`));
    h.getServices.mockResolvedValueOnce({ data: oldRows, total: 12 });
    await h.loader.search('old');
    expect(h.state().services).toHaveLength(5);

    const freshPage1 = deferred<{ data: ServiceItem[]; total: number }>();
    const stalePage2 = deferred<{ data: ServiceItem[]; total: number }>();
    h.getServices.mockReturnValueOnce(freshPage1.promise);
    h.getServices.mockReturnValueOnce(stalePage2.promise);
    const newer = h.loader.search('new');
    // Overlapping initiation while the fresh page-1 is still pending.
    const more = h.loader.loadMore();
    const newRows = Array.from({ length: 5 }, (_, index) => h.row(`new-${index}`, `NEW ${index}`));
    freshPage1.resolve({ data: newRows, total: 12 });
    await newer;
    stalePage2.resolve({
      data: Array.from({ length: 5 }, (_, index) => h.row(`mix-${index}`, `MIX ${index}`)),
      total: 12,
    });
    await more;
    const finalIds = h.state().services.map((service) => service.id);
    expect(finalIds).toEqual(newRows.map((row) => row.id));
    // No duplicate fetch: the blocked append never issued a GET.
    expect(h.getServices).toHaveBeenCalledTimes(2);
  });
});
