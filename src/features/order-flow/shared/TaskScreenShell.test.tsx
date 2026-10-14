import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { TaskScreenShell } from './TaskScreenShell';

jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }) };
});
let mockKeyboardInset = 0;
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => mockKeyboardInset }));

it('keeps the compact action footer outside the scroll region with a wrapping, accessible action', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TaskScreenShell title="Chi tiết đơn" stage={3} primary={{ label: 'Đang chờ dữ liệu xác nhận, thao tác hiện chỉ xem', disabled: true }}>
      <Text>Thông tin dài có thể cuộn độc lập khỏi chân trang.</Text>
    </TaskScreenShell>);
  });
  const tree = renderer.toJSON() as any;
  expect(tree && !Array.isArray(tree) && tree.type).toBe('View');
  if (tree && !Array.isArray(tree)) {
    const children: any[] = tree.children ?? [];
    const scrollIndex = children.findIndex(child => child && typeof child === 'object' && child.type === 'RCTScrollView');
    const footerIndex = children.findIndex(child => child && typeof child === 'object' && child.props?.testID === 'order-flow-fixed-footer');
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(footerIndex).toBeGreaterThan(scrollIndex);
    expect(children[footerIndex]?.props?.style).toEqual(expect.arrayContaining([expect.objectContaining({ paddingBottom: 20 })]));
  }
  await act(async () => renderer.unmount());
});

it('moves the compact footer above the keyboard using one separate spacer', async () => {
  mockKeyboardInset = 300;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TaskScreenShell title="Ghi chú" primary={{ label: 'Lưu' }}><TextInputFixture /></TaskScreenShell>);
  });
  const tree = renderer.toJSON() as any;
  const children: any[] = tree?.children ?? [];
  const spacer = children.find(child => child?.props?.testID === 'order-flow-keyboard-spacer');
  const footer = children.find(child => child?.props?.testID === 'order-flow-fixed-footer');
  expect(spacer?.props?.style).toEqual({ height: 300 });
  expect(footer?.props?.style).toEqual(expect.arrayContaining([
    expect.objectContaining({ paddingBottom: 12, transform: [{ translateY: -300 }] }),
  ]));
  await act(async () => renderer.unmount());
  mockKeyboardInset = 0;
});

function TextInputFixture() { return <Text>Long editable content</Text>; }
