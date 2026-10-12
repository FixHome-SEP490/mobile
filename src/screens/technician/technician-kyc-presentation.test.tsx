// T-RUI6-KYC-01A: render the real screen with offline API/device boundaries.
// Selection is exercised only through mocked picker results. Never press Submit.
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import { technicianVerificationApi, type MyVerification } from '../../api/technician-verification.api';
import { lightTheme } from '../../constants/theme';
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

const getVerification = jest.mocked(technicianVerificationApi.getMyVerification);
const labels = ['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh chân dung'];
const fixture = (status: MyVerification['status'], rejectionReason: string | null = null): MyVerification => ({
  id: 'verification-fixture', status, submittedAt: '2026-10-01T00:00:00Z', rejectionReason,
  documents: [
    { documentType: 'citizen_id_front', fileName: 'front.jpg' },
    { documentType: 'citizen_id_back', fileName: 'back.jpg' },
    { documentType: 'face_photo', fileName: 'face.jpg' },
  ],
});

let screen: ReactTestRenderer;
let alertSpy: jest.SpyInstance;
const text = () => screen.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
const buttons = () => screen.root.findAllByType(TouchableOpacity);
const slots = () => buttons().filter((node) => labels.some((label) => node.props.accessibilityLabel?.startsWith(label)));
const submit = () => buttons().find((node) => node.props.accessibilityLabel === 'Nộp hồ sơ xác minh')!;
async function render() {
  await act(async () => { screen = create(<TechnicianKycScreen />); });
}
async function select(index: number) {
  await act(async () => { slots()[index].props.onPress(); });
  if (index !== 2) {
    const actions = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => { await actions.find((action) => action.text === 'Thư viện ảnh')!.onPress!(); });
  }
}

beforeEach(() => {
  jest.resetAllMocks();
  getVerification.mockResolvedValue(null);
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
  expect(technicianVerificationApi.requestUploadUrl).not.toHaveBeenCalled();
  expect(technicianVerificationApi.uploadToSignedUrl).not.toHaveBeenCalled();
  expect(technicianVerificationApi.submit).not.toHaveBeenCalled();
});

test('only a successful null GET shows unsubmitted status, three explicit empty slots and disabled CTA', async () => {
  await render();
  expect(text()).toContain('Chưa nộp hồ sơ');
  expect(slots()).toHaveLength(3);
  for (const label of labels) expect(text()).toContain(label);
  expect(text()).toContain('JPEG, PNG hoặc WebP');
  expect(text()).toContain('10 MB');
  expect(text()).toContain('Chọn đủ 3 ảnh để nộp hồ sơ.');
  expect(submit().props.disabled).toBe(true);
  expect(submit().props.accessibilityState.disabled).toBe(true);
  expect(submit().props.accessibilityHint).toContain('Chọn đủ 3 ảnh');
  expect(text()).not.toContain('Đã chọn ảnh');
});

test('an unresolved GET shows loading and cannot imply an unsubmitted or submitted profile', async () => {
  getVerification.mockReturnValue(new Promise(() => undefined));
  await render();
  expect(text()).toContain('Đang tải…');
  expect(text()).not.toContain('Chưa nộp hồ sơ');
  expect(text()).not.toContain('đã được nộp');
  expect(slots()).toHaveLength(0);
});

test.each([
  ['PENDING', 'Đang chờ duyệt'], ['VERIFIED', 'Đã xác minh danh tính'],
] as const)('%s shows overall server status without editable slots or per-document approvals', async (status, title) => {
  getVerification.mockResolvedValue(fixture(status));
  await render();
  expect(text()).toContain(title);
  expect(slots()).toHaveLength(0);
  expect(text()).not.toContain('Đã chọn ảnh');
  expect(text()).not.toContain('front.jpg');
  expect(text()).not.toContain('Nộp hồ sơ xác minh');
});

test('rejection shows the one overall reason and fresh empty local slots', async () => {
  getVerification.mockResolvedValue(fixture('REJECTED', 'Ảnh mặt sau bị mờ.'));
  await render();
  expect(text()).toContain('Hồ sơ bị từ chối');
  expect(text().split('Ảnh mặt sau bị mờ.')).toHaveLength(2);
  expect(slots()).toHaveLength(3);
  expect(text()).not.toContain('Đã chọn ảnh');
  expect(submit().props.disabled).toBe(true);
});

test('rejection without a reason does not invent a document defect', async () => {
  getVerification.mockResolvedValue(fixture('REJECTED'));
  await render();
  expect(text()).toContain('chưa cung cấp lý do');
  expect(text()).not.toContain('Ảnh không hợp lệ');
});

