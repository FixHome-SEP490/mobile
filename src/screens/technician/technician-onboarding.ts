// src/screens/technician/technician-onboarding.ts
//
// Logic thuần của luồng đăng ký kỹ thuật viên (5 bước), tách khỏi màn hình để
// test được. Luật nghiệp vụ cuối cùng vẫn do backend quyết định.
import {
  technicianOnboardingApi,
  type OnboardingStatusResponse,
  type ServiceAreaItem,
} from '../../api/technician-onboarding.api';
import type { Province, District } from '../../api/geo.api';

export const ONBOARDING_STEPS = [
  { id: 1, title: 'Thông tin cá nhân' },
  { id: 2, title: 'Xác minh danh tính' },
  { id: 3, title: 'Kỹ năng chuyên môn' },
  { id: 4, title: 'Địa chỉ và khu vực' },
  { id: 5, title: 'Gửi duyệt' },
] as const;

export const SERVICE_RADIUS_OPTIONS_KM = [5, 10, 15, 20, 30, 40];

// ── Trạng thái hồ sơ ────────────────────────────────────────────────────
//
// Chỉ nhìn `onboardingStatus`: `verificationStatus` của hồ sơ mặc định là
// 'pending' ngay khi vừa đăng ký, nên coi nó là "đã nộp" sẽ nhốt kỹ thuật viên
// mới ở màn chờ duyệt. Riêng 'verified' là dấu hiệu duyệt thật (backend cũng tự
// đồng bộ về approved).

export type OnboardingView = 'approved' | 'submitted' | 'rejected' | 'wizard';

export function resolveOnboardingView(status: OnboardingStatusResponse): OnboardingView {
  if (status.onboardingStatus === 'approved' || status.verificationStatus === 'verified') {
    return 'approved';
  }
  if (status.onboardingStatus === 'rejected') return 'rejected';
  if (status.onboardingStatus === 'submitted') return 'submitted';
  return 'wizard';
}

/** Sau đăng nhập: kỹ thuật viên chưa được duyệt thì vào thẳng luồng đăng ký. */
export async function technicianLandingRoute(): Promise<
  'TechnicianMain' | 'TechnicianOnboarding'
> {
  try {
    const status = await technicianOnboardingApi.getStatus();
    return resolveOnboardingView(status) === 'approved'
      ? 'TechnicianMain'
      : 'TechnicianOnboarding';
  } catch {
    // Không tải được thì cứ vào app; banner ở Trang chủ sẽ nhắc lại.
    return 'TechnicianMain';
  }
}

// ── Bước 1: thông tin cá nhân ───────────────────────────────────────────

/** Gõ số thì tự chèn dấu `/` thành dd/MM/yyyy. */
export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Không dùng `new Date(string)` để ngày không bị lệch theo múi giờ. */
export function parseDob(text: string): { year: number; month: number; day: number; iso: string } | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return { year, month, day, iso: `${pad(year, 4)}-${pad(month)}-${pad(day)}` };
}

export function validateDob(text: string, today: Date = new Date()): string {
  if (!text.trim()) return 'Vui lòng nhập ngày sinh';
  const dob = parseDob(text);
  if (!dob) return 'Ngày sinh không hợp lệ (dd/MM/yyyy)';
  let age = today.getFullYear() - dob.year;
  const passedBirthday =
    today.getMonth() + 1 > dob.month ||
    (today.getMonth() + 1 === dob.month && today.getDate() >= dob.day);
  if (!passedBirthday) age -= 1;
  if (age < 18) return 'Bạn phải đủ 18 tuổi trở lên';
  return '';
}

export function validateCitizenId(value: string): string {
  return /^\d{12}$/.test(value.trim()) ? '' : 'Số CCCD phải gồm đúng 12 chữ số';
}

// ── Bước 4: khu vực phục vụ ─────────────────────────────────────────────

export const toAreaKey = (provinceCode: string | number, districtCode: string | number) =>
  `${provinceCode}:${districtCode}`;

export function keysToServiceAreas(keys: string[]): ServiceAreaItem[] {
  return keys.map((key) => {
    const [provinceCode, districtCode] = key.split(':');
    return { provinceCode, districtCode };
  });
}

export function serviceAreasToKeys(areas: ServiceAreaItem[] = []): string[] {
  return areas.map((a) => toAreaKey(a.provinceCode, a.districtCode));
}

const PREFIX = /^(thanh pho|tp\.?|tinh|quan|huyen|thi xa|tx\.?)\s+/;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Bỏ tiền tố hành chính, trừ "quận 1" / "quận 10" để hai quận này không lẫn nhau. */
function nameKey(value: string): string {
  const folded = fold(value);
  const stripped = folded.replace(PREFIX, '');
  return /^\d+$/.test(stripped) ? folded : stripped;
}

const hasPhrase = (haystack: string, phrase: string) =>
  phrase.length > 1 && ` ${haystack} `.includes(` ${phrase} `);

/**
 * Đoán tỉnh và quận/huyện từ gợi ý địa chỉ (ưu tiên) rồi tới chính chuỗi địa
 * chỉ. Chỉ để chọn sẵn cho người dùng, họ vẫn chỉnh được.
 */
export function detectArea(
  provinces: Province[],
  addressText: string,
  hint: { province?: string; district?: string } = {},
): { province?: Province; district?: District } {
  const text = fold(addressText);
  const byLengthDesc = <T extends { name: string }>(list: T[]) =>
    [...list].sort((a, b) => b.name.length - a.name.length);

  const hintedProvince = hint.province ? nameKey(hint.province) : '';
  const province =
    provinces.find((p) => hintedProvince && nameKey(p.name) === hintedProvince) ??
    byLengthDesc(provinces).find((p) => hasPhrase(text, nameKey(p.name)));
  if (!province) return {};

  const districts = province.districts ?? [];
  const hintedDistrict = hint.district ? nameKey(hint.district) : '';
  const district =
    districts.find((d) => hintedDistrict && nameKey(d.name) === hintedDistrict) ??
    byLengthDesc(districts).find((d) => hasPhrase(text, nameKey(d.name)));

  return { province, district };
}
