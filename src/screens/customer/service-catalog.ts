import type { ServiceItem } from '../../api/services.api';
import { SERVICES_PAGE_SIZE } from '../../api/services.api';

/**
 * P0-3 trusted service-catalog flow. Lists and details come only from the
 * Backend catalog: list rows navigate by real server UUID, the detail screen
 * verifies the response id, and all names/descriptions/scopes/prices render
 * strictly from the API. No fake ids, prices, ETAs, or warranties.
 */

const SERVICE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route/detail target: a real service UUID only, never a numeric demo id. */
export function serviceDetailTarget(serviceId: unknown): string | null {
  return typeof serviceId === 'string' && SERVICE_UUID.test(serviceId) ? serviceId : null;
}

/**
 * Fail-closed route-param extraction for the detail screen consumer: stale
 * navigator state or a deep link without params yields '' (never throws),
 * and the existing loader UUID rejection shows the error with no GET/CTA.
 */
export function serviceIdFromRoute(
  route: { params?: { serviceId?: unknown } | null } | null | undefined,
): string {
  const serviceId = route?.params?.serviceId;
  return typeof serviceId === 'string' ? serviceId : '';
}

export type ServicePriceKind = 'fixed' | 'range' | 'survey';

export interface ServicePriceView {
  kind: ServicePriceKind;
  text: string;
}

function validMoney(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function moneyText(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`;
}

/**
 * Backend-only price display. Fixed price renders only when documented;
 * otherwise a documented min/max range; otherwise the honest survey fallback.
 * Never invents ETA or warranty copy.
 */
export function resolveServicePrice(
  service: Pick<ServiceItem, 'pricingMode' | 'fixedPrice' | 'minPrice' | 'maxPrice'> | null,
): ServicePriceView {
  const fallback: ServicePriceView = { kind: 'survey', text: 'Giá sẽ được báo sau khi khảo sát' };
  if (!service) return fallback;
  if (service.pricingMode === 'fixed_price') {
    const fixed = validMoney(service.fixedPrice);
    return fixed === null ? fallback : { kind: 'fixed', text: moneyText(fixed) };
  }
  if (service.pricingMode === 'inspection_required') {
    const min = validMoney(service.minPrice);
    const max = validMoney(service.maxPrice);
    return min === null || max === null
      ? fallback
      : { kind: 'range', text: `Từ ${moneyText(min)} đến ${moneyText(max)}` };
  }
  return fallback;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export interface CatalogState {
  services: ServiceItem[];
  total: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export const initialCatalogState: CatalogState = {
  services: [],
  total: 0,
  page: 1,
  loading: true,
  loadingMore: false,
  error: null,
};

const catalogDeniedMessage = 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
const catalogFailedMessage = 'Không tải được danh sách dịch vụ. Vui lòng thử lại.';

export interface CatalogPage {
  data: ServiceItem[];
  total: number;
}

/**
 * Paged catalog loader with stale-request guards: concurrent searches resolve
 * in issue order only — a slow earlier response can never overwrite a newer
 * query. Keeps last-good rows on transient failure.
 */
export function createServiceCatalogLoader(
  getServices: (params: { search: string; page: number; pageSize: number }) => Promise<CatalogPage>,
  write: (state: CatalogState) => void,
  pageSize: number = SERVICES_PAGE_SIZE,
) {
  let state = initialCatalogState;
  let generation = 0;
  let query = '';
  let loaded = false;
  // A fresh page-1 search owns the list until it settles; appends started
  // while it is in flight would mix pages across queries.
  let searchPending = false;
  const publish = (patch: Partial<CatalogState>) => {
    state = { ...state, ...patch };
    write(state);
  };
  async function load(targetPage: number, append: boolean): Promise<void> {
    const generationAtStart = ++generation;
    const valid = () => generationAtStart === generation;
    if (!append) searchPending = true;
    publish({ loading: !loaded && !append, loadingMore: append, error: null });
    try {
      const page = await getServices({ search: query, page: targetPage, pageSize });
      if (!valid()) return;
      const rows = Array.isArray(page?.data) ? page.data : [];
      const total = typeof page?.total === 'number' && page.total >= 0 ? page.total : rows.length;
      loaded = true;
      publish({
        services: append ? [...state.services, ...rows] : rows,
        total,
        page: targetPage,
        error: null,
      });
    } catch (error) {
      if (!valid()) return;
      if (statusOf(error) === 401) {
        publish({ error: catalogDeniedMessage });
        return;
      }
      publish({ error: catalogFailedMessage });
    } finally {
      if (valid()) publish({ loading: false, loadingMore: false });
      if (generationAtStart === generation) searchPending = false;
    }
  }
  function search(nextQuery: string): Promise<void> {
    query = nextQuery;
    return load(1, false);
  }
  return {
    /** New search (or initial load): resets to page one. */
    search,
    /** Next page only while loaded rows are fewer than the known total. */
    loadMore(): Promise<void> {
      if (state.loading || state.loadingMore || searchPending) return Promise.resolve();
      if (state.services.length >= state.total) return Promise.resolve();
      return load(state.page + 1, true);
    },
    /** Manual retry: reloads the current query from page one. */
    retry(): Promise<void> {
      return search(query);
    },
  };
}

export interface ServiceDetailState {
  service: ServiceItem | null;
  loading: boolean;
  error: string | null;
}

export const initialServiceDetailState: ServiceDetailState = {
  service: null,
  loading: true,
  error: null,
};

const detailInvalidMessage = 'Mã dịch vụ không hợp lệ.';
const detailMissingMessage = 'Không tìm thấy dịch vụ hoặc dịch vụ đã ngừng cung cấp.';

/**
 * Verified active-service detail: validates the UUID before any GET and only
 * renders a payload whose response id matches the requested id.
 */
export function createServiceDetailLoader(
  getServiceById: (id: string) => Promise<ServiceItem>,
  write: (state: ServiceDetailState) => void,
) {
  let state = initialServiceDetailState;
  let active = true;
  let generation = 0;
  let loaded = false;
  const publish = (patch: Partial<ServiceDetailState>) => {
    state = { ...state, ...patch };
    if (active) write(state);
  };
  function focus(serviceId: string): Promise<void> {
    // Re-enable a blurred loader and invalidate any prior generation first:
    // refocusing after blur must fetch and render again, never stay dead.
    active = true;
    generation += 1;
    loaded = false;
    const target = serviceDetailTarget(serviceId);
    if (!target) {
      generation += 1;
      loaded = false;
      publish({ service: null, loading: false, error: detailInvalidMessage });
      return Promise.resolve();
    }
    const generationAtStart = ++generation;
    const valid = () => active && generationAtStart === generation;
    publish({ service: null, loading: !loaded, error: null });
    return (async () => {
      try {
        const fetched = await getServiceById(target);
        if (!valid()) return;
        if (!fetched || fetched.id !== target) {
          loaded = false;
          publish({ service: null, loading: false, error: detailMissingMessage });
          return;
        }
        loaded = true;
        publish({ service: fetched, loading: false, error: null });
      } catch (error) {
        if (!valid()) return;
        loaded = false;
        if (statusOf(error) === 404) {
          publish({ service: null, loading: false, error: detailMissingMessage });
          return;
        }
        publish({ service: null, loading: false, error: 'Không tải được chi tiết dịch vụ. Vui lòng thử lại.' });
      }
    })();
  }
  function blur() {
    active = false;
    generation += 1;
  }
  return { focus, blur };
}
