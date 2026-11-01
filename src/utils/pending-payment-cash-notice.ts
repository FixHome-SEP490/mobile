/** Never offer a cash fallback while an existing payment may still settle. */
export function pendingPaymentCashNotice(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } } | null)?.response;
  if (response?.status !== 409) return null;
  const message = response.data?.message;
  const reason = Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : '';
  const mentionsPayment = /(giao dịch|thanh toán|payment)/i.test(reason);
  const indicatesPending = /(pending|đang\s+(?:được\s+)?xử lý|chờ\s+(?:xử lý|xác nhận)|đối soát)/i.test(reason);
  if (!mentionsPayment || !indicatesPending) return null;
  return 'Đơn đang có giao dịch thanh toán cần đối soát. Chưa thể chuyển sang tiền mặt lúc này. Hãy kiểm tra trạng thái giao dịch trước khi thanh toán lại để tránh trả hai lần.';
}
