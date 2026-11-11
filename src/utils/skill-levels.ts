/** Cấp độ kỹ năng: giữ giá trị và nhãn đang dùng ở web Hồ sơ (PO 09/11/2026). Cấp độ thợ chọn lúc đăng ký chỉ là tự khai. */
export const SKILL_LEVELS = [
  { value: 'BEGINNER', label: 'Thợ mới' },
  { value: 'INTERMEDIATE', label: 'Thợ lành nghề' },
  { value: 'ADVANCED', label: 'Thợ kỹ thuật cao' },
  { value: 'EXPERT', label: 'Chuyên gia' },
] as const;

export type SkillLevelValue = (typeof SKILL_LEVELS)[number]['value'];

export const DEFAULT_SKILL_LEVEL: SkillLevelValue = 'INTERMEDIATE';

/** Nhãn tiếng Việt; giá trị lạ không bao giờ lộ ra màn hình. */
export function skillLevelLabel(value: string | null | undefined): string {
  return SKILL_LEVELS.find((level) => level.value === String(value ?? '').toUpperCase())?.label ?? 'Chưa rõ cấp độ';
}
