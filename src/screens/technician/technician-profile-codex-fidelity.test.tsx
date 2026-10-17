// T-NATIVE-12A: source-backed Codex technician profile identity presentation.
// No real avatar upload, banking, KYC, schedule or skill mutations.
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianProfileScreen from './TechnicianProfileScreen';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { technicianVerificationApi } from '../../api/technician-verification.api';
import { usersApi } from '../../api/users.api';
import { ordersApi } from '../../api/orders.api';
import * as ImagePicker from 'expo-image-picker';

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockUser = { id: 'tech-real-fixture', fullName: 'Nguyen Van A', phoneNumber: '0901234567', avatarUrl: null };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../store', () => {
  const state = { user: mockUser, logout: mockLogout };
  const useAuthStore = (selector?: (s: typeof state) => unknown) =>
    typeof selector === 'function' ? selector(state) : state;
  return { useAuthStore: Object.assign(useAuthStore, { getState: () => state }) };
});
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: ({ children, ...rest }: { children?: React.ReactNode }) => R.createElement(NativeView, rest, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView, SectionList, TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BottomSheetModal: ({ children }: { children?: React.ReactNode }) => R.createElement(NativeView, null, children),
    BottomSheetBackdrop: () => null,
    BottomSheetSectionList: SectionList,
    BottomSheetScrollView: ({ children }: { children?: React.ReactNode }) => R.createElement(NativeView, null, children),
    BottomSheetTextInput: TextInput,
  };
});
jest.mock('lucide-react-native', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => R.createElement(NativeView);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 1 },
}));
jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      background: '#ffffff', surface: '#ffffff', text: '#1a1714', textSecondary: '#5c554c',
      muted: '#94a3b8', primary: '#2563eb', primaryStrong: '#1d4ed8',
      primarySoft: '#eff6ff', primaryTint: '#bfdbfe', border: '#e2ddd6', divider: '#e2ddd6',
      error: '#b42318',
      tone: {
        success: { bg: '#e7f6f0', fg: '#0e8a5f', text: '#08734f' },
        warning: { bg: '#fef6e0', fg: '#b07d00', text: '#805b00' },
        danger: { bg: '#feeceb', fg: '#d92d20', text: '#b42318' },
        info: { bg: '#eaf1fe', fg: '#175cd3', text: '#175cd3' },
        neutral: { bg: '#efeee7', fg: '#7d7468', text: '#5c554c' },
      },
    },
  }),
}));
jest.mock('../../hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));
jest.mock('../../components/StatusBadge', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ view }: { view: { label: string } }) => R.createElement(NativeText, null, view.label);
});
jest.mock('../../components/CategoryPills', () => () => null);
jest.mock('../../components/AddressMap', () => () => null);
jest.mock('../../api/users.api', () => ({ usersApi: {
  getProfile: jest.fn(), getAddresses: jest.fn(), updateProfile: jest.fn(),
  createAddress: jest.fn(), updateAddress: jest.fn(), deleteAddress: jest.fn(),
} }));
jest.mock('../../api/orders.api', () => ({
  ordersApi: { getTechnicianJobs: jest.fn() }, isHistoricalOrder: () => false,
}));
jest.mock('../../api/technician-profile.api', () => ({ technicianProfileApi: {
  getMyProfile: jest.fn(), getMyServices: jest.fn(), getMyTimeOff: jest.fn(),
  updateMyProfile: jest.fn(), updateMySchedule: jest.fn(), createTimeOff: jest.fn(),
  deleteTimeOff: jest.fn(), setSkillPricing: jest.fn(),
} }));
jest.mock('../../api/technician-verification.api', () => ({ technicianVerificationApi: {
  getMyVerification: jest.fn(), submit: jest.fn(),
} }));
jest.mock('../../api/services.api', () => ({ servicesApi: {
  getServices: jest.fn(), getCategories: jest.fn(),
} }));
jest.mock('../../api/media.api', () => ({ mediaApi: { uploadPublicImage: jest.fn() } }));
jest.mock('../../api/auth.api', () => ({ authApi: { logout: jest.fn() } }));
jest.mock('../../api/geo.api', () => ({ geoApi: {
  autocomplete: jest.fn(), reverse: jest.fn(), getProvinces: jest.fn(),
} }));
jest.mock('../../services/avatar-upload', () => ({
  updateMyAvatar: jest.fn(), avatarErrorMessage: jest.fn(() => 'Lỗi ảnh'),
}));

