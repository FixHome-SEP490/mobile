import {
  isCatalogV2PreviewReady, isCatalogV2PricingUnavailableError, normalizePricingPreview, type CatalogPricingPreview,
} from './catalog-pricing.api';

const variant = { variantId: 'v1', variantCode: 'AC-01-02', scopeVi: 'Vệ sinh máy treo tường', laborPriceVnd: 150000 };
const envelope = (data: unknown) => ({ success: true, statusCode: 200, message: 'ok', data });
const fixed = {
  serviceId: 's1', serviceCode: 'AC-01', status: 'FIXED_PRICE', bindingReady: true,
  selectedVariant: variant, possibleVariants: [variant], missingAttributes: [], priceRange: null, messageVi: '',
};

describe('catalog pricing preview', () => {
  it('accepts a well-formed answer and rejects anything that could invent a price', () => {
    expect(normalizePricingPreview(envelope(fixed)).selectedVariant?.laborPriceVnd).toBe(150000);
    expect(() => normalizePricingPreview(envelope({ ...fixed, selectedVariant: null }))).toThrow(); // FIXED_PRICE needs a scope
    expect(() => normalizePricingPreview(envelope({ ...fixed, selectedVariant: { ...variant, laborPriceVnd: '150000' } }))).toThrow();
    expect(() => normalizePricingPreview(envelope({ ...fixed, status: 'INSPECTION_REQUIRED', selectedVariant: null, priceRange: { minLaborVnd: 9, maxLaborVnd: 1 } }))).toThrow();
    expect(() => normalizePricingPreview({ data: fixed })).toThrow();
  });

  it('treats 403/404/501/503 as "feature not available" and nothing else', () => {
    for (const status of [403, 404, 501, 503]) expect(isCatalogV2PricingUnavailableError({ response: { status } })).toBe(true);
    expect(isCatalogV2PricingUnavailableError({ response: { status: 500 } })).toBe(false);
    expect(isCatalogV2PricingUnavailableError(new Error('network'))).toBe(false);
  });

  it('only lets the customer continue on a server-confirmed scope or an inspection result', () => {
    const service = { id: 's1', code: 'AC-01' };
    const ready = (preview: CatalogPricingPreview | null, code: string | null, extra = {}) =>
      isCatalogV2PreviewReady({ service, preview, selectedVariantCode: code, isAiFlow: false, ...extra });
    const fixedPreview = normalizePricingPreview(envelope(fixed));
    expect(ready(null, null)).toBe(false);
    expect(ready(fixedPreview, 'AC-01-02')).toBe(true);
    expect(ready(fixedPreview, null)).toBe(false);
    const inspect = normalizePricingPreview(envelope({ ...fixed, status: 'INSPECTION_REQUIRED', bindingReady: false, selectedVariant: null }));
    expect(ready(inspect, null)).toBe(true);
    expect(ready(inspect, 'AC-01-02')).toBe(false);
    expect(ready({ ...fixedPreview, serviceId: 'other' }, 'AC-01-02')).toBe(false);
    // Legacy services and the AI flow are never held up.
    expect(isCatalogV2PreviewReady({ service: { id: 's', code: 'SUA_RO_RI_NUOC' }, preview: null, selectedVariantCode: null, isAiFlow: false })).toBe(true);
    expect(ready(null, null, { isAiFlow: true })).toBe(true);
  });
});
