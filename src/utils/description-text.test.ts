// PO 22/11/2026: a warranty description made only of emoji was accepted.
import { extractApiErrorMessage, GENERIC_ERROR, NETWORK_ERROR, userFacingRequestError, validateDescriptionText } from './input-validation';

describe('validateDescriptionText', () => {
  it('rejects emoji or symbols only, and invisible characters', () => {
    expect(validateDescriptionText('😀😀😀😀😀😀😀😀😀😀')).toContain('chữ hoặc số');
    expect(validateDescriptionText('!!!!????★★')).toContain('chữ hoặc số');
    expect(validateDescriptionText('Máy kêu​ to')).toContain('vô hình');
  });
  it('accepts text, with emoji alongside', () => {
    expect(validateDescriptionText('Máy lạnh chảy nước 😢')).toBe('');
    expect(validateDescriptionText('Lỗi E4')).toBe('');
  });
});

describe('request errors never leak codes or statuses (PO 22/11/2026)', () => {
  const http = (status: number, message: string) => ({ isAxiosError: true, response: { status, data: { error: { message } } } });
  it('reads a system failure as the generic sentence and drops the server wording', () => {
    expect(GENERIC_ERROR).toBe('Có lỗi xảy ra, vui lòng thử lại sau.');
    expect(userFacingRequestError(http(500, 'Lỗi máy chủ nội bộ'))).toBe(GENERIC_ERROR);
    expect(extractApiErrorMessage(http(503, 'Lỗi hệ thống'), 'Không thể tải.')).toBe('Không thể tải.');
  });
  it('keeps a Vietnamese sentence the person can act on, but not codes or English', () => {
    expect(userFacingRequestError(http(400, 'Số điện thoại không hợp lệ'))).toBe('Số điện thoại không hợp lệ');
    expect(userFacingRequestError(http(400, 'phoneNumber must be a string'))).toBe(GENERIC_ERROR);
    expect(userFacingRequestError(http(404, 'Không tìm thấy BOOKING_NOT_FOUND'))).toBe(GENERIC_ERROR);
    expect(userFacingRequestError(http(400, 'Lỗi HTTP 400'))).toBe(GENERIC_ERROR);
  });
  it('names a lost connection plainly', () => {
    expect(userFacingRequestError({ isAxiosError: true, request: {} })).toBe(NETWORK_ERROR);
  });
});
