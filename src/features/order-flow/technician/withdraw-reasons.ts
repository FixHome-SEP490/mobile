/** Preset reasons a technician picks when leaving an order before arrival (same list as the web). */
export const WITHDRAW_REASONS = [
  'Sự cố phương tiện giao thông trên đường (hỏng xe, va chạm)',
  'Sự cố sức khỏe hoặc gia đình đột xuất',
  'Kẹt xe nghiêm trọng không thể đến kịp giờ hẹn',
  'Không liên lạc được với khách hàng sau nhiều lần gọi',
  'Khách hàng hẹn lại thời gian khác ngoài giờ làm việc',
] as const;
export const WITHDRAW_OTHER = 'Lý do khác';
