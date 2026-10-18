import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState, Image, Text } from 'react-native';
import CustomerKycScreen from './CustomerKycScreen';
import { customerVerificationApi } from '../../api/customer-verification.api';

const mockAuthState = { user: { id: 'customer-1', role: 'customer' }, sessionGeneration: 3 };
let mockStatus: 'none' | 'pending' | 'rejected' | 'verified' = 'none';
let mockImages: { uri: string; mimeType: string; fileSize: number }[] = [];
let mockAppStateListener: ((state: string) => void) | null = null;
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactActual.useEffect(effect, [effect]),
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});
jest.mock('../../store/auth.store', () => ({ useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState) }));
jest.mock('../../components/BackButton', () => () => null);
jest.mock('lucide-react-native', () => ({
  AlertTriangle: () => null, Camera: () => null, CheckCircle2: () => null,
  Clock3: () => null, ImagePlus: () => null, ShieldCheck: () => null,
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [mockImages.shift()] })),
}));
jest.mock('../../api/customer-verification.api', () => ({
  customerVerificationApi: {
    getMine: jest.fn(async () => ({ status: mockStatus, rejectionReason: mockStatus === 'rejected' ? 'Ảnh chưa rõ.' : null, profile: { fullName: '', dateOfBirth: null, gender: null, citizenIdNumber: null, address: null } })),
    uploadDocument: jest.fn(async (input: { documentType: string; mimeType: string; file: { fileSize: number; fileName: string } }) => ({
      documentType: input.documentType,
      storageObjectPath: `kyc/customer-1/${input.documentType}.jpg`,
      fileName: input.file.fileName,
      fileSize: input.file.fileSize,
      mimeType: input.mimeType,
    })),
    submit: jest.fn(async () => ({ status: 'pending', rejectionReason: null, profile: { fullName: '', dateOfBirth: null, gender: null, citizenIdNumber: null, address: null } })),
  },
}));
jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
  mockAppStateListener = listener as (state: string) => void;
  return { remove: jest.fn() } as never;
});

const api = customerVerificationApi as jest.Mocked<typeof customerVerificationApi>;