const profileApi = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const verificationApi = technicianVerificationApi as jest.Mocked<typeof technicianVerificationApi>;
const users = usersApi as jest.Mocked<typeof usersApi>;
const orders = ordersApi as jest.Mocked<typeof ordersApi>;
const imagePicker = ImagePicker.launchImageLibraryAsync as jest.Mock;
const profile = {
  bio: null, yearsExperience: 3, isAvailable: true, averageRating: null,
  ratingCount: 0, reliabilityScore: null, serviceRadiusKm: null, schedules: [],
};
const verification = {
  id: 'verification-fixture', status: 'VERIFIED', submittedAt: '2026-10-01T00:00:00Z',
  rejectionReason: null, documents: [],
};
function visibleText(r: ReactTestRenderer) {
  return r.root.findAllByType(Text).map(x => {
    const c = x.props.children;
    return Array.isArray(c) ? c.filter((s: unknown) => typeof s === 'string' || typeof s === 'number').join('') : String(c ?? '');
  }).join('\n');
}
function styleList(s: unknown): Record<string, unknown>[] {
  const value = Array.isArray(s) ? s : [s];
  return value.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}
function button(r: ReactTestRenderer, label: string) {
  return r.root.findAllByType(TouchableOpacity).filter(x => x.props.accessibilityLabel === label);
}
async function render() {
  let instance!: ReactTestRenderer;
  await act(async () => { instance = create(<TechnicianProfileScreen />); });
  return instance;
}
beforeEach(() => {
  jest.clearAllMocks();
  imagePicker.mockResolvedValue({ canceled: true });
  users.getProfile.mockResolvedValue({ id: mockUser.id, fullName: mockUser.fullName, phoneNumber: mockUser.phoneNumber } as never);
  users.getAddresses.mockResolvedValue([]);
  profileApi.getMyProfile.mockResolvedValue({ ...profile } as never);
  profileApi.getMyServices.mockResolvedValue([]);
  verificationApi.getMyVerification.mockResolvedValue(null);
  orders.getTechnicianJobs.mockResolvedValue([]);
});

