// src/screens/customer/customer-home-pager.ts
// NEW-CUX-27: tiny pure grouping/index helper for the Customer Home
// popular-services pager. Keeps the pager deterministic and testable
// without touching navigation, API, store, or dependencies.

export const HOME_POPULAR_SERVICES_PAGE_SIZE = 4;

export interface HomePopularServiceTarget {
  readonly id: string;
  readonly categoryCode?: string;
  readonly query?: string;
}

export const HOME_POPULAR_SERVICE_TARGETS = [
  { id: 'ac_clean', categoryCode: 'DIEN_LANH' },
  { id: 'plumbing', categoryCode: 'DIEN_NUOC', query: 'nước' },
  { id: 'electricity', categoryCode: 'DIEN_NUOC', query: 'điện' },
  { id: 'drainage', categoryCode: 'DIEN_NUOC' },
  { id: 'ac_repair', query: 'tivi' },
  { id: 'ac_install', categoryCode: 'BEP_GIA_DUNG' },
  { id: 'washer_repair', categoryCode: 'DIEN_LANH', query: 'máy giặt' },
  { id: 'fridge_repair', categoryCode: 'DIEN_LANH', query: 'tủ lạnh' },
] as const satisfies readonly HomePopularServiceTarget[];

/**
 * Split Home popular services into fixed-size pages, preserving order.
 * Returns [] for empty input; never drops or duplicates entries.
 */
export function chunkHomePopularServices<T>(
  services: readonly T[],
  pageSize: number = HOME_POPULAR_SERVICES_PAGE_SIZE,
): T[][] {
  if (!Array.isArray(services) || services.length === 0) return [];
  const size = Math.floor(pageSize);
  if (!Number.isFinite(size) || size <= 0) return [Array.from(services)];
  const pages: T[][] = [];
  for (let index = 0; index < services.length; index += size) {
    pages.push(services.slice(index, index + size));
  }
  return pages;
}

/**
 * Derive the active pager page from a horizontal scroll offset.
 * Rounds to the nearest page and clamps to [0, pageCount - 1].
 * Returns 0 when the page width or count is not usable.
 */
export function getHomePopularPagerPage(
  offsetX: number,
  pageWidth: number,
  pageCount: number,
): number {
  if (!Number.isFinite(offsetX) || !Number.isFinite(pageWidth) || pageWidth <= 0) return 0;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return 0;
  const raw = Math.round(offsetX / pageWidth);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(raw, 0), Math.floor(pageCount) - 1);
}

export interface HomePopularPagerLayout {
  pageWidth: number;
  tileWidth: number;
}

/**
 * Derive pager geometry from the current live window width.
 * PC-R01: the caller must supply the live `useWindowDimensions()` width on
 * every render so page/tile layout never goes stale after rotation or
 * tablet/window resize. Mirrors the Home pager style math:
 * page spans the viewport, four tiles share (width - 24) horizontal padding.
 */
export function getHomePopularPagerLayout(viewportWidth: number): HomePopularPagerLayout {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return { pageWidth: 0, tileWidth: 0 };
  }
  return { pageWidth: viewportWidth, tileWidth: (viewportWidth - 24) / 4 };
}
