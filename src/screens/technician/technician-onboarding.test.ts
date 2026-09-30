import {
  detectArea,
  formatDobInput,
  keysToServiceAreas,
  parseDob,
  resolveOnboardingView,
  serviceAreasToKeys,
  technicianLandingRoute,
  validateCitizenId,
  validateDob,
} from './technician-onboarding';
import { technicianOnboardingApi } from '../../api/technician-onboarding.api';
import type { OnboardingStatusResponse } from '../../api/technician-onboarding.api';
import type { Province } from '../../api/geo.api';

jest.mock('../../api/technician-onboarding.api', () => ({
  technicianOnboardingApi: { getStatus: jest.fn() },
}));

const getStatus = technicianOnboardingApi.getStatus as jest.Mock;

function status(overrides: Partial<OnboardingStatusResponse> = {}): OnboardingStatusResponse {
  return {
    onboardingStatus: 'not_started',
    // Mặc định của backend khi vừa tạo hồ sơ.
    verificationStatus: 'pending',
    currentStep: 1,
    personalInfoCompleted: false,
    kycSubmitted: false,
    skillsSelected: false,
    addressSet: false,
    ...overrides,
  };
}

describe('resolveOnboardingView', () => {
  it('keeps a brand-new technician in the wizard even though verificationStatus is pending', () => {
    expect(resolveOnboardingView(status())).toBe('wizard');
  });

  it.each([
    [{ onboardingStatus: 'in_progress' }, 'wizard'],
    [{ onboardingStatus: 'submitted' }, 'submitted'],
    [{ onboardingStatus: 'rejected', verificationStatus: 'rejected' }, 'rejected'],
    [{ onboardingStatus: 'approved' }, 'approved'],
    [{ onboardingStatus: 'submitted', verificationStatus: 'verified' }, 'approved'],
  ] as const)('%j -> %s', (overrides, expected) => {
    expect(resolveOnboardingView(status(overrides))).toBe(expected);
  });
});

describe('technicianLandingRoute', () => {
  afterEach(() => getStatus.mockReset());

  it('sends an unapproved technician to onboarding', async () => {
    getStatus.mockResolvedValue(status({ onboardingStatus: 'submitted' }));
    await expect(technicianLandingRoute()).resolves.toBe('TechnicianOnboarding');
  });

  it('sends an approved technician to the main app', async () => {
    getStatus.mockResolvedValue(status({ onboardingStatus: 'approved' }));
    await expect(technicianLandingRoute()).resolves.toBe('TechnicianMain');
  });

  it('falls back to the main app when the status cannot be loaded', async () => {
    getStatus.mockRejectedValue(new Error('offline'));
    await expect(technicianLandingRoute()).resolves.toBe('TechnicianMain');
  });
});

describe('date of birth', () => {
  const today = new Date(2026, 8, 29); // 29/09/2026

  it('formats digits into dd/MM/yyyy while typing', () => {
    expect(formatDobInput('1')).toBe('1');
    expect(formatDobInput('150')).toBe('15/0');
    expect(formatDobInput('15061995')).toBe('15/06/1995');
    expect(formatDobInput('15/06/1995999')).toBe('15/06/1995');
  });

  it('parses a real calendar date to ISO and rejects impossible ones', () => {
    expect(parseDob('15/06/1995')?.iso).toBe('1995-06-15');
    expect(parseDob('29/02/2000')?.iso).toBe('2000-02-29');
    expect(parseDob('29/02/2001')).toBeNull();
    expect(parseDob('31/04/1990')).toBeNull();
    expect(parseDob('15/06/95')).toBeNull();
  });

  it('requires the technician to be at least 18 on the exact birthday', () => {
    expect(validateDob('29/09/2008', today)).toBe('');
    expect(validateDob('30/09/2008', today)).toBe('Bạn phải đủ 18 tuổi trở lên');
    expect(validateDob('01/01/2030', today)).toBe('Bạn phải đủ 18 tuổi trở lên');
  });

  it('asks for a value and a valid format', () => {
    expect(validateDob('', today)).toBe('Vui lòng nhập ngày sinh');
    expect(validateDob('99/99/1999', today)).toBe('Ngày sinh không hợp lệ (dd/MM/yyyy)');
  });
});

describe('validateCitizenId', () => {
  it('accepts exactly 12 digits', () => {
    expect(validateCitizenId('079123456789')).toBe('');
    expect(validateCitizenId('07912345678')).not.toBe('');
    expect(validateCitizenId('0791234567890')).not.toBe('');
    expect(validateCitizenId('07912345678a')).not.toBe('');
  });
});

describe('service area keys', () => {
  it('round-trips between keys and the payload', () => {
    const keys = ['79:760', '1:001'];
    const areas = keysToServiceAreas(keys);
    expect(areas).toEqual([
      { provinceCode: '79', districtCode: '760' },
      { provinceCode: '1', districtCode: '001' },
    ]);
    expect(serviceAreasToKeys(areas)).toEqual(keys);
    expect(serviceAreasToKeys(undefined)).toEqual([]);
  });
});

describe('detectArea', () => {
  const provinces: Province[] = [
    {
      code: 79,
      name: 'Thành phố Hồ Chí Minh',
      districts: [
        { code: 760, name: 'Quận 1' },
        { code: 771, name: 'Quận 10' },
        { code: 765, name: 'Quận Bình Thạnh' },
      ],
    },
    { code: 1, name: 'Thành phố Hà Nội', districts: [{ code: 5, name: 'Quận Ba Đình' }] },
  ];

  it('uses the suggestion hint first', () => {
    const { province, district } = detectArea(provinces, '', {
      province: 'Hồ Chí Minh',
      district: 'Quận Bình Thạnh',
    });
    expect(province?.code).toBe(79);
    expect(district?.code).toBe(765);
  });

  it('does not confuse Quận 1 with Quận 10', () => {
    expect(detectArea(provinces, '12 Nguyễn Huệ, Quận 1, TP Hồ Chí Minh').district?.code).toBe(760);
    expect(detectArea(provinces, '5 Ba Tháng Hai, Quận 10, Hồ Chí Minh').district?.code).toBe(771);
  });

  it('falls back to the address text and copes with missing accents', () => {
    const { province, district } = detectArea(provinces, '1 pho Hue, ba dinh, ha noi');
    expect(province?.code).toBe(1);
    expect(district?.code).toBe(5);
  });

  it('returns nothing when the address matches no province', () => {
    expect(detectArea(provinces, 'Somewhere else')).toEqual({});
  });
});