describe('T12A authenticated Technician profile Codex identity shell', () => {
  it('shows the common account title while retaining the professional section', async () => {
    const r = await render(); const text = visibleText(r);
    expect(text).toContain('Tài khoản');
    expect(text).toContain('Hồ sơ nghề nghiệp');
    const header = r.root.findAllByType(Text).filter(x => x.props.accessibilityRole === 'header' && x.props.children === 'Tài khoản');
    expect(header.some(x => styleList(x.props.style).some(s => s.fontSize === 24))).toBe(true);
    await act(async () => r.unmount());
  });
  it('places dynamic identity into a centered theme-tinted card', async () => {
    const r = await render();
    expect(r.root.findAllByType(View).some(x => styleList(x.props.style).some(s => s.backgroundColor === '#eff6ff' && s.alignItems === 'center' && s.flexDirection === 'column'))).toBe(true);
    await act(async () => r.unmount());
  });
  it('never copies demo names, statuses or rating', async () => {
    const r = await render(); const text = visibleText(r);
    expect(text).toContain('Nguyen Van A'); expect(text).toContain('0901234567');
    expect(text).not.toMatch(/Minh mẫu|PHIÊN MẪU|Nhân vật thử câu|Được duyệt|5\.0 sao|100%/);
    expect(text).toContain('Chưa có đánh giá');
    await act(async () => r.unmount());
  });
  it('displays actual authenticated avatar initial when no remote avatar exists', async () => {
    const r = await render();
    expect(r.root.findAllByType(Text).some(x => x.props.children === 'N')).toBe(true);
    expect(r.root.findAllByType(Image)).toHaveLength(0);
    await act(async () => r.unmount());
  });
  it('shows unsubmitted KYC only when source returns null', async () => {
    const r = await render(); expect(visibleText(r)).toContain('Chưa nộp hồ sơ');
    expect(visibleText(r)).not.toContain('Đã xác minh');
    await act(async () => r.unmount());
  });
  it('shows verified KYC only after actual verified source result', async () => {
    verificationApi.getMyVerification.mockResolvedValue(verification as never);
    const r = await render();
    expect(visibleText(r)).toContain('Đã xác minh');
    await act(async () => r.unmount());
  });
  it('preserves avatar preview/edit buttons with at least 44pt target', async () => {
    const r = await render();
    for (const label of ['Xem ảnh đại diện', 'Đổi ảnh đại diện']) {
      const b = button(r,label); expect(b).toHaveLength(1);
      const dims = styleList(b[0].props.style).map(s => Math.max(typeof s.width === 'number' ? s.width : 0, typeof s.height === 'number' ? s.height : 0, typeof s.minHeight === 'number' ? s.minHeight : 0));
      expect(Math.max(0,...dims)).toBeGreaterThanOrEqual(44);
    }
    await act(async () => r.unmount());
  });
  it('does not call profile, verification, avatar or schedule mutation on render', async () => {
    const r = await render();
    expect(profileApi.updateMyProfile).not.toHaveBeenCalled();
    expect(profileApi.updateMySchedule).not.toHaveBeenCalled();
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.setSkillPricing).not.toHaveBeenCalled();
    expect(verificationApi.submit).not.toHaveBeenCalled();
    expect(imagePicker).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  it('keeps image picker cancel side-effect free', async () => {
    const r = await render();
    await act(async () => { await button(r,'Đổi ảnh đại diện')[0].props.onPress(); });
    expect(imagePicker).toHaveBeenCalledTimes(1);
    expect(users.updateProfile).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  it('retains wallet and calendar navigation routes', async () => {
    const r = await render();
    const nav = button(r,'Ví của tôi, Số dư, nạp tiền, rút tiền');
    expect(nav).toHaveLength(1);
    await act(async () => nav[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianWallet');
    await act(async () => r.unmount());
  });
});

describe('SEP-136 combined profile entries', () => {
  it('opens one scheduling screen and one service area screen', async () => {
    const r = await render();
    const schedule = button(r, 'Lịch làm việc, Khung giờ nhận việc, ngày nghỉ và đơn theo ngày');
    expect(schedule).toHaveLength(1);
    await act(async () => schedule[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianSchedule');
    const area = r.root.findAllByType(TouchableOpacity).find(x => String(x.props.accessibilityLabel ?? '').startsWith('Khu vực hoạt động,'));
    expect(area).toBeDefined();
    await act(async () => area!.props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianServiceAreas');
    expect(visibleText(r)).not.toContain('Khung giờ nhận việc hằng tuần');
    await act(async () => r.unmount());
  });
  it('puts the full-width outlined logout after the role-specific account actions', async () => {
    const r = await render();
    const logout = button(r, 'Đăng xuất')[0];
    const styles = Object.assign({}, ...styleList(logout.props.style));
    expect(styles.width).toBe('100%');
    expect(styles.minHeight).toBeGreaterThanOrEqual(44);
    expect(styles.borderWidth).toBe(1);
    expect(styles.position).not.toBe('absolute');
    const actions = r.root.findAllByType(TouchableOpacity);
    const kyc = actions.find(item => String(item.props.accessibilityLabel).startsWith('Xác minh danh tính'))!;
    expect(actions.indexOf(logout)).toBeGreaterThan(actions.indexOf(kyc));
    await act(async () => r.unmount());
  });
});
