/** Quotation status in words for customers and technicians alike. */
export function quoteStatusLabel(status: string | null | undefined): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'SENT':
      return 'Đã gửi (chờ quyết định)';
    case 'APPROVED':
      return 'Đã duyệt';
    case 'REJECTED':
      return 'Đã từ chối';
    case 'SUPERSEDED':
      return 'Đã thay bằng báo giá mới';
    case 'EXPIRED':
      return 'Đã hết hạn';
    default:
      return 'Không rõ';
  }
}
