import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler, StyleSheet, Text } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import CustomerAnimatedBottomBar from './CustomerAnimatedBottomBar';

let mockReduceMotion = false;
const mockWithTiming = jest.fn((value: number, _config?: object) => value);
const mockWithSpring = jest.fn((value: number, _config?: object) => value);
const mockSelectionHaptic = jest.fn();

jest.mock('expo-haptics', () => ({ selectionAsync: (...args: unknown[]) => mockSelectionHaptic(...args) }));

jest.mock('@gorhom/bottom-sheet', () => {
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
    return presented
      ? ReactModule.createElement(Native.View, { testID: 'mock-bottom-sheet-modal', accessible: props.accessible }, props.children)
      : null;
  });
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetModal,
    BottomSheetView: Native.View,
  };
});

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Icon = () => ReactModule.createElement(Native.View, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('react-native-reanimated', () => {
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: Native.View },
    Easing: { cubic: 'cubic', out: (value: unknown) => value },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number, config: object) => mockWithTiming(value, config),
    withSpring: (value: number, config: object) => mockWithSpring(value, config),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));
jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

const routeNames = ['Home', 'Bookings', 'Notifications', 'Profile'];
const routeTitles = ['Trang chủ', 'Hoạt động', 'Thông báo', 'Tài khoản'];
const mockEmit = jest.fn((_event: unknown): { defaultPrevented: boolean } => ({ defaultPrevented: false }));
const mockTabNavigate = jest.fn();
const mockRootNavigate = jest.fn();

function createTabBarProps(activeIndex = 1): BottomTabBarProps {
  const routes = routeNames.map((name, index) => ({
    key: `route-${index}`,
    name,
    params: undefined,
  }));
  const descriptors = Object.fromEntries(routes.map((route, index) => [route.key, {
    options: {
      title: routeTitles[index],
      tabBarAccessibilityLabel: routeTitles[index],
      tabBarIcon: ({ focused }: { focused: boolean }) =>
        React.createElement(Text, null, `${route.name} icon ${focused ? 'selected' : 'idle'}`),
      ...(route.name === 'Notifications' ? { tabBarBadge: 3 } : {}),
    },
    navigation: {},
    render: () => null,
  }]));

  return {
    state: {
      key: 'customer-tabs',
      index: activeIndex,
      routeNames,
      routes,
      history: [],
      type: 'tab',
      stale: false,
    },
    descriptors,
    navigation: {
      emit: mockEmit,
      navigate: mockTabNavigate,
      getParent: () => ({ navigate: mockRootNavigate }),
    },
  } as unknown as BottomTabBarProps;
}

function renderAuthenticatedBar(activeIndex = 1) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <CustomerAnimatedBottomBar {...createTabBarProps(activeIndex)} mode="authenticated" />,
    );
  });
  return tree;
}

function openBookingSheet(tree: TestRenderer.ReactTestRenderer) {
  act(() => {
    tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' }).props.onPress();
  });
}

function getAccessibleTabs(tree: TestRenderer.ReactTestRenderer) {
  const tabNodes = tree.root.findAll((node) =>
    node.props.accessibilityRole === 'tab' && typeof node.props.accessibilityLabel === 'string',
  );
  return [...new Map(tabNodes.map((node) => [node.props.accessibilityLabel, node])).values()];
}

beforeEach(() => {
  mockReduceMotion = false;
  mockWithTiming.mockClear();
  mockWithSpring.mockClear();
  mockEmit.mockClear();
  mockEmit.mockReturnValue({ defaultPrevented: false });
  mockTabNavigate.mockClear();
  mockRootNavigate.mockClear();
});

