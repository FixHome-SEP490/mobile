import { looksUntranslated, translateApiMessage } from './api-error-messages'
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

/** Tên người (họ tên, chủ tài khoản ngân hàng): giống `IsPersonName` ở backend. */
export function isPersonName(value: string): boolean {
  return !containsUnsafeText(value) && PERSON_NAME_ALLOWED.test(value);
}

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
/** PO 22/11/2026: a system or unknown failure only ever reads this sentence. */
export const GENERIC_ERROR = 'Có lỗi xảy ra, vui lòng thử lại sau.';
export const NETWORK_ERROR = 'Không có kết nối mạng. Kiểm tra kết nối rồi thử lại.';

/** Codes, HTTP statuses, stack frames and markup never reach the screen, even inside Vietnamese text. */
const TECHNICAL = [
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
  /\bHTTP\s*\d{3}\b/i,
  /status code/i,
  /\bat \S+ \(/,
  /[{}[\]<>]/,
  /\b(TypeError|SyntaxError|ReferenceError|QueryFailedError)\b/,
  /\b(backend|endpoint|token|jwt|payload|uuid|sql|undefined|null|NaN)\b/i,
];
/** 503s that are a known business state with a Vietnamese reason worth showing (gateway not switched on). */
const KNOWN_UNAVAILABLE = new Set(['PAYMENT_PROVIDER_UNAVAILABLE']);
const readable = (text: string, fallback: string) => (TECHNICAL.some((p) => p.test(text)) ? fallback : text);

/**
 * The message a person sees for any failed request: a Vietnamese sentence they can act on,
 * or GENERIC_ERROR / NETWORK_ERROR. The API client stores it as `error.message`.
 */
export function userFacingRequestError(err: unknown): string {
  const e = err as { response?: { status?: unknown }; request?: unknown; isAxiosError?: boolean } | null;
  if (!e || typeof e !== 'object') return GENERIC_ERROR;
  const status = typeof e.response?.status === 'number' ? e.response.status : undefined;
  if (status === undefined) return e.isAxiosError || e.request !== undefined ? NETWORK_ERROR : GENERIC_ERROR;
  return extractApiErrorMessage(err, GENERIC_ERROR);
}

export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status;
  const code = (err as { response?: { data?: { error?: { code?: unknown } } } } | null)?.response?.data?.error?.code;
  if (typeof status === 'number' && status >= 500 && !(typeof code === 'string' && KNOWN_UNAVAILABLE.has(code))) return fallback || GENERIC_ERROR;
  return readable(extractRawApiErrorMessage(err, fallback), fallback);
}

function extractRawApiErrorMessage(err: unknown, fallback: string): string {
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

  // ValidationPipe details are English developer sentences ("phoneNumber must be
  // a valid Vietnamese phone number"); like the web, only a known or Vietnamese
  // sentence reaches the person, otherwise the screen's own fallback does.
  const details = response?.error?.details;
  if (Array.isArray(details) && details.length > 0 && details.every((d) => typeof d === 'string')) {
    const joined = details.join('. ');
    const readable = translateApiMessage(joined) ?? (looksUntranslated(joined) ? null : joined);
    if (readable) return readable;
  }

  const message = response?.error?.message ?? response?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string' && message) {
    // Known English backend sentences become Vietnamese; other English text is a
    // developer message, so the screen's own fallback is clearer.
    return translateApiMessage(message) ?? (looksUntranslated(message) ? fallback : message);
  }

  return fallback;
}

/** Bản sao `HasLetterOrDigit` + `NoUnsafeText` ở backend cho mô tả tự do. */
const TEXT_HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function validateDescriptionText(value: string): string {
  if (containsUnsafeText(value)) return 'Mô tả không được chứa ký tự điều khiển hay ký tự vô hình.';
  if (!TEXT_HAS_LETTER_OR_DIGIT.test(value)) return 'Mô tả cần có chữ hoặc số, không chỉ emoji hay ký hiệu.';
  return '';
}
