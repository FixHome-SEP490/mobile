import { servicePriceSummaryText } from './service-price-summary';

describe('servicePriceSummaryText', () => {
  it('words each kind like the web and falls back to survey when amounts are unusable', () => {
    expect(servicePriceSummaryText(undefined)).toBeNull();
    expect(servicePriceSummaryText({ kind: 'fixed_range', minLaborVnd: 150000, maxLaborVnd: 150000 })?.label).toMatch(/^150\.000/);
    expect(servicePriceSummaryText({ kind: 'fixed_range', minLaborVnd: 150000, maxLaborVnd: 250000 })?.label).toMatch(/150\.000.*–.*250\.000/);
    expect(servicePriceSummaryText({ kind: 'inspection_reference', minLaborVnd: null, maxLaborVnd: null, suggestedLaborVnd: 200000 })).toMatchObject({ caption: 'Thợ khảo sát, báo giá để khách duyệt' });
    expect(servicePriceSummaryText({ kind: 'fixed_range', minLaborVnd: 300, maxLaborVnd: 100 })?.label).toBe('Khảo sát & báo giá');
    expect(servicePriceSummaryText({ kind: 'inspection_only', minLaborVnd: null, maxLaborVnd: null })?.label).toBe('Khảo sát & báo giá');
  });
});
