import {
  HOME_POPULAR_SERVICES_PAGE_SIZE,
  HOME_POPULAR_SERVICE_TARGETS,
  chunkHomePopularServices,
  getHomePopularPagerLayout,
  getHomePopularPagerPage,
} from './customer-home-pager';

describe('customer home popular-services pager (NEW-CUX-27)', () => {
  it('uses four tiles per page', () => {
    expect(HOME_POPULAR_SERVICES_PAGE_SIZE).toBe(4);
  });

  it('uses the exact production-linked 8 targets in the intended order', () => {
    expect(HOME_POPULAR_SERVICE_TARGETS).toStrictEqual([
      { id: 'ac_clean', categoryCode: 'DIEN_LANH' },
      { id: 'plumbing', categoryCode: 'DIEN_NUOC', query: 'nước' },
      { id: 'electricity', categoryCode: 'DIEN_NUOC', query: 'điện' },
      { id: 'drainage', categoryCode: 'DIEN_NUOC' },
      { id: 'ac_repair', query: 'tivi' },
      { id: 'ac_install', categoryCode: 'BEP_GIA_DUNG' },
      { id: 'washer_repair', categoryCode: 'DIEN_LANH', query: 'máy giặt' },
      { id: 'fridge_repair', categoryCode: 'DIEN_LANH', query: 'tủ lạnh' },
    ]);
  });

  it('groups the production-linked targets into 2 pages of 4 without loss or duplication', () => {
    const pages = chunkHomePopularServices(HOME_POPULAR_SERVICE_TARGETS);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(4);
    expect(pages[1]).toHaveLength(4);
    expect(pages.flat()).toStrictEqual(HOME_POPULAR_SERVICE_TARGETS);
  });

  it('moves the active page from 0 to 1 based on the horizontal scroll offset', () => {
    const pageWidth = 390;
    expect(getHomePopularPagerPage(0, pageWidth, 2)).toBe(0);
    expect(getHomePopularPagerPage(pageWidth * 0.49, pageWidth, 2)).toBe(0);
    expect(getHomePopularPagerPage(pageWidth * 0.5, pageWidth, 2)).toBe(1);
    expect(getHomePopularPagerPage(pageWidth, pageWidth, 2)).toBe(1);
  });

  it('clamps out-of-range offsets to a real page instead of inventing one', () => {
    const pageWidth = 390;
    expect(getHomePopularPagerPage(-20, pageWidth, 2)).toBe(0);
    expect(getHomePopularPagerPage(pageWidth * 5, pageWidth, 2)).toBe(1);
    expect(getHomePopularPagerPage(0, 0, 2)).toBe(0);
  });

  it('produces the correct page index for two different live window widths', () => {
    for (const liveWidth of [390, 768]) {
      expect(getHomePopularPagerPage(0, liveWidth, 2)).toBe(0);
      expect(getHomePopularPagerPage(liveWidth * 0.49, liveWidth, 2)).toBe(0);
      expect(getHomePopularPagerPage(liveWidth * 0.5, liveWidth, 2)).toBe(1);
      expect(getHomePopularPagerPage(liveWidth, liveWidth, 2)).toBe(1);
    }
  });

  it('derives pager page/tile geometry from the supplied live width', () => {
    const narrow = getHomePopularPagerLayout(390);
    expect(narrow.pageWidth).toBe(390);
    expect(narrow.tileWidth).toBeCloseTo((390 - 24) / 4, 5);

    const wide = getHomePopularPagerLayout(768);
    expect(wide.pageWidth).toBe(768);
    expect(wide.tileWidth).toBeCloseTo((768 - 24) / 4, 5);

    expect(wide.pageWidth).not.toBe(narrow.pageWidth);
    expect(wide.tileWidth).not.toBe(narrow.tileWidth);
  });
});
