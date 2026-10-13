import React from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerMatchingRadar from './CustomerMatchingRadar';

let mockReducedMotion = true;
const mockWithRepeat = jest.fn((...args: unknown[]) => args[0]);
const mockCancelAnimation = jest.fn();

jest.mock('../../hooks/useReduceMotion', () => ({
  useReduceMotion: () => mockReducedMotion,
}));
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({ colors: {
    primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF',
    border: '#E2E8F0', surface: '#FFFFFF',
  } }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    __esModule: true,
    default: { View: ReactModule.forwardRef(
      (props: Record<string, unknown>, ref: React.Ref<unknown>) =>
        ReactModule.createElement(Native.View, { ...props, ref }),
    ) },
    cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args),
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withRepeat: (...args: unknown[]) => mockWithRepeat(...args),
    withTiming: (value: number) => value,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockReducedMotion = true;
});

async function render(active: boolean): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<CustomerMatchingRadar active={active} />);
  });
  return tree;
}

it('has a stable decorative matching visual when Backend is not in MATCHING', async () => {
  mockReducedMotion = false;
  const tree = await render(false);
  expect(tree.root.findAll((node) => node.type === View && node.props.testID === 'matching-state-radar'))
    .toHaveLength(1);
  expect(tree.root.findAll((node) => node.props.testID === 'matching-radar-pulse')).toHaveLength(0);
  expect(mockWithRepeat).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it('animates a subtle pulse only when a parent confirms the server MATCHING state', async () => {
  mockReducedMotion = false;
  const tree = await render(true);
  expect(tree.root.findAll((node) => node.props.testID === 'matching-radar-pulse').length)
    .toBeGreaterThan(0);
  expect(mockWithRepeat).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
  expect(mockCancelAnimation).toHaveBeenCalled();
});

it('honors Reduce Motion and never claims a location, ETA or a match', async () => {
  mockReducedMotion = true;
  const tree = await render(true);
  expect(tree.root.findAll((node) => node.props.testID === 'matching-radar-pulse')).toHaveLength(0);
  expect(mockWithRepeat).not.toHaveBeenCalled();
  expect(tree.toJSON()).not.toContain('ETA');
  await act(async () => tree.unmount());
});
