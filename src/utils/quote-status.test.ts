import { quoteStatusLabel } from './quote-status';

test('every quotation status reads as words, never a raw code', () => {
  expect(quoteStatusLabel('SENT')).toBe('Đã gửi (chờ quyết định)');
  expect(quoteStatusLabel('approved')).toBe('Đã duyệt');
  expect(quoteStatusLabel('REJECTED')).toBe('Đã từ chối');
  expect(quoteStatusLabel('superseded')).toBe('Đã thay bằng báo giá mới');
  expect(quoteStatusLabel('SOMETHING_NEW')).toBe('Không rõ');
  expect(quoteStatusLabel(null)).toBe('Không rõ');
});
