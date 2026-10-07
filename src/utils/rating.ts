// Điểm đánh giá chỉ hiện khi có lượt đánh giá thật. `backend` gửi `null` cho
// kỹ thuật viên chưa được đánh giá (màn tìm thợ, tổng quan, thu nhập) và hồ sơ
// vẫn để mặc định 0; cả hai đều là "chưa có", không phải 0 sao hay 5 sao.

export const NO_RATING_TEXT = 'Chưa có đánh giá';

const ratingFormat = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Số sao trung bình đáng tin để hiển thị, hoặc `null` khi chưa có đánh giá. */
export function ratingValue(averageRating: unknown, ratingCount: unknown): number | null {
  const count = Number(ratingCount);
  if (!Number.isInteger(count) || count <= 0) return null;
  if (averageRating === null || averageRating === undefined || averageRating === '') return null;
  const average = Number(averageRating);
  if (!Number.isFinite(average) || average < 0 || average > 5) return null;
  return average;
}

/** `4,5` — một chữ số thập phân, dấu phẩy theo `vi-VN`. */
export function formatRating(value: number): string {
  return ratingFormat.format(value);
}

/** `4,5/5 · 12 lượt đánh giá`, hoặc `Chưa có đánh giá`. */
export function ratingSummary(averageRating: unknown, ratingCount: unknown): string {
  const value = ratingValue(averageRating, ratingCount);
  if (value === null) return NO_RATING_TEXT;
  return `${formatRating(value)}/5 · ${Number(ratingCount)} lượt đánh giá`;
}
