import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import FaceLivenessCamera, { FACE_STEP_TEXT } from './FaceLivenessCamera';

const mockTake = jest.fn();
let mockGranted = true;
let mockCanAskAgain = true;
const mockRequest = jest.fn();
const mockGetPermission = jest.fn();
jest.mock('expo-camera', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const View = jest.requireActual<typeof import('react-native')>('react-native').View;
  return {
    CameraView: R.forwardRef((props: object, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ takePictureAsync: mockTake }));
      return R.createElement(View, props);
    }),
    useCameraPermissions: () => [{ granted: mockGranted, canAskAgain: mockCanAskAgain }, mockRequest, mockGetPermission],
  };
});
jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 48, bottom: 24, left: 0, right: 0 }),
  };
});

const text = (tree: ReturnType<typeof create>) => JSON.stringify(tree.toJSON()).replace(/","/g, '');
async function render(challenge: 'turn_left' | 'turn_right' | 'look_up' | 'look_down', onDone = jest.fn(), onCancel = jest.fn()) {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<FaceLivenessCamera challenge={challenge} onDone={onDone} onCancel={onCancel} />); });
  return { tree, onDone, onCancel };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTake.mockReset();
  mockGranted = true;
  mockCanAskAgain = true;
  globalThis.fetch = jest.fn().mockResolvedValue({ blob: async () => ({ size: 1234 }) }) as unknown as typeof fetch;
});

it('shows the instruction on the camera: plain photo first, then the challenge, in one camera session', async () => {
  mockTake.mockResolvedValueOnce({ uri: 'file://1.jpg' }).mockResolvedValueOnce({ uri: 'file://2.jpg' });
  const { tree, onDone } = await render('turn_left');
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.plain);

  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(onDone).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.turn_left);
  expect(text(tree)).toContain('Bước 2/2');

  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(onDone).toHaveBeenCalledTimes(1);
  const { plain, second: moved } = onDone.mock.calls[0][0];
  expect(plain).toMatchObject({ source: 'camera', uri: 'file://1.jpg', type: 'image/jpeg', sizeBytes: 1234 });
  expect(moved).toMatchObject({ source: 'camera', uri: 'file://2.jpg' });
});

it('asks for the direction of a turn_right challenge', async () => {
  mockTake.mockResolvedValueOnce({ uri: 'file://1.jpg' });
  const { tree } = await render('turn_right');
  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.turn_right);
});

it('a failed shot keeps the current step and says so, no photo is handed over', async () => {
  mockTake.mockRejectedValueOnce(new Error('camera busy'));
  const { tree, onDone } = await render('turn_left');
  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(onDone).not.toHaveBeenCalled();
  expect(text(tree)).toContain('Chưa chụp được ảnh');
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.plain);
});

it('tapping the first thumbnail retakes step 1 inside the same session', async () => {
  mockTake.mockResolvedValueOnce({ uri: 'file://1.jpg' }).mockResolvedValueOnce({ uri: 'file://1b.jpg' }).mockResolvedValueOnce({ uri: 'file://2.jpg' });
  const { tree, onDone } = await render('turn_left');
  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.turn_left);
  await act(async () => { tree.root.findByProps({ testID: 'face-live-retake-first' }).props.onPress(); });
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.plain);
  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(onDone.mock.calls[0][0].plain.uri).toBe('file://1b.jpg');
  expect(onDone.mock.calls[0][0].second.uri).toBe('file://2.jpg');
});

it('single-photo modes hand back only that photo', async () => {
  mockTake.mockResolvedValueOnce({ uri: 'file://only.jpg' });
  const onDone = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<FaceLivenessCamera challenge="turn_left" mode="challenge" onDone={onDone} onCancel={jest.fn()} />); });
  expect(tree.root.findByProps({ testID: 'face-live-instruction' }).props.children).toBe(FACE_STEP_TEXT.turn_left);
  await act(async () => { await tree.root.findByProps({ testID: 'face-live-shutter' }).props.onPress(); });
  expect(onDone).toHaveBeenCalledWith({ second: expect.objectContaining({ uri: 'file://only.jpg' }) });
});

it('without camera permission the shutter is disabled and permission can be requested', async () => {
  mockGranted = false;
  const { tree } = await render('turn_left');
  expect(tree.root.findByProps({ testID: 'face-live-shutter' }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ testID: 'face-live-permission' })).toBeTruthy();
});

it('keeps the close button below the status bar using the screen insets, not the modal window ones', async () => {
  const { tree } = await render('turn_left');
  const top = tree.root.findByProps({ testID: 'face-live-top' });
  expect(StyleSheet.flatten(top.props.style)).toMatchObject({ paddingTop: 64 });
  expect(top.findAll(node => node.props.accessibilityLabel === 'Đóng camera').length).toBeGreaterThan(0);
});

it('asks for the camera while Android still asks, and opens the app settings once it no longer does', async () => {
  const { Linking } = jest.requireActual<typeof import('react-native')>('react-native');
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mockGranted = false;
  let { tree } = await render('turn_left');
  await act(async () => { tree.root.findByProps({ testID: 'face-live-permission' }).props.onPress(); });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(openSettings).not.toHaveBeenCalled();
  await act(async () => tree.unmount());

  mockCanAskAgain = false;
  ({ tree } = await render('turn_left'));
  const button = tree.root.findByProps({ testID: 'face-live-permission' });
  expect(button.props.disabled).toBeFalsy();
  expect(text(tree)).toContain('Mở Cài đặt để cấp quyền camera');
  await act(async () => { button.props.onPress(); });
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  openSettings.mockRestore();
});
