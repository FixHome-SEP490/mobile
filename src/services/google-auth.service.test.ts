// Luồng đăng nhập Google phía mobile: mở trình duyệt, đọc kết quả quay về.
//
// Không mở trình duyệt thật, không gọi mạng — expo-web-browser và expo-linking
// đều được thay bằng bản giả.

import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import {
  GoogleSignInCancelled,
  buildAppRedirectUrl,
  startGoogleSignIn,
} from './google-auth.service'

// Nhà máy mock không tham chiếu biến bên ngoài, nhờ vậy jest hoist chúng lên
// trên các dòng import mà không rơi vào vùng chết của `const`.
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(),
  parse: jest.fn(),
}))

jest.mock('../constants', () => ({
  APP_CONFIG: { API_BASE_URL: 'http://10.0.2.2:3000/api/v1' },
}))

const mockOpenAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock
const mockCreateURL = Linking.createURL as jest.Mock
const mockParse = Linking.parse as jest.Mock

const REDIRECT = 'exp://192.168.1.8:8081/--/auth/google'

describe('startGoogleSignIn', () => {
  beforeEach(() => {
    mockOpenAuthSession.mockReset()
    mockCreateURL.mockReset().mockReturnValue(REDIRECT)
    mockParse.mockReset()
  })

  it('địa chỉ quay về sinh lúc chạy, không khai báo cứng', () => {
    expect(buildAppRedirectUrl()).toBe(REDIRECT)
    expect(mockCreateURL).toHaveBeenCalledWith('auth/google')
  })

  it('mở đúng endpoint của backend kèm địa chỉ quay về đã mã hoá', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `${REDIRECT}?code=ma-ban-giao`,
    })
    mockParse.mockReturnValue({ queryParams: { code: 'ma-ban-giao' } })

    const code = await startGoogleSignIn()

    expect(code).toBe('ma-ban-giao')
    const [startUrl, redirectUrl] = mockOpenAuthSession.mock.calls[0]
    // Google không bao giờ nhìn thấy địa chỉ exp://; nó chỉ đi tới backend.
    expect(startUrl).toBe(
      'http://10.0.2.2:3000/api/v1/auth/google/start?redirect=' +
        encodeURIComponent(REDIRECT),
    )
    expect(redirectUrl).toBe(REDIRECT)
  })

  it('người dùng đóng trình duyệt thì báo là huỷ, không phải lỗi', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' })

    await expect(startGoogleSignIn()).rejects.toBeInstanceOf(
      GoogleSignInCancelled,
    )
  })

  it('bấm huỷ ngay trên màn hình Google cũng tính là huỷ', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `${REDIRECT}?error=access_denied`,
    })
    mockParse.mockReturnValue({ queryParams: { error: 'access_denied' } })

    await expect(startGoogleSignIn()).rejects.toThrow(/huỷ/)
  })

  it('chuyển nguyên lý do nghiệp vụ mà backend gửi về', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `${REDIRECT}?error=Account+is+locked+or+suspended`,
    })
    mockParse.mockReturnValue({
      queryParams: { error: 'Account is locked or suspended' },
    })

    await expect(startGoogleSignIn()).rejects.toThrow(
      'Account is locked or suspended',
    )
  })

  it('quay về mà thiếu mã thì báo lỗi rõ ràng', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: REDIRECT })
    mockParse.mockReturnValue({ queryParams: {} })

    await expect(startGoogleSignIn()).rejects.toThrow(
      /Không nhận được mã đăng nhập/,
    )
  })
})
