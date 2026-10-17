import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ServiceItem } from '../../api/services.api';

const fs = jest.requireActual<{
  readFileSync: (file: string, encoding: string) => string;
}>('fs');

/**
 * C-RUI3 REAL production guard: both Customer service screens stay on the
 * canonical Backend catalog with honest pricing and no invented promises.
 * Static source assertions plus mocked-API loader behavior (no network).
 */
const LIST_SRC = fs.readFileSync('src/screens/customer/CustomerServicesScreen.tsx', 'utf8');
const DETAIL_SRC = fs.readFileSync('src/screens/customer/CustomerServiceDetailScreen.tsx', 'utf8');

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};
let mockIsAuthenticated = true;

jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, push: mockPush, goBack: mockGoBack }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (effect: () => void | (() => void)) => ReactModule.useEffect(effect, [effect]),
  };
});

jest.mock('../../store/auth.store', () => ({
  useAuthStore: Object.assign(jest.fn(), {
    getState: () => ({ isAuthenticated: mockIsAuthenticated }),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactModule.createElement(Native.Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('../../components/customer/CustomerSkeleton', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../api/services.api', () => ({
  servicesApi: {
    getCategories: jest.fn(),
    getServices: jest.fn(),
    getServiceById: jest.fn(),
  },
}));

const servicesMock = jest.requireMock('../../api/services.api') as {
  servicesApi: {
    getCategories: jest.Mock;
    getServices: jest.Mock;
    getServiceById: jest.Mock;
  };
};

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const LONG_VN_NAME = 'Vệ sinh máy lạnh âm trần công suất lớn cho phòng khách chung cư cao cấp';
const mockCategory = {
  id: 'cat-dien-lanh',
  name: 'Điện lạnh',
  code: 'DIEN_LANH',
  isActive: true,
  sortOrder: 1,
};
const mockService = {
  id: SERVICE_ID,
  name: LONG_VN_NAME,
  code: 'VE_SINH_DIEU_HOA_AM_TRAN',
  categoryId: 'cat-dien-lanh',
  categoryName: 'Điện lạnh',
  pricingMode: 'fixed_price',
  fixedPrice: 350000,
  minPrice: null,
  maxPrice: null,
  isActive: true,
};

function listElement() {
  const { default: CustomerServicesScreen } = jest.requireActual('./CustomerServicesScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerServicesScreen);
}

function detailElement() {
  const { default: CustomerServiceDetailScreen } = jest.requireActual(
    './CustomerServiceDetailScreen',
  ) as { default: React.ComponentType };
  return React.createElement(CustomerServiceDetailScreen);
}

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function waitForServicesCall(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    if (servicesMock.servicesApi.getServices.mock.calls.length > 0) return;
    await settle(250);
  }
}

function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const style = node.props.style;
  return Array.isArray(style) ? Object.assign({}, ...style) : ((style ?? {}) as Record<string, unknown>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = {};
  mockIsAuthenticated = true;
  servicesMock.servicesApi.getCategories.mockResolvedValue([mockCategory]);
  servicesMock.servicesApi.getServices.mockResolvedValue({ data: [mockService], total: 1 });
  servicesMock.servicesApi.getServiceById.mockResolvedValue(mockService);
});

describe('customer service real UI (C-RUI3)', () => {
  it('lists from the canonical servicesApi catalog with debounce, categories, and pagination', () => {
    expect(LIST_SRC).toContain('servicesApi.getServices');
    expect(LIST_SRC).toContain('.getCategories(');
    expect(LIST_SRC).toContain('createServiceCatalogLoader');
    expect(LIST_SRC).toContain('setTimeout');
    expect(LIST_SRC).toContain('300');
    expect(LIST_SRC).toContain('loadMore');
    expect(LIST_SRC).toContain('onEndReached');
    expect(LIST_SRC).toContain('resolveServicePrice');
  });

  it('opens real detail by server UUID and books with a service prefill', () => {
    expect(LIST_SRC).toContain("navigation.navigate('CustomerServiceDetail', { serviceId: item.id })");
    expect(DETAIL_SRC).toContain('servicesApi.getServiceById');
    expect(DETAIL_SRC).toContain('createServiceDetailLoader');
    expect(DETAIL_SRC).toContain('serviceIdFromRoute');
    expect(DETAIL_SRC).toContain('resolveServicePrice');
    expect(DETAIL_SRC).toContain("navigation.push('CustomerBookingCreate'");
    expect(DETAIL_SRC).toContain('prefill: { serviceId: service.id, serviceName: service.name }');
  });

  it('never promises a fake final price, ETA, or warranty', () => {
    for (const src of [LIST_SRC, DETAIL_SRC]) {
      expect(src).not.toMatch(/giá cuối|giá cuối cùng|final price/i);
      expect(src).not.toMatch(/bảo hành \d|\bETA\b|ước tính \d+ phút|giao trong \d+/i);
      expect(src).not.toMatch(/0\s*₫|miễn phí/i);
    }
  });

  it('keeps honest loading/empty/error/stale/retry states with accessible retry targets', () => {
    expect(LIST_SRC).toContain('Đang tải danh sách dịch vụ');
    expect(LIST_SRC).toContain('Không tìm thấy dịch vụ nào phù hợp');
    expect(LIST_SRC).toContain('Không tải được kết quả mới');
    expect(LIST_SRC).toContain('Thử lại');
    expect(LIST_SRC).toContain('Tải lại');
    expect(DETAIL_SRC).toContain('Đang tải chi tiết dịch vụ');
    expect(DETAIL_SRC).toContain('Không tìm thấy dịch vụ hoặc dịch vụ đã ngừng cung cấp');
    expect(DETAIL_SRC).toContain('Thử lại');
    expect(LIST_SRC).toContain('minHeight: 44');
    expect(DETAIL_SRC).toContain('minHeight: 44');
  });

  it('renders opaque service art honestly with kept aspect and no transparency pretense', () => {
    for (const src of [LIST_SRC, DETAIL_SRC]) {
      expect(src).toContain('getServicePresentation');
      expect(src).toContain('resizeMode="contain"');
      expect(src).not.toMatch(/opacity:\s*0\./);
    }
  });
});

describe('customer service loader behavior (mocked servicesApi, C-RUI3 M1)', () => {
  it('opens the default Browse scene without focusing the search field and uses real service IDs', async () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(listElement());
    });
    try {
      await waitForServicesCall();
      expect(servicesMock.servicesApi.getCategories).toHaveBeenCalled();
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledWith(
        { search: '', page: 1, pageSize: 100 },
      );
      expect(tree.root.findByType(TextInput).props.autoFocus).toBe(false);
      expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Khám phá dịch vụ')).toBe(true);

      const nameNodes = tree.root
        .findAllByType(Text)
        .filter((node) => node.props.children === 'Vệ sinh điều hòa âm trần');
      expect(nameNodes.length).toBeGreaterThanOrEqual(1);
      // Long service variants remain readable; the touch target retains the canonical name.
      expect(nameNodes[0].props.numberOfLines).toBeUndefined();
      expect(flatStyle(nameNodes[0]).lineHeight).toBe(16);

      const row = tree.root.findAllByType(TouchableOpacity).find(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith(LONG_VN_NAME),
      );
      expect(row).toBeDefined();
      expect(row!.props.accessibilityLabel).toBe(LONG_VN_NAME);
      act(() => row!.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServiceDetail', { serviceId: SERVICE_ID });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not create a raw text sibling inside the paginated native list footer', async () => {
    servicesMock.servicesApi.getServices.mockImplementation(({ search }: { search?: string }) =>
      Promise.resolve(search
        ? { data: [mockService], total: 34 }
        : { data: Array.from({ length: 34 }, (_, index) => ({ ...mockService, id: `service-${index}` })), total: 34 }),
    );
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(listElement());
    });
    try {
      await waitForServicesCall();
      const input = tree.root.findAllByType(TextInput)[0];
      act(() => input.props.onChangeText('dịch vụ'));
      await settle(400);
      const footer = tree.root.findAll((node) =>
        node.type === TouchableOpacity
        && node.props.accessibilityLabel === 'Tải thêm dịch vụ (1 trên 34)')[0];
      expect(footer).toBeDefined();
      // Text nodes must be wrapped in <Text> on Android. Inline whitespace
      // after the opening TouchableOpacity tag is a genuine native warning.
      const direct = React.Children.toArray(footer.props.children);
      expect(direct.some((child) => typeof child === 'string')).toBe(false);
      // Babel's JSX whitespace handling is host-dependent; also guard the
      // precise inline-footer opening-tag pattern observed on Android.
      expect(LIST_SRC).not.toMatch(/>[ \t]{2,}\{loadingMore\s*\?/);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('sends typed search through the debounced mocked loader', async () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(listElement());
    });
    try {
      await settle(600);
      servicesMock.servicesApi.getServices.mockClear();
      const input = tree.root.findAllByType(TextInput)[0];
      act(() => input.props.onChangeText('điện'));
      await settle(600);
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'điện', page: 1 }),
      );
    } finally {
      act(() => tree.unmount());
    }
  });

  it('returns from real results to Browse when the query is cleared', async () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await settle(350);
      const input = tree.root.findAllByType(TextInput)[0];
      act(() => input.props.onChangeText('điện'));
      await settle(500);
      expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Vệ sinh điều hòa âm trần')).toBe(true);

      act(() => tree.root.findByProps({ accessibilityLabel: 'Xóa nội dung tìm kiếm' }).props.onPress());
      await settle(50);
      expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Điện lạnh')).toBe(true);
      expect(tree.root.findAllByType(TouchableOpacity).some((node) => node.props.accessibilityLabel === 'Hỏi FixHome AI')).toBe(true);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('ignores a late Browse page after switching to Search', async () => {
    const latePage = deferred<{ data: typeof mockService[]; total: number }>();
    servicesMock.servicesApi.getServices
      .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ ...mockService, id: `browse-${index}` })), total: 101 })
      .mockReturnValueOnce(latePage.promise)
      .mockResolvedValue({ data: [mockService], total: 1 });
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await waitForServicesCall();
      await settle(50);
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledTimes(2);

      const input = tree.root.findByType(TextInput);
      act(() => input.props.onChangeText('điện'));
      await settle(350);
      latePage.resolve({ data: [{ ...mockService, id: 'late-browse', name: 'Dữ liệu Browse cũ' }], total: 101 });
      await settle(50);

      const visible = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? '')).join(' ');
      expect(visible).not.toContain('Dữ liệu Browse cũ');
      expect(visible).toContain('Vệ sinh điều hòa âm trần');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('shows a distinct Browse error and retries the real service catalogue', async () => {
    servicesMock.servicesApi.getServices
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: [mockService], total: 1 });
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await waitForServicesCall();
      await settle(50);
      const text = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? '')).join(' ');
      expect(text).toContain('Chưa tải được dịch vụ');
      expect(text).not.toContain('Chưa có dịch vụ trong danh mục này');

      act(() => tree.root.findByProps({ accessibilityLabel: 'Thử tải lại dịch vụ' }).props.onPress());
      await settle(100);
      expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Vệ sinh điều hòa âm trần')).toBe(true);
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledTimes(2);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('keeps a known categoryCode and legacy nonempty query deep link working', async () => {
    mockRouteParams = { categoryCode: 'DIEN_LANH', query: 'máy lạnh' };
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await waitForServicesCall();
      expect(tree.root.findByType(TextInput).props.autoFocus).toBe(true);
      expect(tree.root.findByType(TextInput).props.value).toBe('máy lạnh');
      expect(servicesMock.servicesApi.getCategories).toHaveBeenCalled();
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'máy lạnh', page: 1, categoryId: mockCategory.id }),
      );
    } finally {
      act(() => tree.unmount());
    }
  });

  it('follows the Home catalog intent across pages and opens a real returned service row', async () => {
    mockRouteParams = {
      categoryCode: 'DIEN_LANH',
      serviceCode: 'VE_SINH_DIEU_HOA_1HP',
      serviceAlias: 'Vệ sinh máy lạnh',
    };
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...mockService,
      id: `catalog-${index}`,
      code: `OTHER_${index}`,
      name: `Dịch vụ danh mục ${index}`,
    }));
    const secondPage = [
      { ...mockService, id: 'aircon-1', code: 'VE_SINH_DIEU_HOA_1HP', name: 'Vệ sinh máy lạnh 1HP' },
      { ...mockService, id: 'aircon-2', code: 'VE_SINH_DIEU_HOA_2HP', name: 'Vệ sinh máy lạnh 2HP' },
      { ...mockService, id: 'aircon-ceiling', code: 'VE_SINH_DIEU_HOA_AM_TRAN', name: 'Vệ sinh điều hòa âm trần' },
    ];
    servicesMock.servicesApi.getServices.mockImplementation(async ({ page }) => ({
      data: page === 1 ? firstPage : secondPage,
      total: 103,
    }));

    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await settle(300);
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledWith({ search: '', page: 1, pageSize: 100 });
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledWith({ search: '', page: 2, pageSize: 100 });
      expect(servicesMock.servicesApi.getServices.mock.calls.every(([params]) => params.search === '')).toBe(true);
      expect(tree.root.findByProps({ accessibilityLabel: 'Vệ sinh máy lạnh 1HP' })).toBeDefined();
      expect(tree.root.findByProps({ accessibilityLabel: 'Vệ sinh máy lạnh 2HP' })).toBeDefined();
      expect(tree.root.findByProps({ accessibilityLabel: 'Vệ sinh điều hòa âm trần' })).toBeDefined();
      expect(tree.root.findAllByProps({ accessibilityLabel: 'Sửa máy lạnh' })).toHaveLength(0);

      act(() => tree.root.findByProps({ accessibilityLabel: 'Vệ sinh điều hòa âm trần' }).props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServiceDetail', { serviceId: 'aircon-ceiling' });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('applies changed route params and ignores an older search response', async () => {
    mockRouteParams = { query: 'máy lạnh', categoryCode: 'DIEN_LANH' };
    const staleSearch = deferred<{ data: ServiceItem[]; total: number }>();
    servicesMock.servicesApi.getServices.mockImplementation(({ search }) => search
      ? staleSearch.promise
      : Promise.resolve({
        data: [{ ...mockService, id: 'live-tv-1', code: 'LAP_TV_GIA_TREO', name: 'Lắp đặt tivi treo tường' }],
        total: 1,
      }));

    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await waitForServicesCall();
      expect(servicesMock.servicesApi.getServices).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'máy lạnh', categoryId: mockCategory.id }),
      );

      mockRouteParams = {
        categoryCode: 'DIEN_LANH',
        serviceCode: 'LAP_TV_GIA_TREO',
        serviceAlias: 'Lắp TV treo tường',
      };
      act(() => tree.update(listElement()));
      await settle(400);
      staleSearch.resolve({ data: [{ ...mockService, name: 'STALE ROUTE SERVICE' } as ServiceItem], total: 1 });
      await settle(30);

      expect(tree.root.findByType(TextInput).props.value).toBe('');
      expect(tree.root.findByProps({ accessibilityLabel: 'Lắp đặt tivi treo tường' })).toBeDefined();
      expect(tree.root.findAllByProps({ accessibilityLabel: 'STALE ROUTE SERVICE' })).toHaveLength(0);
      expect(servicesMock.servicesApi.getServices.mock.calls.some(([params]) => params.search === '')).toBe(true);
    } finally {
      act(() => tree.unmount());
    }
  });

  it.each([undefined, 'DIEN_LANH'])('clears the popular shortcut and category when browsing all categories (%s)', async (categoryCode) => {
    mockRouteParams = { serviceCode: 'VE_SINH_DIEU_HOA_1HP', categoryCode };
    const electricalCategory = { ...mockCategory, id: 'cat-electrical', code: 'DIEN_NUOC', name: 'Điện & Nước' };
    servicesMock.servicesApi.getCategories.mockResolvedValue([mockCategory, electricalCategory]);
    servicesMock.servicesApi.getServices.mockResolvedValue({ data: [
      { ...mockService, code: 'VE_SINH_DIEU_HOA_1HP', name: 'Vệ sinh máy lạnh' },
      { ...mockService, id: 'repair-ac', code: 'SUA_DIEU_HOA', name: 'Sửa máy lạnh' },
      { ...mockService, id: 'repair-leak', categoryId: electricalCategory.id, code: 'SUA_RO_RI_NUOC', name: 'Sửa rò rỉ nước' },
    ], total: 3 });
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await settle(50);
      expect(tree.root.findAllByProps({ accessibilityLabel: 'Sửa máy lạnh' })).toHaveLength(0);
      act(() => tree.root.findByProps({ accessibilityLabel: 'Xem tất cả danh mục dịch vụ' }).props.onPress());
      expect(tree.root.findByProps({ accessibilityLabel: 'Sửa máy lạnh' })).toBeDefined();
      expect(tree.root.findByProps({ accessibilityLabel: 'Sửa rò rỉ nước' })).toBeDefined();
      expect(tree.root.findByType(TextInput).props.value).toBe('');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('opens the entire category from a popular subset', async () => {
    mockRouteParams = { serviceCode: 'VE_SINH_DIEU_HOA_1HP', categoryCode: 'DIEN_LANH' };
    servicesMock.servicesApi.getServices.mockResolvedValue({ data: [
      { ...mockService, code: 'VE_SINH_DIEU_HOA_1HP', name: 'Vệ sinh máy lạnh' },
      { ...mockService, id: 'repair-ac', code: 'SUA_DIEU_HOA', name: 'Sửa máy lạnh' },
    ], total: 2 });
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await settle(50);
      act(() => tree.root.findByProps({ accessibilityLabel: 'Xem trong nhóm Điện lạnh' }).props.onPress());
      expect(tree.root.findByProps({ accessibilityLabel: 'Sửa máy lạnh' })).toBeDefined();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('keeps deliberate search when changing category and does not restore a shortcut when cleared', async () => {
    mockRouteParams = { serviceCode: 'VE_SINH_DIEU_HOA_1HP', categoryCode: 'DIEN_LANH' };
    servicesMock.servicesApi.getServices.mockResolvedValue({ data: [
      { ...mockService, code: 'VE_SINH_DIEU_HOA_1HP', name: 'Vệ sinh máy lạnh' },
      { ...mockService, id: 'repair-ac', code: 'SUA_DIEU_HOA', name: 'Sửa máy lạnh' },
    ], total: 2 });
    let tree!: ReactTestRenderer;
    act(() => { tree = create(listElement()); });
    try {
      await settle(50);
      act(() => tree.root.findByType(TextInput).props.onChangeText('điện'));
      await settle(350);
      act(() => tree.root.findByProps({ accessibilityLabel: 'Danh mục Tất cả' }).props.onPress());
      await settle(350);
      expect(tree.root.findByType(TextInput).props.value).toBe('điện');
      expect(servicesMock.servicesApi.getServices).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'điện', categoryId: undefined }),
      );
      act(() => tree.root.findByProps({ accessibilityLabel: 'Xóa nội dung tìm kiếm' }).props.onPress());
      await settle(50);
      expect(tree.root.findByProps({ accessibilityLabel: 'Sửa máy lạnh' })).toBeDefined();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('renders the mocked detail with 360-safe title and books with a prefill', async () => {
    mockRouteParams = { serviceId: SERVICE_ID };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(detailElement());
    });
    try {
      await settle(400);
      expect(servicesMock.servicesApi.getServiceById).toHaveBeenCalledWith(SERVICE_ID);

      const title = tree.root
        .findAllByType(Text)
        .find((node) => node.props.children === LONG_VN_NAME);
      expect(title).toBeDefined();
      // M3: detail title wraps with breathing room on a 360pt row.
      expect(flatStyle(title!).lineHeight).toBe(30);
      expect(flatStyle(title!).width).toBe('100%');

      const book = tree.root.findAllByType(TouchableOpacity).find(
        (node) => node.props.accessibilityLabel === `Đặt lịch sửa chữa ${LONG_VN_NAME}`,
      );
      expect(book).toBeDefined();
      act(() => book!.props.onPress());
      expect(mockPush).toHaveBeenCalledWith('CustomerBookingCreate', {
        prefill: { serviceId: SERVICE_ID, serviceName: LONG_VN_NAME },
      });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('routes an unauthenticated booking attempt to Auth without opening booking create', async () => {
    mockRouteParams = { serviceId: SERVICE_ID };
    mockIsAuthenticated = false;
    let tree!: ReactTestRenderer;
    act(() => { tree = create(detailElement()); });
    try {
      await settle(400);
      const book = tree.root.findAllByType(TouchableOpacity).find(
        (node) => node.props.accessibilityLabel === `Đặt lịch sửa chữa ${LONG_VN_NAME}`,
      );
      expect(book).toBeDefined();
      act(() => book!.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('Auth');
      expect(mockPush).not.toHaveBeenCalled();
    } finally {
      act(() => tree.unmount());
    }
  });

  it.each([
    {
      kind: 'fixed server price',
      pricingMode: 'fixed_price',
      fixedPrice: 350000,
      pill: 'Giá theo bảng giá dịch vụ',
      stepOne: 'Mọi thay đổi về phạm vi hoặc chi phí',
      stepTwo: 'cần bạn đồng ý trước khi thực hiện',
      absent: 'Kiểm tra trước, báo giá sau',
    },
    {
      kind: 'inspection-required server price',
      pricingMode: 'inspection_required',
      fixedPrice: null,
      pill: 'Kiểm tra trước, báo giá sau',
      stepOne: 'Kỹ thuật viên khảo sát và báo giá',
      stepTwo: 'Chỉ thực hiện khi bạn đồng ý',
      absent: 'Giá theo bảng giá dịch vụ',
    },
    {
      kind: 'fixed service missing published amount',
      pricingMode: 'fixed_price',
      fixedPrice: null,
      pill: 'Chi phí cần xác minh',
      stepOne: 'Mọi thay đổi về phạm vi hoặc chi phí',
      stepTwo: 'cần bạn đồng ý trước khi thực hiện',
      absent: 'Giá theo bảng giá dịch vụ',
    },
  ])('displays truthful quote flow for $kind', async ({ pricingMode, fixedPrice, pill, stepOne, stepTwo, absent }) => {
    mockRouteParams = { serviceId: SERVICE_ID };
    servicesMock.servicesApi.getServiceById.mockResolvedValue({
      ...mockService,
      pricingMode,
      fixedPrice,
    });
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(detailElement());
    });
    try {
      await settle(400);
      const shown = tree.root
        .findAllByType(Text)
        .flatMap((node) => typeof node.props.children === 'string' ? [node.props.children] : [])
        .join(' | ');
      expect(shown).toContain(pill);
      expect(shown).toContain(stepOne);
      expect(shown).toContain(stepTwo);
      expect(shown).not.toContain(absent);
      expect(servicesMock.servicesApi.getServiceById).toHaveBeenCalledWith(SERVICE_ID);
    } finally {
      act(() => tree.unmount());
    }
  });
});
