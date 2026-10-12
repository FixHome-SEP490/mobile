// src/screens/guest/CustomerGuestHomeScreen.test.tsx
import React from 'react';
import { Text, TextInput } from 'react-native';
import CustomerGuestHomeScreen from './CustomerGuestHomeScreen';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('react-native-safe-area-context', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    SafeAreaView: Native.View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const BottomSheetModal = ReactModule.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    const [presented, setPresented] = ReactModule.useState(false);
    ReactModule.useImperativeHandle(ref, () => ({
      present: () => setPresented(true),
      dismiss: () => {
        setPresented(false);
        (props.onDismiss as (() => void) | undefined)?.();
      },
    }));
    return presented ? ReactModule.createElement(Native.View, null, props.children) : null;
  });
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetModal,
    BottomSheetView: Native.View,
  };
});

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    __esModule: true,
    default: { View: Native.View },
    Easing: { cubic: 'cubic', out: (value: unknown) => value },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
    withSpring: (value: number) => value,
  };
});

jest.mock('lucide-react-native', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Icon = () => ReactModule.createElement(Native.View, null);
  return new Proxy({}, { get: () => Icon });
});

type TestNode = {
  props: { children?: unknown; onPress?: () => void; source?: unknown; resizeMode?: unknown };
};
type TestRenderer = {
  root: {
    findAllByType: (type: unknown) => TestNode[];
    findByProps: (props: Record<string, unknown>) => TestNode;
  };
};
const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => TestRenderer;
};

function renderText(children: unknown): string {
  if (Array.isArray(children)) return children.map(renderText).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return '';
}

beforeEach(() => {
  mockNavigate.mockClear();
});

describe('CustomerGuestHomeScreen stays static with an explicit login CTA', () => {
  it('opens discovery without focusing a Home input or opening the keyboard', async () => {
    let tree!: TestRenderer;
    await act(async () => { tree = create(<CustomerGuestHomeScreen />); });
    expect(tree.root.findAllByType(Text)).toBeDefined();
    expect(tree.root.findByProps({ accessibilityLabel: 'Tìm dịch vụ tại nhà' })).toBeDefined();
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tìm dịch vụ tại nhà' }).props.onPress?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerServices');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    const text = tree.root.findAllByType(Text).map((node) => renderText(node.props.children));
    expect(text).not.toContain('Khám phá');
    expect(text).not.toContain('CHĂM NHÀ, NHẸ LÒNG');
  });
  it('renders static content without fake price, ratings, or ETA promises', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    const text = tree.root.findAllByType(Text).map((node) => renderText(node.props.children)).join(' ');
    expect(text).not.toMatch(/₫|đánh giá|★|ETA|km|phút/i);
    for (const service of ['Vệ sinh máy lạnh', 'Thay công tắc điện', 'Sửa rò rỉ nước']) {
      expect(text).toContain(service);
    }
  });

  it('opens the public service catalogue when a category tile is pressed', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Xem dịch vụ Sửa rò rỉ nước' }).props.onPress?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerServices', expect.objectContaining({ query: expect.any(String) }));
    expect(mockNavigate).not.toHaveBeenCalledWith('Auth');
  });

  it('opens the public catalogue from Xem tất cả and the Home search bar', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Xem tất cả dịch vụ' }).props.onPress?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerServices');

    mockNavigate.mockClear();
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tìm dịch vụ tại nhà' }).props.onPress?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerServices');
  });

  it('renders the Codex guest hierarchy: brand, hero, search, categories, AI teaser', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    const text = tree.root.findAllByType(Text).map((node) => renderText(node.props.children)).join(' ');
    expect(text).toContain('FixHome');
    expect(text).not.toContain('CHĂM NHÀ, NHẸ LÒNG');
    expect(text).toContain('Nhà cần sửa.');
    expect(text).toContain('Dịch vụ cho nhà bạn');
    expect(text).toContain('Chưa biết bắt đầu từ đâu?');
  });

  it('keeps booking and AI gates behind explicit login', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tìm hiểu gợi ý AI, cần đăng nhập' }).props.onPress?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Auth');
  });

  it('sends the guest through Auth after choosing regular booking from the center action', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' }).props.onPress?.();
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Đặt lịch thông thường' }).props.onPress?.();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Auth');
    expect(mockNavigate).not.toHaveBeenCalledWith('CustomerServices');
    expect(mockNavigate).not.toHaveBeenCalledWith('CustomerBookingCreate');
  });

  it('sends the guest through Auth after choosing AI booking from the center action', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' }).props.onPress?.();
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'AI hỗ trợ đặt lịch' }).props.onPress?.();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Auth');
    expect(mockNavigate).not.toHaveBeenCalledWith('CustomerAIDiagnosis');
    expect(mockNavigate).not.toHaveBeenCalledWith('CustomerAIChat');
  });

  it('does not mount an editable Home search field', async () => {
    let tree!: TestRenderer;
    await act(async () => { tree = create(<CustomerGuestHomeScreen />); });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('renders the owner hero art contained from the bundled optimized asset', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    const hero = tree.root.findByProps({ testID: 'guest-hero-art' });
    expect(hero.props.source).toEqual(require('../../../assets/optimized/ui/home-hero-repair-family.png'));
    expect(hero.props.resizeMode).toBe('contain');
  });

  it('bundles the owner hero art as an optimized transparent RGBA PNG', () => {
    const fs = jest.requireActual<{ readFileSync: (file: string) => Uint8Array }>('fs');
    const png = fs.readFileSync('assets/optimized/ui/home-hero-repair-family.png');
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(768);
    expect(view.getUint32(20)).toBeLessThanOrEqual(768);
    expect(png[25]).toBe(6);
  });

  it('keeps Home local while protected guest tabs route to Auth', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    for (const tab of ['Hoạt động', 'Thông báo', 'Tài khoản']) {
      await act(async () => {
        tree.root.findByProps({ accessibilityLabel: `Khách: ${tab}, cần đăng nhập` }).props.onPress?.();
      });
      expect(mockNavigate).toHaveBeenCalledWith('Auth');
      mockNavigate.mockClear();
    }
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Khách: Trang chủ' }).props.onPress?.();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('imports no API, storage, or protected tab modules', () => {
    const fs = jest.requireActual<{ readFileSync: (file: string, encoding: string) => string }>('fs');
    const source = fs.readFileSync('src/screens/guest/CustomerGuestHomeScreen.tsx', 'utf8');
    expect(source).not.toMatch(/from ['"]\.\.\/\.\.\/api\//);
    expect(source).not.toMatch(/AsyncStorage|SecureStore|expo-secure-store/);
    expect(source).not.toMatch(/CustomerNavigator/);
    expect(source).not.toMatch(/<Stack\.Screen name="CustomerMain"/);
  });

  it('login CTA navigates to Auth with guest back stack preserved', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerGuestHomeScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Đăng nhập hoặc tạo tài khoản' }).props.onPress?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Auth');
  });
});
