// Phản hồi khi nộp hồ sơ xác minh: tải ảnh lên, rồi backend so khớp khuôn mặt (vài giây) trước khi nhận hồ sơ.
import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import { technicianVerificationApi } from '../../api/technician-verification.api';
import TechnicianKycScreen from './TechnicianKycScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  CameraType: { front: 'front', back: 'back' },
}));
jest.mock('../../api/technician-verification.api', () => ({
  technicianVerificationApi: {
    getMyVerification: jest.fn(), requestUploadUrl: jest.fn(),
    uploadToSignedUrl: jest.fn(), submit: jest.fn(),
  },
}));

const api = jest.mocked(technicianVerificationApi);
const labels = ['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh chân dung'];
let screen: ReactTestRenderer;
let alertSpy: jest.SpyInstance;
const text = () => screen.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
const buttons = () => screen.root.findAllByType(TouchableOpacity);
const slots = () => buttons().filter((node) => labels.some((label) => node.props.accessibilityLabel?.startsWith(label)));
const submit = () => buttons().find((node) => node.props.accessibilityLabel === 'Nộp hồ sơ xác minh')!;
async function select(index: number) {
  await act(async () => { slots()[index].props.onPress(); });
  if (index !== 2) {
    const actions = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => { await actions.find((action) => action.text === 'Thư viện ảnh')!.onPress!(); });
  }
}

beforeEach(() => {
  jest.resetAllMocks();
  api.getMyVerification.mockResolvedValue(null);
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.MediaLibraryPermissionResponse);
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
  const picked: ImagePicker.ImagePickerResult = {
    canceled: false, assets: [{ uri: 'file:///mock-kyc.jpg', width: 640, height: 480, mimeType: 'image/jpeg', fileSize: 1024 }],
  };
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked);
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(picked);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
  alertSpy.mockRestore();
});

test('says what is happening while uploading and while the faces are compared, and shows the backend reason on a mismatch', async () => {
  api.requestUploadUrl.mockResolvedValue({ storageObjectPath: 'kyc/user/photo.jpg', uploadUrl: 'https://upload.example/signed' } as never);
  let finishUploads!: () => void;
  api.uploadToSignedUrl.mockReturnValue(new Promise<void>((done) => { finishUploads = done; }));
  let failCheck!: (error: unknown) => void;
  api.submit.mockReturnValue(new Promise((_, reject) => { failCheck = reject; }));

  await act(async () => { screen = create(<TechnicianKycScreen />); });
  for (const index of [0, 1, 2]) await select(index);
  await act(async () => { void submit().props.onPress(); }); // không await: nó chờ tới khi uploads xong

  expect(text()).toContain('Đang tải ảnh lên');
  expect(text()).not.toContain('độ tương thích khuôn mặt');
  expect(submit().props.disabled).toBe(true);

  await act(async () => { finishUploads(); });
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(text()).toContain('Đang kiểm tra khuôn mặt');
  expect(text()).toContain('Đang kiểm tra độ tương thích khuôn mặt');

  const reason = 'Khuôn mặt ở ảnh chân dung không khớp với ảnh trên CCCD. Vui lòng chụp lại.';
  await act(async () => { failCheck({ response: { data: { error: { message: reason } } } }); });
  expect(alertSpy).toHaveBeenLastCalledWith('Không thể nộp hồ sơ', reason);
  expect(text()).not.toContain('Đang kiểm tra');
  expect(text()).toContain('Nộp hồ sơ xác minh');
  expect(submit().props.disabled).toBe(false); // ảnh đã chọn được giữ để chụp lại
});