test.each(['PENDING', 'VERIFIED', 'REJECTED', null] as const)('failed GET retries through loading into %s without showing an empty form early', async (status) => {
  let resolve!: (value: MyVerification | null) => void;
  getVerification.mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await render();
  expect(text()).toContain('Không thể tải trạng thái xác minh');
  expect(text()).not.toContain('Chưa nộp hồ sơ');
  expect(slots()).toHaveLength(0);
  const retry = buttons().find((node) => node.props.accessibilityLabel === 'Thử lại trạng thái xác minh')!;
  await act(async () => { retry.props.onPress(); });
  expect(text()).toContain('Đang tải…');
  expect(slots()).toHaveLength(0);
  await act(async () => { resolve(status ? fixture(status) : null); });
  expect(text()).not.toContain('Không thể tải trạng thái xác minh');
  expect(slots()).toHaveLength(status === null || status === 'REJECTED' ? 3 : 0);
});

test('local selection unlocks CTA only after all three picker results and never claims server submission', async () => {
  await render();
  for (let index = 0; index < 3; index++) {
    await select(index);
    expect(text()).toContain('Đã chọn ảnh trên máy');
    expect(slots()[index].props.accessibilityHint).toContain('chưa nộp');
    expect(StyleSheet.flatten(slots()[index].props.style).borderColor).not.toBe(lightTheme.tone.success.fg);
    expect(submit().props.disabled).toBe(index < 2);
    expect(text()).toContain('Chưa nộp hồ sơ');
    expect(text()).not.toContain('đã được nộp');
  }
  const reset = buttons().find((node) => node.props.accessibilityLabel === 'Chọn lại cả 3 ảnh')!;
  await act(async () => { reset.props.onPress(); });
  expect(text()).not.toContain('Đã chọn ảnh');
  expect(submit().props.disabled).toBe(true);
});

test('cancelling the mocked picker cannot count as selecting an image', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
  await render();
  await select(0);
  expect(text()).not.toContain('Đã chọn ảnh');
  expect(submit().props.disabled).toBe(true);
});

test('controls keep minimum targets and text can grow without a cramped horizontal CTA pair', async () => {
  await render();
  await select(0);
  for (const button of buttons()) {
    const style = StyleSheet.flatten(button.props.style);
    expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
    expect(button.props.accessibilityLabel).toBeTruthy();
  }
  for (const node of screen.root.findAllByType(Text)) {
    const style = StyleSheet.flatten(node.props.style);
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
    expect(node.props.numberOfLines).toBeUndefined();
    expect(node.props.allowFontScaling).not.toBe(false);
  }
  expect(StyleSheet.flatten(submit().parent!.props.style).flexDirection).not.toBe('row');
});

describe('T13A Codex-inspired REAL three-image KYC static presentation', () => {
  test('preserves Xác minh danh tính as a visible eyebrow and adds Codex hero heading', async () => {
    await render();
    const allText = screen.root.findAllByType(Text);
    expect(allText.some(x => x.props.children === 'Xác minh danh tính' && StyleSheet.flatten(x.props.style)?.fontSize === 12)).toBe(true);
    expect(allText.some(x => x.props.children === 'Hồ sơ rõ, việc vững' && x.props.accessibilityRole === 'header')).toBe(true);
    expect(buttons().find(x => x.props.accessibilityLabel === 'Quay lại')).toBeDefined();
  });

  test('keeps the same three real front/back/face touchables as theme-backed rounded cards', async () => {
    await render();
    expect(slots()).toHaveLength(3);
    expect(slots().map(s => s.props.accessibilityLabel)).toEqual([
      'CCCD mặt trước, chưa chọn ảnh', 'CCCD mặt sau, chưa chọn ảnh', 'Ảnh chân dung, chưa chọn ảnh',
    ]);
    for (const s of slots()) {
      const style = StyleSheet.flatten(s.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(88);
      expect(style.borderRadius).toBeGreaterThanOrEqual(14);
      expect(style.backgroundColor).toBe(lightTheme.surface);
      expect(style.borderWidth).toBeGreaterThanOrEqual(1);
    }
  });

  test('never invents demo five-step identity fields or sample approval controls', async () => {
    await render();
    expect(text()).not.toMatch(/Định danh DEMO|Mã CCCD mẫu|Gửi hồ sơ mẫu|Bước tiếp|Nút duyệt giả|Quận 3 mẫu/);
    expect(slots()).toHaveLength(3);
    expect(submit().props.disabled).toBe(true);
  });

  test('uses only source-backed pending and rejected statuses with no phantom media controls', async () => {
    getVerification.mockResolvedValueOnce(fixture('PENDING'));
    await render();
    expect(text()).toContain('Đang chờ duyệt');
    expect(text()).not.toContain('Đã xác minh danh tính');
    expect(slots()).toHaveLength(0);
    expect(buttons().some(x => x.props.accessibilityLabel === 'Nộp hồ sơ xác minh')).toBe(false);
  });

  test('local image selection remains distinct from authenticated upload and submit', async () => {
    await render();
    await select(0);
    expect(slots()).toHaveLength(3);
    expect(text()).toContain('Đã chọn ảnh trên máy');
    expect(text()).toContain('Ảnh đã chọn chưa được nộp');
    expect(submit().props.disabled).toBe(true);
    expect(technicianVerificationApi.requestUploadUrl).not.toHaveBeenCalled();
    expect(technicianVerificationApi.submit).not.toHaveBeenCalled();
  });
});
