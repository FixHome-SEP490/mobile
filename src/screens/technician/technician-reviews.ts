// Pure view logic for the technician "Đánh giá từ khách hàng" screen.
import type { TechnicianReview } from '../../api/reviews.api';

/** Customers can send `[tag1, tag2] free text`; split the tags from the text. */
export function parseReviewComment(raw?: string | null): { tags: string[]; text: string } {
  const value = (raw ?? '').trim();
  const match = /^\[(.*?)\]\s*([\s\S]*)$/.exec(value);
  if (!match) return { tags: [], text: value };
  return {
    tags: match[1].split(',').map((t) => t.trim()).filter(Boolean),
    text: match[2].trim(),
  };
}

const clampStar = (rating: number) => Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));

/** Share of loaded reviews per star (5 → 1). Only covers what has been loaded so far. */
export function starDistribution(reviews: Pick<TechnicianReview, 'rating'>[]) {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of reviews) counts[clampStar(r.rating)] += 1;
  const total = reviews.length;
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: counts[star],
    percent: total ? Math.round((counts[star] / total) * 100) : 0,
  }));
}

/** Append a fetched page without duplicating reviews the list already has. */
export function mergeReviewPage(current: TechnicianReview[], page: TechnicianReview[]): TechnicianReview[] {
  const seen = new Set(current.map((r) => r.id));
  return [...current, ...page.filter((r) => !seen.has(r.id))];
}

/** "Đơn #FH-… · Sửa điều hòa", skipping whichever part is missing. */
export function reviewOrderLine(review: Pick<TechnicianReview, 'orderCode' | 'serviceName'>): string {
  const parts = [review.orderCode ? `Đơn #${review.orderCode}` : '', review.serviceName].filter(Boolean);
  return parts.join(' · ');
}
