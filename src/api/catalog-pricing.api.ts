// src/api/catalog-pricing.api.ts
//
// Catalog V2 device-fact pricing preview (P012, owner contract 19/10/2026), same contract as the web.
// The Backend owns every binding price: `GET /services/:id/catalog-v2-pricing` is advisory and
// `POST /bookings` re-resolves the same facts under transaction locks. This adapter only forwards
// facts; it never computes or adjusts money.
import apiClient from './client';

/** Customer-reported facts. An unanswered fact is simply omitted ("unknown" never travels). */
export interface BookingDeviceAttributes {
  brand?: string;
  acMounting?: 'wall' | 'ceiling' | 'floor';
  acHorsepower?: 'up_to_1_5' | '2_to_2_5';
  washerLoadingStyle?: 'top' | 'front';
  washerCapacityKg?: number;
  washerHasDryer?: boolean;
}

export interface CatalogPricingVariant {
  variantId: string;
  variantCode: string;
  scopeVi: string;
  laborPriceVnd: number;
}

export interface CatalogPricingPreview {
  serviceId: string;
  serviceCode: string;
  status: 'FIXED_PRICE' | 'INSPECTION_REQUIRED';
  bindingReady: boolean;
  selectedVariant: CatalogPricingVariant | null;
  possibleVariants: CatalogPricingVariant[];
  missingAttributes: string[];
  /** Grounded only; never rendered as a binding price. */
  priceRange: { minLaborVnd: number; maxLaborVnd: number } | null;
  messageVi: string;
}

const VARIANT_CODE = /^[A-Z]{2}-\d{2}-\d{2}$/;
/** V2 service codes are owner-approved catalog codes, distinct from legacy ones. */
export const isCatalogV2ServiceCode = (code?: string | null) => /^[A-Z]{2}-\d{2}$/.test(code ?? '');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const invalid = (): never => { throw new Error('Backend returned an invalid catalog pricing preview response.'); };
const positiveInt = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);

function normalizeVariant(value: unknown): CatalogPricingVariant {
  if (!isRecord(value)) return invalid();
  const { variantId, variantCode, scopeVi, laborPriceVnd } = value;
  const price = positiveInt(laborPriceVnd);
  if (typeof variantId !== 'string' || !variantId.trim() || typeof variantCode !== 'string' || !VARIANT_CODE.test(variantCode)
    || typeof scopeVi !== 'string' || !scopeVi.trim() || price === null) return invalid();
  return { variantId, variantCode, scopeVi, laborPriceVnd: price };
}

/** Strict normalization of the `{ success, statusCode, message, data }` envelope; anything else is an error, never an invented price. */
export function normalizePricingPreview(payload: unknown): CatalogPricingPreview {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return invalid();
  const data = payload.data;
  const status = data.status;
  if (status !== 'FIXED_PRICE' && status !== 'INSPECTION_REQUIRED') return invalid();
  if (typeof data.serviceId !== 'string' || !data.serviceId.trim() || typeof data.serviceCode !== 'string' || !data.serviceCode.trim()
    || typeof data.bindingReady !== 'boolean' || !Array.isArray(data.possibleVariants)
    || !Array.isArray(data.missingAttributes) || !data.missingAttributes.every((k) => typeof k === 'string')) return invalid();
  const possibleVariants = data.possibleVariants.map(normalizeVariant);
  const selectedVariant = data.selectedVariant == null ? null : normalizeVariant(data.selectedVariant);
  if ((status === 'FIXED_PRICE') !== (selectedVariant !== null)) return invalid();
  let priceRange: CatalogPricingPreview['priceRange'] = null;
  if (data.priceRange != null) {
    if (!isRecord(data.priceRange)) return invalid();
    const min = positiveInt(data.priceRange.minLaborVnd);
    const max = positiveInt(data.priceRange.maxLaborVnd);
    if (min === null || max === null || min > max) return invalid();
    priceRange = { minLaborVnd: min, maxLaborVnd: max };
  }
  return {
    serviceId: data.serviceId, serviceCode: data.serviceCode, status, bindingReady: data.bindingReady,
    selectedVariant, possibleVariants, missingAttributes: data.missingAttributes as string[], priceRange,
    messageVi: typeof data.messageVi === 'string' ? data.messageVi : '',
  };
}

/** Not allowed (403), absent (404), not enabled (501) or not available yet (503): hide the section and keep the legacy flow. */
export function isCatalogV2PricingUnavailableError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 404 || status === 501 || status === 503;
}

/**
 * The customer must see a current server-confirmed fixed scope or an inspection result BEFORE
 * moving on. Legacy services (no V2 code) and the AI flow are not held up by it.
 */
export function isCatalogV2PreviewReady(args: {
  service: { id: string; code?: string | null } | null;
  preview: CatalogPricingPreview | null;
  selectedVariantCode: string | null;
  isAiFlow: boolean;
}): boolean {
  const { service, preview, selectedVariantCode, isAiFlow } = args;
  if (isAiFlow || !service || !isCatalogV2ServiceCode(service.code)) return true;
  if (!preview || preview.serviceId !== service.id || preview.serviceCode !== service.code) return false;
  if (preview.status === 'FIXED_PRICE') {
    return preview.bindingReady && !!preview.selectedVariant && preview.selectedVariant.variantCode === selectedVariantCode;
  }
  return !preview.bindingReady && selectedVariantCode === null;
}

export const catalogPricingApi = {
  /** Advisory preview; a real binding happens only inside POST /bookings. */
  async getPreview(
    serviceId: string,
    query: BookingDeviceAttributes & { selectedVariantCode?: string } = {},
    signal?: AbortSignal,
  ): Promise<CatalogPricingPreview> {
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params[k] = v as string | number | boolean;
    const res = await apiClient.get(`/services/${encodeURIComponent(serviceId)}/catalog-v2-pricing`, { params, signal });
    return normalizePricingPreview(res.data);
  },
};
