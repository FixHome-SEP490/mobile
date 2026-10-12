import axios from 'axios';
import { extractApiErrorMessage } from '../../utils/input-validation';

export function loginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && !error.response) {
    return 'Không thể kết nối với FixHome. Kiểm tra kết nối mạng rồi thử lại.';
  }
  return extractApiErrorMessage(error, 'Đăng nhập thất bại. Vui lòng thử lại.');
}
