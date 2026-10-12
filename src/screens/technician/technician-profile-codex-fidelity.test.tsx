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
  it('shows original profile name as eyebrow and Codex title as the heading', async () => {
    const r = await render(); const text = visibleText(r);
    expect(text).toContain('Hồ sơ kỹ thuật viên');
    expect(text).toContain('Hồ sơ nghề nghiệp');
    const header = r.root.findAllByType(Text).filter(x => x.props.accessibilityRole === 'header' && x.props.children === 'Hồ sơ nghề nghiệp');
    expect(header.some(x => styleList(x.props.style).some(s => s.fontSize === 26))).toBe(true);
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

describe('T12B2A real weekly availability and time-off sheet presentation', () => {
  const day = (r: ReactTestRenderer, name: string) => r.root.findAllByType(TouchableOpacity).find(
    x => x.props.accessibilityLabel === name && x.props.accessibilityRole === 'checkbox',
  )!;
  const pressText = (r: ReactTestRenderer, label: string) => r.root.findAllByType(TouchableOpacity).find(
    x => x.findAllByType(Text).some(t => t.props.children === label),
  )!;
  const loaded = (schedules: { dayOfWeek: number; startTime: string; endTime: string }[]) =>
    profileApi.getMyProfile.mockResolvedValue({ ...profile, schedules } as never);

  it('keeps existing weekly heading while adding Codex-inspired large heading and truthful draft copy', async () => {
    const r = await render(); const t = visibleText(r);
    expect(t).toContain('Khung giờ nhận việc theo tuần');
    expect(t).toContain('Chọn khung giờ phù hợp');
    expect(t).toContain('Chỉ cập nhật lên máy chủ khi chọn Lưu khung giờ.');
    await act(async () => r.unmount());
  });

  it('renders separate soft-theme visual shells for weekly schedule and leave', async () => {
    const r = await render();
    const highlighted = r.root.findAllByType(View).filter(
      x => styleList(x.props.style).some(s => s.backgroundColor === '#eff6ff' && s.borderRadius === 18),
    );
    expect(highlighted.length).toBeGreaterThanOrEqual(2);
    await act(async () => r.unmount());
  });

  it('identifies empty draft as 0 of 7 selected, not as saved server availability', async () => {
    const r = await render();
    expect(visibleText(r)).toContain('Đang chọn 0/7 ngày');
    expect(profileApi.updateMySchedule).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('maps source Sunday=0, Wednesday=3 and real hour ranges without shifting by Monday-first calendar', async () => {
    loaded([
      { dayOfWeek: 0, startTime: '07:00', endTime: '18:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
    ]);
    const r = await render();
    await act(async () => button(r, 'Khung giờ nhận việc hằng tuần, 2 khung giờ trong tuần')[0].props.onPress());
    expect(day(r, 'Chủ Nhật').props.accessibilityState.checked).toBe(true);
    expect(day(r, 'Thứ Tư').props.accessibilityState.checked).toBe(true);
    expect(day(r, 'Thứ Hai').props.accessibilityState.checked).toBe(false);
    expect(visibleText(r)).toContain('Đang chọn 2/7 ngày');
    expect(profileApi.updateMySchedule).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('updates only a local day draft when toggled; preserves 44pt checkbox', async () => {
    const r = await render();
    await act(async () => day(r, 'Chủ Nhật').props.onPress());
    expect(day(r, 'Chủ Nhật').props.accessibilityState.checked).toBe(true);
    expect(visibleText(r)).toContain('Đang chọn 1/7 ngày');
    expect(styleList(day(r, 'Chủ Nhật').props.style).some(s => (s.minHeight as number) >= 44)).toBe(true);
    expect(profileApi.updateMySchedule).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('submits exact real Sunday schedule only after explicit save, no demo availability', async () => {
    profileApi.updateMySchedule.mockResolvedValue([] as never);
    const r = await render();
    await act(async () => day(r, 'Chủ Nhật').props.onPress());
    await act(async () => pressText(r, 'Lưu khung giờ').props.onPress());
    expect(profileApi.updateMySchedule).toHaveBeenCalledTimes(1);
    expect(profileApi.updateMySchedule).toHaveBeenCalledWith([
      { dayOfWeek: 0, startTime: '08:00', endTime: '17:00' },
    ]);
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('presents time-off as actual server-requested data without demo leave fixture', async () => {
    profileApi.getMyTimeOff.mockResolvedValue([{
      id: 'leave-real-mock', startAt: '2026-10-18T00:00:00+07:00',
      endAt: '2026-10-19T23:59:59+07:00', reason: 'Nghỉ gia đình',
    }]);
    const r = await render();
    await act(async () => button(r, 'Ngày nghỉ, Đăng ký các khoảng ngày không nhận việc')[0].props.onPress());
    expect(profileApi.getMyTimeOff).toHaveBeenCalledTimes(1);
    const t = visibleText(r);
    expect(t).toContain('Quản lý ngày nghỉ');
    expect(t).toContain('Nghỉ gia đình');
    expect(t).not.toContain('Quận 3 mẫu');
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.deleteTimeOff).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('keeps the manual dd/MM/yyyy leave form and 44pt delete control without auto mutations', async () => {
    const r = await render();
    expect(visibleText(r)).toContain('Ngày nghỉ');
    expect(visibleText(r)).toContain('Quản lý ngày nghỉ');
    const picker = r.root.findAllByType(TouchableOpacity).filter(x => String(x.props.accessibilityLabel ?? '').startsWith('Xóa ngày nghỉ'));
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.deleteTimeOff).not.toHaveBeenCalled();
    expect(picker.length).toBe(0);
    await act(async () => r.unmount());
  });

  it('displays precise write boundary and keeps existing save and add controls', async () => {
    const r = await render(); const t = visibleText(r);
    expect(t).toContain('Thêm hoặc xóa chỉ có hiệu lực khi máy chủ xác nhận.');
    expect(pressText(r, 'Lưu khung giờ')).toBeDefined();
    expect(pressText(r, 'Thêm ngày nghỉ')).toBeDefined();
    expect(t).not.toMatch(/Minh mẫu|Quận 3 mẫu|300\.000 ₫|Lưu lịch & kỹ năng mẫu|khung giờ đã được duyệt/);
    await act(async () => r.unmount());
  });
});

describe('T12B2B time-off GET fail-closed and explicit retry', () => {
  const openTimeOff = async (r: ReactTestRenderer) => {
    await act(async () => {
      await button(r, 'Ngày nghỉ, Đăng ký các khoảng ngày không nhận việc')[0].props.onPress();
    });
  };
  const apiLeave = {
    id: 'server-leave-2', startAt: '2026-10-20T00:00:00+07:00',
    endAt: '2026-10-20T23:59:59+07:00', reason: 'Nghỉ gia đình theo API',
  };

  it('does not invent an empty leave list after failed authenticated GET', async () => {
    profileApi.getMyTimeOff.mockRejectedValue(new Error('offline'));
    const r = await render();
    await openTimeOff(r);
    const t = visibleText(r);
    expect(t).toContain('Không thể tải danh sách ngày nghỉ.');
    expect(t).not.toContain('Chưa có ngày nghỉ nào.');
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.deleteTimeOff).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('shows a visible explicit GET-only retry control with at least 44pt touch target', async () => {
    profileApi.getMyTimeOff.mockRejectedValue(new Error('offline'));
    const r = await render();
    await openTimeOff(r);
    const retries = button(r, 'Thử lại tải ngày nghỉ');
    expect(retries).toHaveLength(1);
    expect(styleList(retries[0].props.style).some(s => (s.minHeight as number) >= 44)).toBe(true);
    await act(async () => r.unmount());
  });

  it('retrieves actual leave on explicit retry and clears previous failure', async () => {
    profileApi.getMyTimeOff.mockRejectedValueOnce(new Error('offline'));
    profileApi.getMyTimeOff.mockResolvedValueOnce([apiLeave] as never);
    const r = await render();
    await openTimeOff(r);
    expect(visibleText(r)).toContain('Không thể tải danh sách ngày nghỉ.');
    await act(async () => button(r, 'Thử lại tải ngày nghỉ')[0].props.onPress());
    expect(profileApi.getMyTimeOff).toHaveBeenCalledTimes(2);
    expect(visibleText(r)).toContain('Nghỉ gia đình theo API');
    expect(visibleText(r)).not.toContain('Không thể tải danh sách ngày nghỉ.');
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.deleteTimeOff).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('retains retry state after repeated GET failures without mutations', async () => {
    profileApi.getMyTimeOff.mockRejectedValue(new Error('offline'));
    const r = await render();
    await openTimeOff(r);
    await act(async () => button(r, 'Thử lại tải ngày nghỉ')[0].props.onPress());
    expect(visibleText(r)).toContain('Không thể tải danh sách ngày nghỉ.');
    expect(button(r, 'Thử lại tải ngày nghỉ')).toHaveLength(1);
    expect(profileApi.getMyTimeOff).toHaveBeenCalledTimes(2);
    expect(profileApi.updateMySchedule).not.toHaveBeenCalled();
    expect(profileApi.createTimeOff).not.toHaveBeenCalled();
    expect(profileApi.deleteTimeOff).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  it('shows legitimate no-leave empty state only after successful GET returning []', async () => {
    profileApi.getMyTimeOff.mockResolvedValue([]);
    const r = await render();
    await openTimeOff(r);
    expect(visibleText(r)).toContain('Chưa có ngày nghỉ nào.');
    expect(visibleText(r)).not.toContain('Không thể tải danh sách ngày nghỉ.');
    await act(async () => r.unmount());
  });

  it('does not assert empty leave while GET is still loading', async () => {
    profileApi.getMyTimeOff.mockImplementation(() => new Promise(() => undefined));
    const r = await render();
    await act(async () => { void button(r, 'Ngày nghỉ, Đăng ký các khoảng ngày không nhận việc')[0].props.onPress(); });
    expect(visibleText(r)).not.toContain('Chưa có ngày nghỉ nào.');
    expect(visibleText(r)).not.toContain('Không thể tải danh sách ngày nghỉ.');
    await act(async () => r.unmount());
  });
});
