import React from 'react';
import { Dimensions, Image, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockChatUnreadCount = jest.fn(() => 0);

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) };
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

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    MessageCircle: (props: Record<string, unknown>) => ReactModule.createElement(Native.View, props),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    BottomSheetModal: ReactModule.forwardRef((props: { children?: unknown }, _ref: unknown) =>
      ReactModule.createElement(ReactModule.Fragment, null, props.children),
    ),
    BottomSheetBackdrop: () => null,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BottomSheetFlatList: require('react-native').FlatList,
  };
});

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#64748B',
      muted: '#94A3B8',
      border: '#E2E8F0',
      divider: '#F1F5F9',
      primary: '#3B82F6',
      primaryStrong: '#2563EB',
      primarySoft: '#EFF6FF',
      primaryTint: '#DBEAFE',
      error: '#DC2626',
      success: '#059669',
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
    fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, xxl: 24, xxxl: 32 },
  }),
}));

jest.mock('../../hooks/useScrollHideTabBar', () => ({
  useScrollHideTabBar: () => jest.fn(),
}));
jest.mock('../../components/navigation/CustomerAnimatedBottomBar', () => () => null);

jest.mock('../../hooks/useChatUnreadCount', () => ({
  useChatUnreadCount: () => mockChatUnreadCount(),
}));

jest.mock('../../store', () => ({
  useAuthStore: Object.assign(jest.fn(), {
    getState: () => ({ user: { id: 'customer-a', role: 'customer' }, isAuthenticated: true }),
  }),
}));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: Object.assign(jest.fn(), {
    getState: () => ({ user: { id: 'customer-a', role: 'customer' }, isAuthenticated: true }),
  }),
}));

jest.mock('../../api/users.api', () => ({
  usersApi: { getAddresses: jest.fn(() => Promise.resolve([])) },
}));

jest.mock('../../api/bookings.api', () => ({
  bookingsApi: { getMyBookingsPage: jest.fn(() => Promise.resolve({ data: [] })) },
}));

jest.mock('../../api/orders.api', () => ({
  ordersApi: { getMyOrders: jest.fn(() => Promise.resolve([])) },
}));

const storeMock = jest.requireMock('../../store') as { useAuthStore: jest.Mock };
// One stable session object: a fresh object on every render would re-run the effects that depend on `user`.
const GUEST_SESSION = { user: null, isAuthenticated: false };
const CUSTOMER_SESSION = { user: { id: 'customer-a', role: 'customer' }, isAuthenticated: true };
storeMock.useAuthStore.mockImplementation(() => CUSTOMER_SESSION);

function screenElement() {
  const { default: CustomerHomeScreen } = jest.requireActual('./CustomerHomeScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerHomeScreen);
}

function mountScreen(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(screenElement());
  });
  return tree;
}

// The live Catalog V2 categories (`GET /categories`, 19/10/2026), in the server order.
const mockCategories = [{"id":"cat-CAT_AC","code":"CAT_AC","name":"Điều hòa","isActive":true,"sortOrder":1},{"id":"cat-CAT_LAUNDRY","code":"CAT_LAUNDRY","name":"Máy giặt & máy sấy","isActive":true,"sortOrder":2},{"id":"cat-CAT_FRIDGE","code":"CAT_FRIDGE","name":"Tủ lạnh","isActive":true,"sortOrder":3},{"id":"cat-CAT_RO","code":"CAT_RO","name":"Máy lọc nước","isActive":true,"sortOrder":4},{"id":"cat-CAT_HEATER","code":"CAT_HEATER","name":"Bình nóng lạnh","isActive":true,"sortOrder":5},{"id":"cat-CAT_KITCHEN","code":"CAT_KITCHEN","name":"Thiết bị nhà bếp","isActive":true,"sortOrder":6},{"id":"cat-CAT_ELECTRIC","code":"CAT_ELECTRIC","name":"Điện dân dụng","isActive":true,"sortOrder":7},{"id":"cat-CAT_LIGHT_FAN","code":"CAT_LIGHT_FAN","name":"Đèn & quạt","isActive":true,"sortOrder":8},{"id":"cat-CAT_PIPE","code":"CAT_PIPE","name":"Đường ống nước","isActive":true,"sortOrder":9},{"id":"cat-CAT_PUMP","code":"CAT_PUMP","name":"Máy bơm nước","isActive":true,"sortOrder":10},{"id":"cat-CAT_SANITARY","code":"CAT_SANITARY","name":"Thiết bị vệ sinh & thông tắc","isActive":true,"sortOrder":11},{"id":"cat-CAT_TV","code":"CAT_TV","name":"Tivi & màn hình","isActive":true,"sortOrder":12},{"id":"cat-CAT_LOCK","code":"CAT_LOCK","name":"Khóa cửa","isActive":true,"sortOrder":13}];
jest.mock('../../api/services.api', () => ({
  servicesApi: { getCategories: jest.fn(() => Promise.resolve(mockCategories)) },
}));

async function mountLoaded(): Promise<ReactTestRenderer> {
  const tree = mountScreen();
  await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChatUnreadCount.mockReturnValue(0);
  storeMock.useAuthStore.mockImplementation(() => CUSTOMER_SESSION);
});

