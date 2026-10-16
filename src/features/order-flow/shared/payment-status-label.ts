const LABELS: Record<string, string> = {
  PAID: 'Đã thanh toán',
  UNPAID: 'Chưa thanh toán',
  REFUNDED: 'Đã hoàn tiền',
};

/** Vietnamese payment status; an unknown server value is never shown as a raw code. */
export const paymentStatusLabel = (status: unknown): string => LABELS[String(status ?? '').toUpperCase()] ?? 'Chưa xác định';
