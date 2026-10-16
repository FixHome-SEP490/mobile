import { vnDateTimeString } from './vn-time';

/**
 * English sentences the backend returns in the booking / order flow, in the
 * words a customer or technician can act on (same idea as the web's
 * user-facing-error). Looked up ignoring case and a trailing full stop.
 */
const TRANSLATIONS: Record<string, string> = {
  'email is already registered': 'Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.',
  'phone number is already registered': 'Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.',
  'invalid email or password': 'Email, số điện thoại hoặc mật khẩu không đúng.',
  'account is locked or suspended': 'Tài khoản đang bị khoá hoặc tạm ngưng. Vui lòng liên hệ FixHome để được hỗ trợ.',
  'technician account is inactive': 'Tài khoản kỹ thuật viên đang tạm ngưng hoạt động.',
  'booking not found': 'Không tìm thấy yêu cầu đặt lịch này.',
  'order not found': 'Không tìm thấy đơn sửa chữa này.',
  'order not found or access denied': 'Không tìm thấy đơn sửa chữa này.',
  'invitation expired': 'Lời mời đã hết hạn.',
  'invitation is no longer active': 'Lời mời này không còn hiệu lực.',
  'invitation is no longer assigned to this technician': 'Lời mời này không còn dành cho bạn.',
  'invitation group is unavailable': 'Vòng mời này đã kết thúc.',
  'invitation group is no longer live': 'Vòng mời này đã kết thúc.',
  'invitation group extension already used': 'Bạn đã gia hạn một lần rồi, không thể gia hạn thêm.',
  'no durable live invitation group': 'Hiện không có lời mời nào đang chờ để gia hạn.',
  'booking already assigned': 'Yêu cầu này đã có kỹ thuật viên nhận.',
  'booking cannot be shortlisted': 'Không thể chọn thợ cho yêu cầu này ở trạng thái hiện tại.',
  'booking cannot be rescheduled': 'Không thể đổi lịch cho yêu cầu này ở trạng thái hiện tại.',
  'booking has no live matching round': 'Yêu cầu này chưa có vòng mời nào đang chờ.',
  'current matching round is still active': 'Vòng mời hiện tại vẫn đang chờ thợ phản hồi.',
  'select 1 or 2 distinct technicians in priority order': 'Hãy chọn 1 hoặc 2 kỹ thuật viên khác nhau theo thứ tự ưu tiên.',
  'preferred arrival window cannot extend this matching round': 'Khung giờ hẹn không còn đủ để gia hạn thời gian chờ thợ.',
  'order already has an active technician': 'Đơn này đã có kỹ thuật viên phụ trách.',
  'order must be en_route': 'Bạn cần bắt đầu di chuyển trước khi thực hiện bước này.',
  'order must be under_repair': 'Đơn cần ở trạng thái đang sửa chữa để thực hiện bước này.',
  'illegal order transition': 'Đơn không thể chuyển sang bước này ở trạng thái hiện tại.',
  'invalid gps coordinates': 'Vị trí GPS không hợp lệ. Vui lòng thử lại.',
  'valid arrival required': 'Bạn cần check-in đã được xác minh tại địa chỉ của khách trước.',
  'valid arrival required before before evidence': 'Bạn cần check-in đã được xác minh tại địa chỉ của khách trước khi chụp ảnh trước sửa.',
  'approved quotation required': 'Cần khách duyệt báo giá trước khi thực hiện bước này.',
  'approved official quotation required': 'Cần khách duyệt báo giá trước khi thực hiện bước này.',
  'verified payment is required': 'Cần xác nhận thanh toán trước khi thực hiện bước này.',
  'technician completion request required': 'Kỹ thuật viên cần gửi yêu cầu hoàn thành trước.',
  'evidence limit exceeded': 'Đã đạt số ảnh tối đa cho bước này.',
  'evidence timestamp cannot be in the future': 'Thời gian chụp ảnh không hợp lệ. Hãy kiểm tra ngày giờ của điện thoại.',
  'evidence timing is invalid': 'Thời gian chụp ảnh không hợp lệ. Hãy kiểm tra ngày giờ của điện thoại.',
  'evidence not found': 'Không tìm thấy ảnh này.',
  'cannot delete evidence after completion requested': 'Không thể xóa ảnh sau khi đã gửi yêu cầu hoàn thành.',
  'cancellation reason required': 'Vui lòng nhập lý do hủy.',
  'repair already started or order closed': 'Đơn đã bắt đầu sửa chữa hoặc đã đóng, không thể thực hiện bước này.',
  'repair address has no verified coordinates': 'Địa chỉ sửa chữa chưa có tọa độ đã xác minh. Vui lòng cập nhật địa chỉ.',
  'repair address coordinates are required': 'Địa chỉ sửa chữa chưa có tọa độ đã xác minh. Vui lòng cập nhật địa chỉ.',
  'service not found or inactive': 'Dịch vụ này không còn hoạt động.',
  'service fixed price is not configured': 'Dịch vụ này chưa có giá cố định. Vui lòng chọn dịch vụ khác hoặc liên hệ hỗ trợ.',
  'pending financial approval': 'Đang chờ duyệt tài chính, vui lòng thử lại sau.',
  'during repair, request service manager exception handling': 'Đơn đang sửa chữa. Vui lòng tạo yêu cầu hỗ trợ để quản lý dịch vụ xử lý.',
  'cancel the assigned serviceorder instead': 'Yêu cầu đã có đơn sửa chữa. Hãy hủy ở đơn sửa chữa.',
};

/** Vietnamese for a known backend sentence, else null. */
export function translateApiMessage(message: string): string | null {
  const suspended = /^account suspended until (\S+)$/i.exec(message.trim());
  if (suspended) {
    const until = Date.parse(suspended[1]);
    return Number.isFinite(until)
      ? `Tài khoản tạm thời bị hạn chế đến ${vnDateTimeString(until)} do điểm uy tín thấp.`
      : 'Tài khoản tạm thời bị hạn chế do điểm uy tín thấp.';
  }
  return TRANSLATIONS[message.trim().replace(/\.$/, '').toLowerCase()] ?? null;
}

const VIETNAMESE_LETTER = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** True when the text is not Vietnamese, so it is likely a developer sentence. */
export const looksUntranslated = (message: string) => !VIETNAMESE_LETTER.test(message);
