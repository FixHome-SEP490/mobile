import React from 'react';
import { act, create } from 'react-test-renderer';
import FaceLivenessCamera, { FACE_STEP_TEXT } from './FaceLivenessCamera';

const mockTake = jest.fn();
let mockGranted = true;
jest.mock('expo-camera', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const View = jest.requireActual<typeof import('react-native')>('react-native').View;
  return {
    CameraView: R.forwardRef((props: object, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ takePictureAsync: mockTake }));
      return R.createElement(View, props);
    }),
    useCameraPermissions: () => [{ granted: mockGranted, canAskAgain: true }, jest.fn()],
  };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children }));

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
