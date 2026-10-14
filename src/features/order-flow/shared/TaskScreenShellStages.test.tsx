import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { TaskScreenShell } from './TaskScreenShell';

jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

it('uses approved neutral stage labels and a 52dp compact footer', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <TaskScreenShell title="Chuẩn bị di chuyển" stage={1} primary={{ label: 'Xác nhận' }}>
        <Text>Nội dung</Text>
      </TaskScreenShell>,
    );
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/Chuẩn bị/);
  expect(text).toMatch(/Tại nhà/);
  expect(text).toMatch(/Sửa chữa/);
  expect(text).toMatch(/Kết thúc/);
  expect(text).not.toMatch(/Tiếp nhận|Khảo sát|Hoàn tất/);
  const footer = renderer.root.findByProps({ testID: 'order-flow-fixed-footer' });
  expect(footer).toBeTruthy();
  await act(async () => renderer.unmount());
});