describe('CustomerHomeScreen real UI (ServiceArtwork popular layout)', () => {
  it.each([
    ['guest', { user: null, isAuthenticated: false }],
    ['signed-in customer', { user: { id: 'customer-a', role: 'customer' }, isAuthenticated: true }],
  ] as const)('shows the order tracking shortcut below search for %s', (_actor, session) => {
    storeMock.useAuthStore.mockImplementation(() => session);
    const tree = mountScreen();
    try {
      const tracking = tree.root.findByProps({ testID: 'home-order-tracking' });
      expect(tracking.props.accessibilityRole).toBe('button');
      expect(tracking.props.accessibilityLabel).toBe('Tra cứu đơn sửa chữa');
      act(() => tracking.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('PublicOrderTracking');
    } finally { act(() => tree.unmount()); }
  });

  it('shares guest Home browsing while private actions open Auth without address requests', () => {
    storeMock.useAuthStore.mockImplementation(() => GUEST_SESSION);
    const tree = mountScreen();
    try {
      act(() => tree.root.findByProps({ accessibilityLabel: 'Hỏi FixHome AI' }).props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('Auth');
      expect(jest.requireMock('../../api/users.api').usersApi.getAddresses).not.toHaveBeenCalled();
      act(() => tree.root.findByProps({ accessibilityLabel: 'Tìm dịch vụ tại nhà' }).props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServices');
    } finally { act(() => tree.unmount()); }
  });
  it('renders a visible vector chat icon and unread badge in the 40dp action at phone widths', () => {
    for (const width of [320, 360, 390, 430]) {
      Dimensions.set({
        window: { width, height: 800, scale: 1, fontScale: 1 },
        screen: { width, height: 800, scale: 1, fontScale: 1 },
      });
      mockChatUnreadCount.mockReturnValue(2);
      const tree = mountScreen();
      try {
        const chatButton = tree.root.findByProps({ accessibilityLabel: 'Tin nhắn, 2 tin chưa đọc' });
        const buttonStyle = Array.isArray(chatButton.props.style)
          ? Object.assign({}, ...chatButton.props.style)
          : chatButton.props.style;
        expect(buttonStyle.width).toBe(40);
        expect(buttonStyle.height).toBe(40);
        expect(chatButton.findByProps({ testID: 'home-chat-message-icon' })).toBeDefined();
        expect(tree.root.findAllByType(Text).some((node) => node.props.children === 2)).toBe(true);
        act(() => chatButton.props.onPress());
        expect(mockNavigate).toHaveBeenCalledWith('ChatList');
      } finally {
        act(() => tree.unmount());
      }
    }
  });

  it('keeps both full hero lines across narrow widths and stacks art for larger text', () => {
    for (const width of [320, 360, 390, 430]) {
      Dimensions.set({
        window: { width, height: 800, scale: 1, fontScale: 1 },
        screen: { width, height: 800, scale: 1, fontScale: 1 },
      });
      const tree = mountScreen();
      try {
        const copy = tree.root.findByProps({ testID: 'home-hero-headline-copy' });
        const copyStyle = Array.isArray(copy.props.style)
          ? Object.assign({}, ...copy.props.style)
          : copy.props.style;
        const art = tree.root.findByProps({ testID: 'home-hero-art' });
        const artStyle = Array.isArray(art.props.style)
          ? Object.assign({}, ...art.props.style)
          : art.props.style;
        expect(copyStyle.width).toBe('100%');
        expect(artStyle.position).toBe('absolute');
        for (const headline of ['Nhà cần sửa.', 'Mình có nhau.']) {
          const line = tree.root.findAllByType(Text).find((node) => node.props.children === headline);
          expect(line?.props.numberOfLines).toBe(1);
        }
      } finally {
        act(() => tree.unmount());
      }
    }

    Dimensions.set({
      window: { width: 320, height: 800, scale: 1, fontScale: 1.3 },
      screen: { width: 320, height: 800, scale: 1, fontScale: 1.3 },
    });
    const enlargedTree = mountScreen();
    try {
      const art = enlargedTree.root.findByProps({ testID: 'home-hero-art' });
      const artStyle = Array.isArray(art.props.style)
        ? Object.assign({}, ...art.props.style)
        : art.props.style;
      expect(artStyle.position).toBe('relative');
      expect(enlargedTree.root.findAllByType(Text).some((node) => node.props.children === 'Mình có nhau.')).toBe(true);
    } finally {
      act(() => enlargedTree.unmount());
    }
  });

  it('ends with room for the whole tab bar so the last row is not hidden under it', () => {
    const tree = mountScreen();
    try {
      // 64 pill + 34 home indicator + 16 gap
      expect(tree.root.findByProps({ testID: 'home-tab-bar-clearance' }).props.style.height).toBe(114);
    } finally { act(() => tree.unmount()); }
  });
  it('puts wallet and warranty one tap from Home for a signed-in customer only', () => {
    const tree = mountScreen();
    try {
      act(() => tree.root.findByProps({ testID: 'home-quick-CustomerWallet' }).props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerWallet');
      act(() => tree.root.findByProps({ testID: 'home-quick-CustomerWarranties' }).props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerWarranties');
    } finally { act(() => tree.unmount()); }
    storeMock.useAuthStore.mockImplementation(() => GUEST_SESSION);
    const guest = mountScreen();
    try {
      expect(guest.root.findAllByProps({ testID: 'home-quick-CustomerWallet' })).toHaveLength(0);
    } finally { act(() => guest.unmount()); }
  });
  it('opens discovery from the Home search without mounting a focusable input', () => {
    const tree = mountScreen();
    try {
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      const search = tree.root.findByProps({ accessibilityLabel: 'Tìm dịch vụ tại nhà' });
      act(() => search!.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServices');
    } finally {
      act(() => tree.unmount());
    }
  });
  it('renders real search, Basic/AI entries and the big categories with honest artwork', async () => {
    const tree = await mountLoaded();
    try {
      const joined = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? '')).join('\n');
      expect(joined).toContain('Nhà cần sửa.');
      expect(joined).toContain('Dịch vụ cho nhà bạn');
      expect(joined).toContain('Chưa biết bắt đầu từ đâu?');
      expect(joined).toContain('Không thấy dịch vụ bạn cần?');

      const categoryButtons = tree.root.findAllByType(TouchableOpacity).filter(
        (node) => typeof node.props.accessibilityHint === 'string' && node.props.accessibilityHint.startsWith('Xem các dịch vụ '),
      );
      expect(categoryButtons).toHaveLength(13);

      // Honest opaque artwork per category: one image or one neutral fallback, never a nested white frame.
      const artworks = tree.root.findAll(
        (node) => typeof node.props.testID === 'string' && String(node.props.testID).startsWith('service-artwork-'),
      );
      expect(artworks.length).toBeGreaterThanOrEqual(13);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('keeps both hero headline lines to one line so the illustration cannot force a third', () => {
    const tree = mountScreen();
    try {
      for (const headline of ['Nhà cần sửa.', 'Mình có nhau.']) {
        const line = tree.root.findAllByType(Text).find((node) => node.props.children === headline);
        expect(line?.props.numberOfLines).toBe(1);
      }
    } finally {
      act(() => tree.unmount());
    }
  });

  it('opens the services of a category when its tile is tapped', async () => {
    const tree = await mountLoaded();
    try {
      act(() => tree.root.findByProps({ testID: 'home-category-CAT_AC' }).props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServices', { categoryCode: 'CAT_AC' });
      act(() => tree.root.findByProps({ testID: 'home-category-CAT_PUMP' }).props.onPress());
      expect(mockNavigate).toHaveBeenLastCalledWith('CustomerServices', { categoryCode: 'CAT_PUMP' });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('draws every category tile with a real picture, not the neutral fallback', async () => {
    const tree = await mountLoaded();
    try {
      const grid = tree.root.findByProps({ testID: 'popular-services-grid' });
      for (const category of mockCategories) {
        const tile = grid.findByProps({ testID: `home-category-${category.code}` });
        expect(tile.findAll((node) => node.type === Image).length).toBeGreaterThan(0);
      }
    } finally {
      act(() => tree.unmount());
    }
  });

  it('says so and offers a retry when the categories cannot be loaded', async () => {
    const servicesApi = jest.requireMock('../../api/services.api').servicesApi as { getCategories: jest.Mock };
    servicesApi.getCategories.mockRejectedValueOnce(new Error('offline'));
    const tree = await mountLoaded();
    try {
      const retry = tree.root.findByProps({ testID: 'home-categories-retry' });
      await act(async () => { retry.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
      expect(tree.root.findAllByProps({ testID: 'home-categories-retry' })).toHaveLength(0);
      expect(tree.root.findAllByProps({ testID: 'home-category-CAT_AC' }).length).toBeGreaterThan(0);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('opens discovery without pre-filling a search term', () => {
    const tree = mountScreen();
    try {
      const search = tree.root.findByProps({ accessibilityLabel: 'Tìm dịch vụ tại nhà' });
      act(() => search.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServices');
      expect(mockNavigate).not.toHaveBeenCalledWith('CustomerServices', { query: '' });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('shows all 13 categories in one accessible grid without paging', async () => {
    const tree = await mountLoaded();
    try {
      const grid = tree.root.findByProps({ testID: 'popular-services-grid' });
      const tiles = grid.findAllByType(TouchableOpacity);
      expect(tiles.map((node) => node.props.accessibilityLabel)).toStrictEqual(mockCategories.map((c) => c.name));
      expect(tree.root.findAllByProps({ testID: 'popular-services-pager' })).toHaveLength(0);
      expect(tiles.every((node) => node.props.accessibilityRole === 'button')).toBe(true);
      expect(tiles.every((node) => {
        const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
        return Number(style?.minHeight) >= 44;
      })).toBe(true);
      expect(grid.findAllByType(Text).filter((node) => node.props.numberOfLines === 2)).toHaveLength(13);
    } finally {
      act(() => tree.unmount());
    }
  });

});
