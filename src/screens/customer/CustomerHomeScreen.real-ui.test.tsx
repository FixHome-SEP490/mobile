import React from 'react';
import { Dimensions, Text, TextInput, TouchableOpacity } from 'react-native';
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
storeMock.useAuthStore.mockImplementation(() => ({
  user: { id: 'customer-a', role: 'customer' },
  isAuthenticated: true,
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  mockChatUnreadCount.mockReturnValue(0);
  storeMock.useAuthStore.mockImplementation(() => ({
    user: { id: 'customer-a', role: 'customer' },
    isAuthenticated: true,
  }));
});

describe('CustomerHomeScreen real UI (ServiceArtwork popular layout)', () => {
  it('shares guest Home browsing while private actions open Auth without address requests', () => {
    storeMock.useAuthStore.mockImplementation(() => ({ user: null, isAuthenticated: false }));
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
  it('renders real search, Basic/AI entries, and 8 popular services with honest artwork', () => {
    const tree = mountScreen();
    try {
      const texts = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      const joined = texts.join('\n');
      // Codex canonical hero text (C-NATIVE-02 visual update)
      expect(joined).toContain('Nhà cần sửa.');
      expect(joined).toContain('Dịch vụ cho nhà bạn');
      // AI entry preserved
      expect(joined).toContain('Chưa biết bắt đầu từ đâu?');
      // "Other service" entry
      expect(joined).toContain('Không thấy dịch vụ bạn cần?');

      const serviceButtons = tree.root.findAllByType(TouchableOpacity).filter(
        (node) => typeof node.props.accessibilityHint === 'string' && node.props.accessibilityHint.startsWith('Tìm '),
      );
      expect(serviceButtons).toHaveLength(8);

      // Honest opaque artwork per service: one image or one neutral fallback, never a nested white frame.
      const artworks = tree.root.findAll(
        (node) => typeof node.props.testID === 'string' && String(node.props.testID).startsWith('service-artwork-'),
      );
      expect(artworks.length).toBeGreaterThanOrEqual(8);
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

  it('keeps existing service selection: popular press deep-links CustomerServices with category/query', () => {
    const tree = mountScreen();
    try {
      const target = tree.root.findAllByType(TouchableOpacity).find(
        (node) => node.props.accessibilityLabel === 'Vệ sinh máy lạnh',
      );
      expect(target).toBeDefined();
      act(() => target!.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerServices', {
        categoryCode: 'DIEN_LANH',
        query: 'Vệ sinh máy lạnh',
      });
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

  it('shows all 8 real popular services in one accessible grid without paging', () => {
    const tree = mountScreen();
    try {
      const grid = tree.root.findByProps({ testID: 'popular-services-grid' });
      const visibleServices = grid.findAllByType(TouchableOpacity);
      expect(visibleServices.map((node) => node.props.accessibilityLabel)).toStrictEqual([
        'Vệ sinh máy lạnh',
        'Thay vòi nước',
        'Thay công tắc điện',
        'Sửa rò rỉ nước',
        'Lắp TV treo tường',
        'Sửa bếp từ',
        'Sửa máy giặt',
        'Sửa tủ lạnh',
      ]);
      expect(tree.root.findAllByProps({ testID: 'popular-services-pager' })).toHaveLength(0);
      expect(tree.root.findAllByProps({ testID: 'popular-services-dot-0' })).toHaveLength(0);
      expect(visibleServices.every((node) => node.props.accessibilityRole === 'button')).toBe(true);
      expect(visibleServices.every((node) => {
        const style = Array.isArray(node.props.style)
          ? Object.assign({}, ...node.props.style)
          : node.props.style;
        return Number(style?.minHeight) >= 44;
      })).toBe(true);
      expect(grid.findAllByType(Text).filter((node) => node.props.numberOfLines === 2)).toHaveLength(8);
    } finally {
      act(() => tree.unmount());
    }
  });
});
