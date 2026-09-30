import type { TechnicianReview } from '../../api/reviews.api';
import { mergeReviewPage, parseReviewComment, reviewOrderLine, starDistribution } from './technician-reviews';

const r = (id: string, rating = 5) => ({ id, rating }) as TechnicianReview;

describe('parseReviewComment', () => {
  it('splits leading [tags] from the text', () => {
    expect(parseReviewComment('[Đúng giờ, Nhiệt tình] Làm rất tốt')).toEqual({ tags: ['Đúng giờ', 'Nhiệt tình'], text: 'Làm rất tốt' });
    expect(parseReviewComment('[Sạch sẽ]')).toEqual({ tags: ['Sạch sẽ'], text: '' });
  });
  it('keeps plain text and tolerates empty values', () => {
    expect(parseReviewComment(' ok ')).toEqual({ tags: [], text: 'ok' });
    expect(parseReviewComment(null)).toEqual({ tags: [], text: '' });
    expect(parseReviewComment('Xong [rồi]')).toEqual({ tags: [], text: 'Xong [rồi]' });
  });
});

describe('starDistribution', () => {
  it('counts per star with rounded percentages and clamps out-of-range ratings', () => {
    const d = starDistribution([r('1', 5), r('2', 5), r('3', 4), r('4', 9), r('5', 0)]);
    expect(d.map((x) => x.count)).toEqual([3, 1, 0, 0, 1]);
    expect(d[0]).toEqual({ star: 5, count: 3, percent: 60 });
  });
  it('is all zero with no reviews', () => {
    expect(starDistribution([]).every((x) => x.count === 0 && x.percent === 0)).toBe(true);
  });
});

describe('mergeReviewPage', () => {
  it('drops reviews already loaded', () => {
    expect(mergeReviewPage([r('1'), r('2')], [r('2'), r('3')]).map((x) => x.id)).toEqual(['1', '2', '3']);
  });
});

describe('reviewOrderLine', () => {
  it('joins code and service, skipping missing parts', () => {
    expect(reviewOrderLine({ orderCode: 'FH-1', serviceName: 'Sửa điều hòa' })).toBe('Đơn #FH-1 · Sửa điều hòa');
    expect(reviewOrderLine({ orderCode: '', serviceName: 'Sửa điều hòa' })).toBe('Sửa điều hòa');
    expect(reviewOrderLine({ orderCode: '', serviceName: '' })).toBe('');
  });
});
