import { captureCameraPhoto, confirmCameraPermission } from './camera-capture';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const requestPermission = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

it('permission denial never opens the camera', async () => {
  requestPermission.mockResolvedValueOnce({ granted: false });
  const result = await captureCameraPhoto();
  expect(result).toMatchObject({ ok: false, reason: 'permission' });
  expect(launchCamera).not.toHaveBeenCalled();
});

it('cancelled capture reports cancellation without an asset', async () => {
  requestPermission.mockResolvedValueOnce({ granted: true });
  launchCamera.mockResolvedValueOnce({ canceled: true });
  const result = await captureCameraPhoto();
  expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
});

it('maps a real camera asset with actual size and type, camera source only', async () => {
  requestPermission.mockResolvedValueOnce({ granted: true });
  launchCamera.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', fileSize: 412345 }],
  });
  const result = await captureCameraPhoto();
  expect(result).toEqual({
    ok: true,
    asset: { source: 'camera', uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg', sizeBytes: 412345 },
  });
  expect(launchCamera).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.8 });
});

it.each([
  ['missing size', { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', fileSize: undefined }],
  ['zero size', { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', fileSize: 0 }],
  ['oversize', { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', fileSize: 11 * 1024 * 1024 }],
  ['unsupported type', { uri: 'file:///cache/photo.heic', mimeType: 'image/heic', fileSize: 100 }],
  ['explicit unsupported MIME with jpg uri', { uri: 'file:///cache/photo.jpg', mimeType: 'image/gif', fileSize: 100 }],
])('rejects %s without a fake fallback', async (_label, picked) => {
  requestPermission.mockResolvedValueOnce({ granted: true });
  launchCamera.mockResolvedValueOnce({ canceled: false, assets: [picked] });
  const result = await captureCameraPhoto();
  expect(result).toMatchObject({ ok: false, reason: 'invalid' });
});

it('re-checks camera permission before upload and fails closed on error', async () => {
  requestPermission.mockResolvedValueOnce({ granted: true });
  expect(await confirmCameraPermission()).toBe(true);
  requestPermission.mockRejectedValueOnce(new Error('os'));
  expect(await confirmCameraPermission()).toBe(false);
});
