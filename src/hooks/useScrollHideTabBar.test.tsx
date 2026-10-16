import React from 'react';
import { act, create } from 'react-test-renderer';
import { useUIStore } from '../store/ui.store';
import { useScrollHideTabBar } from './useScrollHideTabBar';

let cleanup: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => {
    // run once like a focus, keep the cleanup for the blur
    const React = jest.requireActual('react');
    React.useEffect(() => { cleanup = effect() as () => void; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  },
}));

const holder: { onScroll?: ReturnType<typeof useScrollHideTabBar> } = {};
function Probe() { const h = useScrollHideTabBar(); React.useEffect(() => { holder.onScroll = h; }); return null; }
const scroll = (y: number) => act(() => holder.onScroll!({ nativeEvent: { contentOffset: { y } } } as never));

it('shows the tab bar again when the screen that hid it loses focus', () => {
  useUIStore.setState({ isTabBarVisible: true });
  act(() => { create(<Probe />); });
  scroll(200);
  expect(useUIStore.getState().isTabBarVisible).toBe(false);
  act(() => cleanup!());
  expect(useUIStore.getState().isTabBarVisible).toBe(true);
});