describe('CustomerKycScreen', () => {
  beforeEach(() => {
    mockStatus = 'none';
    mockImages = [];
    mockAppStateListener = null;
    mockNavigate.mockClear();
    jest.clearAllMocks();
  });

  it.each([
    ['pending', 'Đang chờ duyệt'],
    ['verified', 'Đã xác minh'],
    ['rejected', 'Cần gửi lại hồ sơ'],
  ] as const)('shows the Backend %s state clearly', async (status, label) => {
    mockStatus = status;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerKycScreen />); });
    const text = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain(label);
    expect(renderer.root.findByProps({ testID: `customer-kyc-status-${status}` })).toBeTruthy();
    if (status === 'pending') expect(renderer.root.findAllByProps({ testID: 'customer-kyc-submit' })).toHaveLength(0);
    if (status === 'rejected') expect(renderer.root.findByProps({ testID: 'customer-kyc-submit' })).toBeTruthy();
    if (status === 'verified') {
      const next = renderer.root.findByProps({ testID: 'customer-kyc-continue-withdrawal' });
      expect(next.props.accessibilityRole).toBe('button');
      await act(async () => next.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerWithdraw');
      expect(renderer.root.findAllByProps({ testID: 'customer-kyc-submit' })).toHaveLength(0);
    }
    await act(async () => renderer.unmount());
  });

  it('shows exactly two separate photo choices with compact empty previews', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerKycScreen />); });
    for (const side of ['front', 'back']) {
      const card = renderer.root.findByProps({ testID: `customer-kyc-photo-card-${side}` });
      const placeholder = card.findByProps({ testID: `customer-kyc-photo-placeholder-${side}` });
      expect(placeholder.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('Chưa chọn ảnh');
      const style = Array.isArray(placeholder.props.style) ? Object.assign({}, ...placeholder.props.style) : placeholder.props.style;
      expect(style.height).toBeLessThanOrEqual(100);
      expect(card.findByProps({ testID: `customer-kyc-pick-${side}` }).props.accessibilityRole).toBe('button');
      expect(card.findByProps({ testID: `customer-kyc-camera-${side}` }).props.accessibilityRole).toBe('button');
    }
    const photoCardIds = new Set(renderer.root.findAll(node => typeof node.props.testID === 'string' && /^customer-kyc-photo-card-(front|back)$/.test(node.props.testID)).map(node => node.props.testID));
    expect(photoCardIds).toEqual(new Set(['customer-kyc-photo-card-front', 'customer-kyc-photo-card-back']));
    expect(renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).not.toMatch(/selfie|chân dung/i);
    await act(async () => renderer.unmount());
  });

  it('uploads both private sides then submits once, preserving the exact two-document payload', async () => {
    mockImages = [
      { uri: 'file:///local/front.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 },
      { uri: 'file:///local/back.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 },
    ];
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerKycScreen />); });
    const change = async (testID: string, value: string) => {
      await act(async () => renderer.root.findByProps({ testID }).props.onChangeText(value));
    };
    await change('customer-kyc-fullName', 'Nguyễn Văn An');
    await change('customer-kyc-dateOfBirth', '1995-06-15');
    await change('customer-kyc-citizenIdNumber', '079123456789');
    await change('customer-kyc-address', '12 Nguyễn Trãi, Quận 1');
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-gender-MALE' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-pick-front' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-pick-back' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-submit' }).props.onPress());

    expect(api.uploadDocument).toHaveBeenCalledTimes(2);
    expect(api.uploadDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: 'customer-1', documentType: 'citizen_id_front' }));
    expect(api.uploadDocument).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: 'customer-1', documentType: 'citizen_id_back' }));
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Nguyễn Văn An', dateOfBirth: '1995-06-15', gender: 'MALE',
      citizenIdNumber: '079123456789', address: '12 Nguyễn Trãi, Quận 1',
      documents: expect.arrayContaining([
        expect.objectContaining({ documentType: 'citizen_id_front' }),
        expect.objectContaining({ documentType: 'citizen_id_back' }),
      ]),
    }), 'customer-1');
    await act(async () => renderer.unmount());
  });

  it('locks resubmission when POST acknowledgement is unknown and server still reports no verification', async () => {
    mockImages = [
      { uri: 'file:///local/front.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 },
      { uri: 'file:///local/back.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 },
    ];
    api.submit.mockRejectedValueOnce(new Error('network unavailable'));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerKycScreen />); });
    const change = async (testID: string, value: string) => {
      await act(async () => renderer.root.findByProps({ testID }).props.onChangeText(value));
    };
    await change('customer-kyc-fullName', 'Nguyễn Văn An');
    await change('customer-kyc-dateOfBirth', '1995-06-15');
    await change('customer-kyc-citizenIdNumber', '079123456789');
    await change('customer-kyc-address', '12 Nguyễn Trãi, Quận 1');
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-gender-MALE' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-pick-front' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-pick-back' }).props.onPress());
    const submit = renderer.root.findByProps({ testID: 'customer-kyc-submit' }).props.onPress;
    await act(async () => { submit(); submit(); });
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'customer-kyc-submit' }).props.disabled).toBe(true);
    const text = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain('Chưa xác định được kết quả gửi');
    await act(async () => renderer.unmount());
  });

  it('clears personal fields and selected image URIs when the app backgrounds', async () => {
    mockImages = [{ uri: 'file:///local/private-front.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 }];
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerKycScreen />); });
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-fullName' }).props.onChangeText('Nguyễn Văn An'));
    expect(renderer.root.findByProps({ testID: 'customer-kyc-fullName' }).props.value).toBe('Nguyễn Văn An');
    await act(async () => renderer.root.findByProps({ testID: 'customer-kyc-pick-front' }).props.onPress());
    expect(renderer.root.findAllByType(Image).some(node => node.props.source?.uri === 'file:///local/private-front.jpg')).toBe(true);
    await act(async () => mockAppStateListener?.('background'));
    expect(renderer.root.findByProps({ testID: 'customer-kyc-fullName' }).props.value).toBe('');
    expect(renderer.root.findAllByType(Image).some(node => node.props.source?.uri === 'file:///local/private-front.jpg')).toBe(false);
    await act(async () => renderer.unmount());
  });
});
