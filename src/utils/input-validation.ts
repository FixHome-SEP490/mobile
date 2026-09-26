// src/utils/input-validation.ts
//
// Bản sao phía client của luật ký tự trong
// `backend/src/shared/validation/text.validators.ts`, giữ giống hệt bản web ở
// `web/src/utils/input-validation.ts`.
//
// Backend vẫn là nơi quyết định cuối cùng; phần này chỉ để người dùng nhận được
// lời nhắc bằng tiếng Việt ngay khi gõ. Sửa luật ở backend thì sửa cả hai bản
// client.

/** Ký tự điều khiển C0/C1. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** Ký tự vô hình và ký tự đảo chiều viết. */
const INVISIBLE_CHARS =
  /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

/** Chữ cái mọi hệ chữ, dấu phụ, khoảng trắng, nháy đơn, gạch nối, dấu chấm. */
const PERSON_NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;

export function containsUnsafeText(value: string): boolean {
  return CONTROL_CHARS.test(value) || INVISIBLE_CHARS.test(value);
}

/** Trả về thông báo lỗi tiếng Việt, hoặc chuỗi rỗng nếu hợp lệ. */
export function validateFullName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Họ tên không được bỏ trống';
  if (trimmed.length < 2) return 'Họ tên tối thiểu 2 ký tự';
  if (trimmed.length > 200) return 'Họ tên tối đa 200 ký tự';
  if (containsUnsafeText(trimmed))
    return 'Họ tên chứa ký tự ẩn không hợp lệ, vui lòng gõ lại';
  if (!PERSON_NAME_ALLOWED.test(trimmed))
    return 'Họ tên chỉ gồm chữ cái, khoảng trắng, dấu nháy, gạch nối và dấu chấm';
  return '';
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Email không được bỏ trống';
  if (trimmed.length > 254) return 'Email tối đa 254 ký tự';
  if (containsUnsafeText(trimmed))
    return 'Email chứa ký tự ẩn không hợp lệ, vui lòng gõ lại';
  if (!EMAIL_SHAPE.test(trimmed)) return 'Email sai định dạng';
  return '';
}

/**
 * Đếm tay thay vì dùng TextEncoder, vì runtime Hermes của React Native không
 * chắc có sẵn API đó.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * bcrypt chỉ đọc 72 byte đầu của mật khẩu, nên phần vượt quá không có tác dụng
 * bảo vệ gì. Đếm theo byte UTF-8 chứ không theo ký tự.
 */
export function validatePassword(value: string): string {
  if (!value) return 'Mật khẩu không được bỏ trống';
  if (value.length < 8) return 'Mật khẩu tối thiểu 8 ký tự';
  if (utf8ByteLength(value) > 72) return 'Mật khẩu quá dài, tối đa 72 byte';
  if (containsUnsafeText(value))
    return 'Mật khẩu chứa ký tự điều khiển không hợp lệ';
  return '';
}

const PHONE_SHAPE = /^0[35789][0-9]{8}$/;

export function validatePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!PHONE_SHAPE.test(trimmed)) return 'SĐT không hợp lệ (VD: 0901234567)';
  return '';
}

/**
 * Lấy thông báo lỗi dễ đọc từ phản hồi của backend.
 *
 * Backend bọc lỗi trong `{ error: { code, message, details } }`. Trước đây màn
 * hình đăng ký đọc `data.message` — khoá đó không tồn tại trong phong bì lỗi,
 * nên mọi lỗi validation đều rơi về câu chung chung và người dùng không biết
 * mình sai chỗ nào.
 */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const response = (
    err as {
      response?: {
        data?: {
          error?: { message?: string; details?: unknown };
          message?: string | string[];
        };
      };
    }
  )?.response?.data;

  const details = response?.error?.details;
  if (Array.isArray(details) && details.length > 0) {
    return details.join('. ');
  }

  const message = response?.error?.message ?? response?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string' && message) return message;

  return fallback;
}
