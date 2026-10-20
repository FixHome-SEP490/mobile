import { formatVnd } from './format';

export interface ServicePriceSummary {
  kind: 'fixed_range' | 'inspection_reference' | 'inspection_only';
  minLaborVnd: number | null;
  maxLaborVnd: number | null;
  /** Reference for survey-only services, not an approved minimum. */
  suggestedLaborVnd?: number;
}

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Catalog discovery copy only (same wording as the web): never used for eligibility, totals or the booking payload. */
export function servicePriceSummaryText(summary: ServicePriceSummary | null | undefined): { label: string; caption: string } | null {
  if (!summary) return null;
  const { minLaborVnd: min, maxLaborVnd: max } = summary;
  if (summary.kind === 'fixed_range' && valid(min) && valid(max) && max >= min) {
    return { label: min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`, caption: 'Giá công theo thiết bị/phạm vi' };
  }
  const ref = summary.suggestedLaborVnd ?? min;
  if (summary.kind === 'inspection_reference' && valid(ref)) {
    return { label: `Tham khảo ${formatVnd(ref)}`, caption: 'Thợ khảo sát, báo giá để khách duyệt' };
  }
  return { label: 'Khảo sát & báo giá', caption: '' };
}
