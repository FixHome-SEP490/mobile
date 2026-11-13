// Input rules for "Kỹ năng và dịch vụ nhận làm": the same bounds the server checks
// (UpdateSkillPricingDto: listedLaborPrice 0..9.999.999.999,99; typicalWarrantyDays integer 0..3650),
// checked before sending so the technician reads why, instead of a bare "Không thể lưu kỹ năng này".

export const SKILL_PRICE_MAX = 9_999_999_999;
export const SKILL_WARRANTY_DAYS_MAX = 3650;

/** The fields only take digits, like the unit price on a quotation: a minus sign, dot or letter is dropped as it is typed. */
export function skillDigitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

export type SkillPricingDraft = { listedLaborPrice: string; typicalWarrantyDays: string };
export type SkillPricingValues = { listedLaborPrice: number | null; typicalWarrantyDays: number | null };

/** The values to send, or the reason in Vietnamese. An empty field clears the value (null), as before. */
export function readSkillPricing(draft: SkillPricingDraft, isFixedPrice: boolean): { values: SkillPricingValues } | { error: string } {
  const price = draft.listedLaborPrice.trim();
  const days = draft.typicalWarrantyDays.trim();
  let listedLaborPrice: number | null = null;
  if (!isFixedPrice && price) {
    // A value saved earlier with cents (the server allows two decimals) is kept as it is; typing only adds digits.
    if (!/^\d+(\.\d{1,2})?$/.test(price)) return { error: 'Giá công chỉ gồm chữ số, không âm, không có dấu chấm hay chữ.' };
    listedLaborPrice = Number(price);
    if (!Number.isFinite(listedLaborPrice) || listedLaborPrice > SKILL_PRICE_MAX) {
      return { error: 'Giá công quá lớn. Vui lòng nhập tối đa 9.999.999.999 ₫.' };
    }
  }
  let typicalWarrantyDays: number | null = null;
  if (days) {
    if (!/^\d+$/.test(days)) return { error: 'Số ngày bảo hành chỉ gồm chữ số, không âm.' };
    typicalWarrantyDays = Number(days);
    if (typicalWarrantyDays > SKILL_WARRANTY_DAYS_MAX) return { error: 'Số ngày bảo hành tối đa là 3650 ngày.' };
  }
  return { values: { listedLaborPrice, typicalWarrantyDays } };
}
