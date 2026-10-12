import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { GlassTabBar } from './GlassTabBar';

jest.mock('react-native-reanimated', () => {
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const interpolate = (value: number, input: number[], output: number[]) => {
    const progress = Math.max(0, Math.min(1, (value - input[0]) / (input[1] - input[0])));
    return output[0] + (output[1] - output[0]) * progress;
  };

  return {
    __esModule: true,
    default: { View: ReactNative.View, Text: ReactNative.Text },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (getStyle: () => object) => getStyle(),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
    interpolate,
    Extrapolation: { CLAMP: 'clamp' },
    runOnJS: (callback: (...args: unknown[]) => void) => callback,
  };
});

jest.mock('expo-blur', () => ({ BlurView: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome5: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-gesture-handler', () => {
  const createGesture = () => {
    const gesture: Record<string, () => typeof gesture> = {};
    for (const method of ['onEnd', 'onBegin', 'onUpdate', 'onFinalize']) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Tap: createGesture, Pan: createGesture, Simultaneous: () => ({}) },
  };
});
jest.mock('../../store/ui.store', () => ({
  useUIStore: (selector: (state: { isTabBarVisible: boolean }) => unknown) => selector({ isTabBarVisible: true }),
}));
jest.mock('../../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));

const tabTitles = ['Trang chủ', 'Hoạt động', 'Thông báo', 'Tài khoản'];
const routeNames = ['Home', 'Bookings', 'Notifications', 'Profile'];
const technicianTitles = ['Trang chủ', 'Lời mời', 'Công việc', 'Thông báo', 'Hồ sơ'];
const technicianRouteNames = ['Home', 'Invitations', 'Jobs', 'Notifications', 'Profile'];

function createProps(names: string[], titles: string[]): BottomTabBarProps {
  const routes = names.map((name, index) => ({
    key: `route-${index}`,
    name,
    params: undefined,
  }));
  const descriptors = Object.fromEntries(routes.map((route, index) => [route.key, {
    options: {
      title: titles[index],
      tabBarIcon: () => React.createElement(View),
    },
    navigation: {},
    render: () => null,
  }]));

  return {
    state: {
      key: 'customer-tabs',
      index: 1,
      routeNames,
      routes,
      history: [],
      type: 'tab',
      stale: false,
    },
    descriptors,
    navigation: {
      emit: () => ({ defaultPrevented: false }),
      navigate: jest.fn(),
    },
  } as unknown as BottomTabBarProps;
}

function renderTabBar({
  showTabLabels,
  showAssistant = false,
  names = routeNames,
  titles = tabTitles,
}: {
  showTabLabels?: boolean;
  showAssistant?: boolean;
  names?: string[];
  titles?: string[];
} = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <GlassTabBar
        {...createProps(names, titles)}
        showAssistant={showAssistant}
        showTabLabels={showTabLabels}
      />,
    );
  });
  return tree;
}

describe('GlassTabBar visible labels', () => {
  it('keeps all five Technician labels hidden by default', () => {
    const tree = renderTabBar({ names: technicianRouteNames, titles: technicianTitles });
    const renderedText = tree.root.findAllByType(Text).map((node) => node.props.children);
    const tabs = tree.root.findAll((node) =>
      node.props.accessibilityRole === 'tab' && typeof node.props.accessibilityLabel === 'string',
    );
    const accessibleLabels = [...new Set(tabs.map((tab) => tab.props.accessibilityLabel))];

    expect(technicianTitles.some((title) => renderedText.includes(title))).toBe(false);
    expect(accessibleLabels).toEqual(technicianTitles);
  });

  it('renders the four Customer labels beside a separate assistant action when enabled', () => {
    const tree = renderTabBar({ showTabLabels: true, showAssistant: true });
    const renderedText = tree.root.findAllByType(Text).map((node) => node.props.children);

    for (const title of tabTitles) {
      expect(renderedText).toContain(title);
    }
    expect(tree.root.findAll((node) =>
      node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Mở trợ lý AI',
    ).length).toBeGreaterThan(0);
  });

  it('keeps visible labels to one line and lets them shrink into narrow tab slots', () => {
    const tree = renderTabBar({ showTabLabels: true, showAssistant: true });
    const labels = tree.root.findAllByType(Text).filter((node) => tabTitles.includes(node.props.children));

    expect(labels.length).toBeGreaterThanOrEqual(4);
    for (const label of labels) {
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
      expect(label.props.accessible).toBe(false);
      expect(StyleSheet.flatten(label.props.style)).toMatchObject({ left: 0, right: 0 });
    }
  });

  it('preserves the selected tab accessibility state and activate action', () => {
    const tree = renderTabBar({ showTabLabels: true, showAssistant: true });
    const tabs = tree.root.findAll((node) =>
      node.props.accessibilityRole === 'tab' && typeof node.props.accessibilityLabel === 'string',
    );
    const tabsByLabel = new Map(tabs.map((tab) => [tab.props.accessibilityLabel, tab]));

    expect([...tabsByLabel.keys()]).toEqual(tabTitles);
    expect([...tabsByLabel.values()].map((tab) => tab.props.accessibilityState)).toEqual([
      { selected: false }, { selected: true }, { selected: false }, { selected: false },
    ]);
    expect(tabsByLabel.get('Hoạt động')?.props.accessibilityActions).toEqual([{ name: 'activate' }]);
  });
});
