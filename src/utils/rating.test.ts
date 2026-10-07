import { NO_RATING_TEXT, formatRating, ratingSummary, ratingValue } from './rating';

describe('ratingValue', () => {
  it('returns null when the technician has no reviews, whatever the average says', () => {
    expect(ratingValue(0, 0)).toBeNull();
    expect(ratingValue('0.00', 0)).toBeNull();
    expect(ratingValue(5, 0)).toBeNull();
  });

  it('returns null when the backend sends a null or missing average', () => {
    expect(ratingValue(null, 3)).toBeNull();
    expect(ratingValue(undefined, 3)).toBeNull();
    expect(ratingValue('', 3)).toBeNull();
  });

  it('returns null for a missing or invalid count', () => {
    expect(ratingValue(4.5, null)).toBeNull();
    expect(ratingValue(4.5, undefined)).toBeNull();
    expect(ratingValue(4.5, 1.5)).toBeNull();
    expect(ratingValue(4.5, -1)).toBeNull();
  });

  it('rejects an out-of-range or non-numeric average', () => {
    expect(ratingValue(5.1, 2)).toBeNull();
    expect(ratingValue(-0.1, 2)).toBeNull();
    expect(ratingValue('abc', 2)).toBeNull();
  });

  it('accepts real ratings, including the decimal strings the profile sends', () => {
    expect(ratingValue(4.5, 2)).toBe(4.5);
    expect(ratingValue('4.67', '3')).toBe(4.67);
    expect(ratingValue(1, 1)).toBe(1);
  });
});

describe('ratingSummary', () => {
  it('shows "Chưa có đánh giá" instead of an invented score', () => {
    expect(ratingSummary(null, 0)).toBe(NO_RATING_TEXT);
    expect(ratingSummary(0, 0)).toBe('Chưa có đánh giá');
  });

  it('formats a real rating in vi-VN', () => {
    expect(ratingSummary(4.67, 12)).toBe('4,7/5 · 12 lượt đánh giá');
    expect(formatRating(5)).toBe('5,0');
  });
});
