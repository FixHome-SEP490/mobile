import {
  extractApiErrorMessage,
  utf8ByteLength,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhoneNumber,
} from './input-validation'

// Luật ở đây phải khớp với backend
// (`backend/src/modules/auth/auth-input-contract.spec.ts`) và với bản web
// (`web/tests/input-validation.spec.ts`). Lệch một bên là client và server bất
// đồng về cái gì hợp lệ.

describe('validateFullName', () => {
  it.each([
    ['tiếng Việt có dấu', 'Nguyễn Thị Ánh Nguyệt'],
    ['dấu nháy đơn', "Mary O'Brien"],
    ['gạch nối', 'Anne-Marie Dupont'],
    ['dấu chấm', 'Dr. Tran Van B'],
  ])('nhận %s', (_ten, giaTri) => {
    expect(validateFullName(giaTri)).toBe('')
  })

  it.each([
    ['emoji', 'Nguyen 🔥 Van A'],
    ['ký hiệu trang trí', '★☆♠♣'],
    ['thẻ HTML', '<script>alert(1)</script>'],
    ['byte NUL', 'QA\u0000Nguoi Dung'],
    ['zero-width space', 'QA​Nguoi Dung'],
    ['đảo chiều RTL', 'QA‮kcatta‬'],
  ])('chặn %s', (_ten, giaTri) => {
    expect(validateFullName(giaTri)).not.toBe('')
  })

  it('chặn tên rỗng và tên toàn khoảng trắng', () => {
    expect(validateFullName('')).toBe('Họ tên không được bỏ trống')
    expect(validateFullName('    ')).toBe('Họ tên không được bỏ trống')
  })

  it('chặn tên quá 200 ký tự', () => {
    expect(validateFullName('A'.repeat(2000))).toBe('Họ tên tối đa 200 ký tự')
  })
})

describe('validateEmail', () => {
  it('nhận email thường', () => {
    expect(validateEmail('nguoidung@example.com')).toBe('')
  })

  it('chặn zero-width space lẫn trong email', () => {
    expect(validateEmail('nguoi​dung@example.com')).not.toBe('')
  })

  it('chặn email sai định dạng và email quá dài', () => {
    expect(validateEmail('khong-phai-email')).toBe('Email sai định dạng')
    expect(validateEmail(`${'a'.repeat(2000)}@example.com`)).toBe(
      'Email tối đa 254 ký tự',
    )
  })
})

describe('utf8ByteLength', () => {
  // Hermes không chắc có TextEncoder nên hàm này tự đếm; kiểm lại từng bậc.
  it.each([
    ['ASCII 1 byte', 'abc', 3],
    ['chữ có dấu 2 byte', 'é', 2],
    ['chữ Việt 3 byte', 'ế', 3],
    ['emoji 4 byte', '🔥', 4],
  ])('đếm đúng %s', (_ten, giaTri, mongDoi) => {
    expect(utf8ByteLength(giaTri as string)).toBe(mongDoi)
  })
})

describe('validatePassword', () => {
  it('nhận mật khẩu đủ dài trong giới hạn 72 byte', () => {
    expect(validatePassword('TestPass123!')).toBe('')
  })

  it('chặn mật khẩu vượt 72 byte', () => {
    expect(validatePassword(`Aa1!${'x'.repeat(80)}`)).toBe(
      'Mật khẩu quá dài, tối đa 72 byte',
    )
  })

  it('đếm theo byte UTF-8 chứ không theo số ký tự', () => {
    expect(validatePassword('Á1a!'.repeat(20))).toBe(
      'Mật khẩu quá dài, tối đa 72 byte',
    )
  })

  it('chặn byte NUL trong mật khẩu', () => {
    expect(validatePassword('TestPass123!\u0000')).not.toBe('')
  })
})

describe('validatePhoneNumber', () => {
  it('cho phép bỏ trống vì số điện thoại là tuỳ chọn', () => {
    expect(validatePhoneNumber('')).toBe('')
  })

  it('nhận số Việt Nam hợp lệ và chặn số sai', () => {
    expect(validatePhoneNumber('0912345678')).toBe('')
    expect(validatePhoneNumber('12345')).not.toBe('')
    expect(validatePhoneNumber('0'.repeat(2000))).not.toBe('')
  })
})

describe('extractApiErrorMessage', () => {
  it('ưu tiên mảng details của ValidationPipe', () => {
    const err = {
      response: {
        data: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            details: ['email must be a valid email address'],
          },
        },
      },
    }
    expect(extractApiErrorMessage(err, 'du phong')).toBe(
      'email must be a valid email address',
    )
  })

  it('dùng error.message khi không có details', () => {
    const err = {
      response: { data: { error: { message: 'Invalid email or password' } } },
    }
    expect(extractApiErrorMessage(err, 'du phong')).toBe(
      'Invalid email or password',
    )
  })

  it('trả câu dự phòng khi lỗi không có phong bì quen thuộc', () => {
    expect(extractApiErrorMessage(new Error('Network Error'), 'du phong')).toBe(
      'du phong',
    )
    expect(extractApiErrorMessage(undefined, 'du phong')).toBe('du phong')
  })
})
