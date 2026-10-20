import { resolveServicePrice, servicePricingLabel } from './service-catalog';

// Shapes of the live Catalog V2 (19/10/2026): every service is `inspection_required`, the price is in `priceSummary`.
const v2 = (priceSummary: unknown) => ({ pricingMode: 'inspection_required' as const, priceSummary: priceSummary as never });

describe('service price in the Catalog V2 list, detail and booking card', () => {
  it('shows the approved labor range instead of "cần khảo sát" for a fixed_range service', () => {
    const price = resolveServicePrice(v2({ kind: 'fixed_range', minLaborVnd: 199000, maxLaborVnd: 449000 }));
    expect(price.kind).toBe('range');
    expect(price.text).toMatch(/199\.000.*–.*449\.000/);
    expect(price.caption).toBe('Giá công theo thiết bị/phạm vi');
  });

  it('shows a reference for inspection services and says the technician quotes', () => {
    const price = resolveServicePrice(v2({ kind: 'inspection_reference', minLaborVnd: null, maxLaborVnd: null, suggestedLaborVnd: 249000 }));
    expect(price).toMatchObject({ kind: 'survey', caption: 'Thợ khảo sát, báo giá để khách duyệt' });
    expect(price.text).toMatch(/^Tham khảo 249\.000/);
  });

  it('falls back to the old rules when the backend sends no summary', () => {
    expect(resolveServicePrice({ pricingMode: 'inspection_required' }).kind).toBe('survey');
    expect(resolveServicePrice({ pricingMode: 'fixed_price', fixedPrice: 250000 }).kind).toBe('fixed');
  });

  it('words the booking line from the catalog when it has a summary, else with the old prefixes', () => {
    expect(servicePricingLabel(v2({ kind: 'fixed_range', minLaborVnd: 119000, maxLaborVnd: 119000 }))).toMatch(/^119\.000.* · Giá công theo thiết bị\/phạm vi$/);
    expect(servicePricingLabel(v2({ kind: 'inspection_only', minLaborVnd: null, maxLaborVnd: null }))).toBe('Khảo sát & báo giá');
    expect(servicePricingLabel({ pricingMode: 'fixed_price', fixedPrice: 250000 })).toMatch(/^Giá cố định: 250\.000/);
    expect(servicePricingLabel({ pricingMode: 'inspection_required' })).toMatch(/^Cần khảo sát\/báo giá:/);
  });
});
