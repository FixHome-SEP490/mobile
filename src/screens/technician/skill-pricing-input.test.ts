import { readSkillPricing, skillDigitsOnly } from './skill-pricing-input';

describe('skill pricing input (M-17)', () => {
  it('drops a minus sign, dots and letters as they are typed', () => {
    expect(skillDigitsOnly('-5000')).toBe('5000');
    expect(skillDigitsOnly('1.250.000đ')).toBe('1250000');
    expect(skillDigitsOnly('abc')).toBe('');
  });

  it('sends whole numbers and clears empty fields', () => {
    expect(readSkillPricing({ listedLaborPrice: '150000', typicalWarrantyDays: '30' }, false)).toEqual({ values: { listedLaborPrice: 150000, typicalWarrantyDays: 30 } });
    expect(readSkillPricing({ listedLaborPrice: '', typicalWarrantyDays: '' }, false)).toEqual({ values: { listedLaborPrice: null, typicalWarrantyDays: null } });
    expect(readSkillPricing({ listedLaborPrice: '150000', typicalWarrantyDays: '0' }, true)).toEqual({ values: { listedLaborPrice: null, typicalWarrantyDays: 0 } });
    expect(readSkillPricing({ listedLaborPrice: '150000.5', typicalWarrantyDays: '' }, false)).toEqual({ values: { listedLaborPrice: 150000.5, typicalWarrantyDays: null } });
  });

  it('explains a negative or oversized value in Vietnamese instead of sending it', () => {
    expect(readSkillPricing({ listedLaborPrice: '-5000', typicalWarrantyDays: '' }, false)).toEqual({ error: expect.stringContaining('không âm') });
    expect(readSkillPricing({ listedLaborPrice: '99999999999', typicalWarrantyDays: '' }, false)).toEqual({ error: expect.stringContaining('quá lớn') });
    expect(readSkillPricing({ listedLaborPrice: '', typicalWarrantyDays: '-1' }, false)).toEqual({ error: expect.stringContaining('không âm') });
    expect(readSkillPricing({ listedLaborPrice: '', typicalWarrantyDays: '3651' }, false)).toEqual({ error: expect.stringContaining('3650') });
  });
});
