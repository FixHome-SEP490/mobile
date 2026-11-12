import React, { createRef } from 'react';
import { BackHandler } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import BackClosableBottomSheetModal from './BackClosableBottomSheetModal';
import { appSources } from '../test-utils/source-files';

const mockDismiss = jest.fn();
let mockProps: Record<string, unknown> = {};
jest.mock('@gorhom/bottom-sheet', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BottomSheetModal: R.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockProps = props;
      R.useImperativeHandle(ref as React.Ref<unknown>, () => ({ present: jest.fn(), dismiss: mockDismiss }));
      return R.createElement(View, null, props.children as React.ReactNode);
    }),
  };
});

type BackListener = () => boolean;
let listeners: BackListener[] = [];
beforeEach(() => {
  listeners = [];
  mockDismiss.mockReset();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler as BackListener);
    return { remove: () => { listeners = listeners.filter(item => item !== handler); } };
  });
});
afterEach(() => jest.restoreAllMocks());
const pressBack = () => [...listeners].reverse().some(handler => handler());

describe('BackClosableBottomSheetModal (M-18)', () => {
  it('Android Back closes an open sheet and is left to the screen once the sheet is closed', async () => {
    const ref = createRef<BottomSheetModal | null>();
    const onChange = jest.fn(); const onDismiss = jest.fn();
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<BackClosableBottomSheetModal ref={ref} snapPoints={['50%']} onChange={onChange} onDismiss={onDismiss}><></></BackClosableBottomSheetModal>); });
    expect(ref.current).toBeTruthy();
    expect(pressBack()).toBe(false);

    await act(async () => { (mockProps.onChange as (i: number, p: number, t: number) => void)(0, 100, 0); });
    expect(onChange).toHaveBeenCalledWith(0, 100, 0);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);

    await act(async () => { (mockProps.onDismiss as () => void)(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(pressBack()).toBe(false);
    await act(async () => tree.unmount());
  });

  it('every bottom sheet in the app goes through it (the tab bar sheet handles Back itself)', () => {
    const offenders = appSources()
      .filter(([file]) => file !== 'components/BackClosableBottomSheetModal.tsx' && file !== 'components/navigation/CustomerAnimatedBottomBar.tsx')
      .filter(([, text]) => /(^|[\s({}])<BottomSheetModal\b/m.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
