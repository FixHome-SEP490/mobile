import {
  detectArea,
  formatDobInput,
  getKycSummaryLabel,
  getOnboardingStepProgress,
  keysToServiceAreas,
  ONBOARDING_STEPS,
  isoToDob,
  parseCccdQr,
  parseDob,
  resolveBackAction,
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
    // Danh tính đã xác nhận nhưng chưa duyệt hồ sơ cuối: vẫn đang chờ, chưa được vào làm việc.
    [{ onboardingStatus: 'submitted', verificationStatus: 'verified' }, 'submitted'],
  ] as const)('%j -> %s', (overrides, expected) => {
    expect(resolveOnboardingView(status(overrides))).toBe(expected);
  });
});

describe('getOnboardingStepProgress', () => {
  it('keeps the five owner-locked titles and derives completion from saved fields', () => {
    expect(ONBOARDING_STEPS.map((step) => step.title)).toEqual([
      'Thông tin cá nhân',
      'Xác minh danh tính',
      'Kỹ năng',
      'Địa chỉ & khu vực',
      'Gửi duyệt',
    ]);

    const progress = getOnboardingStepProgress(
      status({
        currentStep: 4,
        personalInfoCompleted: true,
        kycSubmitted: true,
        skillsSelected: true,
      }),
      4,
    );

    expect(progress.map(({ completed, current, reachable, statusLabel }) => ({
      completed,
      current,
      reachable,
      statusLabel,
    }))).toEqual([
      { completed: true, current: false, reachable: true, statusLabel: 'Đã hoàn tất' },
      { completed: true, current: false, reachable: true, statusLabel: 'Đã hoàn tất' },
      { completed: true, current: false, reachable: true, statusLabel: 'Đã hoàn tất' },
      { completed: false, current: true, reachable: true, statusLabel: 'Đang thực hiện' },
      { completed: false, current: false, reachable: false, statusLabel: 'Chưa bắt đầu' },
    ]);
  });

  it('does not turn an incomplete earlier step into completed progress', () => {
    const progress = getOnboardingStepProgress(
      status({ currentStep: 3, personalInfoCompleted: true }),
      3,
    );

    expect(progress[1]).toMatchObject({
      completed: false,
      reachable: true,
      statusLabel: 'Cần hoàn tất',
    });
    expect(progress[2]).toMatchObject({
      completed: false,
      current: true,
      statusLabel: 'Đang thực hiện',
    });
    expect(progress[3]).toMatchObject({ completed: false, reachable: false });
  });

  it('keeps rejected submission incomplete while allowing recovery through persisted steps', () => {
    const progress = getOnboardingStepProgress(
      status({
        onboardingStatus: 'rejected',
        currentStep: 5,
        personalInfoCompleted: true,
        kycSubmitted: true,
        skillsSelected: true,
        addressSet: true,
      }),
      1,
    );

    expect(progress[0]).toMatchObject({
      completed: true,
      current: true,
      statusLabel: 'Đang xem · đã hoàn tất',
    });
    expect(progress[4]).toMatchObject({ completed: false, reachable: true });
  });

  it('keeps a rejected KYC submission incomplete without inventing document-level results', () => {
    const progress = getOnboardingStepProgress(
      status({
        onboardingStatus: 'rejected',
        verificationStatus: 'rejected',
        currentStep: 5,
        personalInfoCompleted: true,
        kycSubmitted: true,
        skillsSelected: true,
        addressSet: true,
      }),
      2,
    );

    expect(progress[1]).toMatchObject({
      completed: false,
      current: true,
      statusLabel: 'Đang thực hiện',
    });
    expect(progress[4]).toMatchObject({ completed: false, reachable: true });
  });

  it.each(['submitted', 'approved'] as const)(
    'marks the review step complete only for server status %s',
    (onboardingStatus) => {
      const progress = getOnboardingStepProgress(
        status({ onboardingStatus, currentStep: 5 }),
        5,
      );

      expect(progress[4]).toMatchObject({
        completed: true,
        current: true,
        statusLabel: 'Đang xem · đã hoàn tất',
      });
    },
  );

  it('does not infer review submission from KYC verification alone', () => {
    const progress = getOnboardingStepProgress(
      status({
        onboardingStatus: 'in_progress',
        verificationStatus: 'verified',
        currentStep: 5,
      }),
      5,
    );

    expect(progress[4]).toMatchObject({ completed: false, statusLabel: 'Đang thực hiện' });
  });
});