describe('CustomerAnimatedBottomBar', () => {
  it('shows four accessible tab routes and one separate center action', () => {
    const tree = renderAuthenticatedBar();
    const tabs = getAccessibleTabs(tree);
    const centerAction = tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' });

    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Trang chủ',
      'Hoạt động',
      'Thông báo, 3 thông báo chưa đọc',
      'Tài khoản',
    ]);
    expect(tabs.map((tab) => tab.props.accessibilityState)).toEqual([
      { selected: false }, { selected: true }, { selected: false }, { selected: false },
    ]);
    expect(centerAction.props.accessibilityRole).toBe('button');
    expect(tree.root.findByProps({ testID: 'customer-tab-indicator' })).toBeDefined();
    expect(tree.root.findByProps({ accessibilityLabel: 'Thông báo, 3 thông báo chưa đọc' })).toBeDefined();
    expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toContain('Profile icon idle');
  });

  it('emits tabPress and navigates only when the Customer tab selection is allowed', () => {
    const tree = renderAuthenticatedBar();
    const notifications = tree.root.findByProps({ accessibilityLabel: 'Thông báo, 3 thông báo chưa đọc' });
    act(() => notifications.props.onPress());

    expect(mockEmit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'route-2',
      canPreventDefault: true,
    });
    expect(mockTabNavigate).toHaveBeenCalledWith('Notifications', undefined);

    mockEmit.mockReturnValue({ defaultPrevented: true });
    mockTabNavigate.mockClear();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Tài khoản' }).props.onPress());
    expect(mockTabNavigate).not.toHaveBeenCalled();
  });

  it('opens the two authenticated choices without changing the selected tab', () => {
    const tree = renderAuthenticatedBar();
    openBookingSheet(tree);

    expect(tree.root.findByProps({ testID: 'mock-bottom-sheet-modal' })).toBeDefined();
    // The actual Gorhom v5 wrapper defaults to accessible=true, merging all sheet choices for VoiceOver.
    expect(tree.root.findByProps({ testID: 'mock-bottom-sheet-modal' }).props.accessible).toBe(false);
    expect(tree.root.findByProps({ accessibilityLabel: 'Đặt lịch thông thường' })).toBeDefined();
    expect(tree.root.findByProps({ accessibilityLabel: 'AI hỗ trợ đặt lịch' })).toBeDefined();
    expect(getAccessibleTabs(tree)).toHaveLength(4);
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockTabNavigate).not.toHaveBeenCalled();
    expect(mockRootNavigate).not.toHaveBeenCalled();
  });

  it('routes regular booking to the public service catalogue before BookingCreate', () => {
    const tree = renderAuthenticatedBar();
    openBookingSheet(tree);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Đặt lịch thông thường' }).props.onPress());

    expect(mockRootNavigate).toHaveBeenCalledWith('CustomerServices');
    expect(mockRootNavigate).not.toHaveBeenCalledWith('CustomerBookingCreate');
    expect(mockTabNavigate).not.toHaveBeenCalled();
  });

  it('routes AI booking to the existing diagnosis entry without starting AI or a booking', () => {
    const tree = renderAuthenticatedBar();
    openBookingSheet(tree);
    act(() => tree.root.findByProps({ accessibilityLabel: 'AI hỗ trợ đặt lịch' }).props.onPress());

    expect(mockRootNavigate).toHaveBeenCalledWith('CustomerAIDiagnosis');
    expect(mockRootNavigate).not.toHaveBeenCalledWith('CustomerAIChat');
    expect(mockRootNavigate).not.toHaveBeenCalledWith('CustomerBookingCreate');
  });

  it('lets Guest choose either route through the supplied Auth handoff', () => {
    const onGuestTabPress = jest.fn();
    const onGuestBookingChoice = jest.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <CustomerAnimatedBottomBar
          mode="guest"
          activeRouteName="Home"
          onGuestTabPress={onGuestTabPress}
          onGuestBookingChoice={onGuestBookingChoice}
        />,
      );
    });

    expect(getAccessibleTabs(tree)).toHaveLength(4);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: 'Đặt lịch thông thường' }).props.onPress());
    expect(onGuestBookingChoice).toHaveBeenCalledWith('standard');

    act(() => tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: 'AI hỗ trợ đặt lịch' }).props.onPress());
    expect(onGuestBookingChoice).toHaveBeenCalledWith('ai');
    expect(onGuestBookingChoice).toHaveBeenCalledTimes(2);
    expect(onGuestTabPress).not.toHaveBeenCalledWith('CustomerAIDiagnosis');
  });

  it('keeps the five positions responsive to measured 360, 390, and 430 point widths', () => {
    const tree = renderAuthenticatedBar();
    const layout = tree.root.findByProps({ testID: 'customer-bottom-bar-positions' });
    const indicator = tree.root.findByProps({ testID: 'customer-tab-indicator' });

    for (const width of [360, 390, 430]) {
      act(() => layout.props.onLayout({ nativeEvent: { layout: { width } } }));
      expect(StyleSheet.flatten(indicator.props.style).width).toBeGreaterThan(50);
      expect(getAccessibleTabs(tree)).toHaveLength(4);
    }
  });

  it('keeps the raised 56dp booking control inside parent touch bounds and outside the clipped tab surface at 320dp', () => {
    const tree = renderAuthenticatedBar();
    const positions = tree.root.findByProps({ testID: 'customer-bottom-bar-positions' });
    act(() => positions.props.onLayout({ nativeEvent: { layout: { width: 288 } } }));
    const layer = tree.root.findByProps({ testID: 'customer-booking-action-layer' });
    const action = tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' });
    const actionStyle = StyleSheet.flatten(action.props.style({ pressed: false }));
    const containerStyle = StyleSheet.flatten(tree.root.findByProps({ testID: 'customer-animated-bottom-bar' }).props.style);
    const layerStyle = StyleSheet.flatten(layer.props.style);
    const columnWidth = 288 / 5;

    expect(StyleSheet.flatten(positions.props.style).overflow).toBe('hidden');
    expect(layer.parent).not.toBe(positions);
    expect(layer.findAllByProps({ accessibilityLabel: 'Đặt lịch' }).length).toBeGreaterThan(0);
    expect(actionStyle).toMatchObject({ width: 56, height: 56, borderRadius: 28 });
    expect(columnWidth).toBeGreaterThanOrEqual(actionStyle.width);
    expect(StyleSheet.flatten(layer.props.style)).toMatchObject({ position: 'absolute' });
    // Native hit testing cannot reach children above the parent's bounds.
    expect(layerStyle.top).toBeGreaterThanOrEqual(0);
    expect(containerStyle.paddingTop - layerStyle.top).toBe(8);
    expect(layerStyle.top + actionStyle.height).toBeLessThanOrEqual(containerStyle.paddingTop + 64);
    expect(getAccessibleTabs(tree)).toHaveLength(4);
  });

  it('uses haptic spring feedback for the center action and suppresses its spring for Reduce Motion', () => {
    const tree = renderAuthenticatedBar();
    const action = tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' });
    mockWithSpring.mockClear();
    act(() => action.props.onPressIn());
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    expect(mockWithSpring).toHaveBeenCalledWith(0.94, expect.objectContaining({ damping: 18, stiffness: 260, mass: 0.5 }));
    act(() => action.props.onPressOut());
    expect(mockWithSpring).toHaveBeenLastCalledWith(1, expect.any(Object));

    mockReduceMotion = true;
    act(() => tree.update(<CustomerAnimatedBottomBar {...createTabBarProps()} mode="authenticated" />));
    mockWithSpring.mockClear();
    const reducedMotionAction = tree.root.findByProps({ accessibilityLabel: 'Đặt lịch' });
    act(() => { reducedMotionAction.props.onPressIn(); reducedMotionAction.props.onPressOut(); });
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });

  it('slides the indicator through four tab columns and skips the center action column', () => {
    const expectedXByTab = [0, 78, 234, 312];

    expectedXByTab.forEach((expectedX, activeIndex) => {
      mockWithTiming.mockClear();
      const tree = renderAuthenticatedBar(activeIndex);
      const layout = tree.root.findByProps({ testID: 'customer-bottom-bar-positions' });
      act(() => layout.props.onLayout({ nativeEvent: { layout: { width: 390 } } }));

      expect(mockWithSpring).toHaveBeenLastCalledWith(
        expectedX,
        expect.objectContaining({ damping: 14, stiffness: 130, mass: 0.8 }),
      );
      act(() => tree.unmount());
    });
  });

  it('renders icons without redundant text captions and highlights the booking choice while open', () => {
    const tree = renderAuthenticatedBar();
    expect(tree.root.findAllByType(Text).map((node) => node.props.children))
      .not.toEqual(expect.arrayContaining(routeTitles));
    openBookingSheet(tree);
    expect(mockWithSpring).toHaveBeenLastCalledWith(0, expect.any(Object));
    const layout = tree.root.findByProps({ testID: 'customer-bottom-bar-positions' });
    act(() => layout.props.onLayout({ nativeEvent: { layout: { width: 390 } } }));
    expect(mockWithSpring).toHaveBeenLastCalledWith(156, expect.any(Object));
    expect(mockRootNavigate).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('removes tab indicator timing when Reduce Motion is enabled', () => {
    mockReduceMotion = true;
    const tree = renderAuthenticatedBar();
    const layout = tree.root.findByProps({ testID: 'customer-bottom-bar-positions' });
    act(() => layout.props.onLayout({ nativeEvent: { layout: { width: 390 } } }));

    expect(mockWithTiming).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ duration: 0 }));
  });

  it('dismisses the sheet without navigation when Close is pressed', () => {
    const tree = renderAuthenticatedBar();
    openBookingSheet(tree);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Đóng lựa chọn đặt lịch' }).props.onPress());

    expect(tree.root.findAllByProps({ testID: 'mock-bottom-sheet-modal' })).toHaveLength(0);
    expect(mockRootNavigate).not.toHaveBeenCalled();
    expect(mockTabNavigate).not.toHaveBeenCalled();
  });

  it('dismisses the open sheet when Android hardware Back is pressed', () => {
    const removeListener = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(
      (_eventName, _listener) => ({ remove: removeListener }),
    );
    const tree = renderAuthenticatedBar();
    openBookingSheet(tree);
    const handler = addListener.mock.calls[0]?.[1] as unknown as (() => boolean) | undefined;
    let handled = false;

    expect(handler).toBeDefined();
    act(() => {
      handled = handler?.() ?? false;
    });
    expect(handled).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'mock-bottom-sheet-modal' })).toHaveLength(0);
    expect(mockRootNavigate).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalled();
    addListener.mockRestore();
  });
});