describe('getKycSummaryLabel', () => {
  it('does not report the backend default pending status as submitted KYC', () => {
    expect(getKycSummaryLabel(status())).toBe('Chưa nộp hồ sơ');
  });

  it('reports pending only after KYC was submitted', () => {
    expect(getKycSummaryLabel(status({ kycSubmitted: true }))).toBe('Đang chờ duyệt');
  });

  it('uses the overall rejection state and actual verified status only for submitted KYC', () => {
    expect(getKycSummaryLabel(status({ kycSubmitted: true, verificationStatus: 'rejected' })))
      .toBe('Cần cập nhật');
    expect(getKycSummaryLabel(status({ kycSubmitted: true, verificationStatus: 'VERIFIED' })))
      .toBe('Đã xác minh danh tính');
    expect(getKycSummaryLabel(status({ kycSubmitted: true, verificationStatus: 'unknown' })))
      .toBe('Đã nộp hồ sơ');
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

describe('parseCccdQr', () => {
  it('reads a chip CCCD QR', () => {
    expect(parseCccdQr('079203001234||Nguyễn Văn A|15052003|Nam|12 Lê Lợi, Q1, TP.HCM|01012022')).toEqual({
      citizenId: '079203001234', fullName: 'Nguyễn Văn A', dob: '15/05/2003', gender: 'male',
    });
    expect(parseCccdQr('079203001234|123456789|Trần Thị B|31022003|Nữ|x|01012022')?.dob).toBe('');
    expect(parseCccdQr('079203001234||B|15052003|Nữ|x|01012022')?.gender).toBe('female');
  });

  it('reads a card whose QR has no birth date or gender, taking gender from the number', () => {
    expect(parseCccdQr('079303001234|Trần Thị B|01072024')).toEqual({
      citizenId: '079303001234', fullName: 'Trần Thị B', dob: '', gender: 'female',
    });
    expect(parseCccdQr('079203001234|01072024')).toMatchObject({ fullName: '', gender: 'male' });
  });

  it('rejects anything that is not a CCCD QR', () => {
    expect(parseCccdQr('https://example.com')).toBeNull();
    expect(parseCccdQr('079203001234')).toBeNull();
    expect(parseCccdQr('123|a|b|c|d')).toBeNull();
  });
});

describe('resolveBackAction', () => {
  const base = { loading: false, hasStatus: true, view: 'wizard', step: 1, entryMode: 'form' } as const;

  it('steps back only while the form is showing', () => {
    expect(resolveBackAction({ ...base, step: 3 })).toBe('prev-step');
    expect(resolveBackAction({ ...base, entryMode: 'scan' })).toBe('close-scan');
    expect(resolveBackAction({ ...base, step: 2, entryMode: 'choose' })).toBe('prev-step');
  });

  it('goes home once the application is submitted or approved, instead of stepping back unseen', () => {
    expect(resolveBackAction({ ...base, view: 'submitted', step: 5 })).toBe('home');
    expect(resolveBackAction({ ...base, view: 'approved', step: 5 })).toBe('home');
  });

  it('goes home, never logs out, from the first step, while loading, on load error or after a rejection', () => {
    expect(resolveBackAction(base)).toBe('home');
    expect(resolveBackAction({ ...base, loading: true, step: 4 })).toBe('home');
    expect(resolveBackAction({ ...base, hasStatus: false, step: 4 })).toBe('home');
    expect(resolveBackAction({ ...base, view: 'rejected', step: 4 })).toBe('home');
  });
});

describe('isoToDob', () => {
  it('turns the backend date into the input format', () => {
    expect(isoToDob('1995-05-15')).toBe('15/05/1995');
    expect(isoToDob('2003-05-15T00:00:00.000Z')).toBe('15/05/2003');
    expect(isoToDob(undefined)).toBe('');
    expect(isoToDob('1995-13-45')).toBe('');
  });
});
