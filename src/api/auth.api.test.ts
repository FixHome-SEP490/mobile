import { authApi } from './auth.api';
import apiClient from './client';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedClient = apiClient as unknown as {
  get: jest.Mock;
  post: jest.Mock;
};

describe('authApi - OTP and Password Reset', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('posts registration data and returns userId and requireOtpVerification', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          data: {
            userId: 'user-123',
            email: 'test@example.com',
            requireOtpVerification: true,
          },
          message: 'Đăng ký thành công.',
        },
      });

      const res = await authApi.register({
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Nguyen Van A',
        role: 'CUSTOMER',
      });

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Nguyen Van A',
        role: 'CUSTOMER',
      });
      expect(res.requireOtpVerification).toBe(true);
      expect(res.email).toBe('test@example.com');
    });
  });

  describe('verifyRegisterOtp', () => {
    it('sends email and otp and returns accessToken and user', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          data: {
            accessToken: 'token-abc',
            user: { id: 'user-123', email: 'test@example.com', role: 'CUSTOMER' },
          },
        },
      });

      const res = await authApi.verifyRegisterOtp({
        email: 'test@example.com',
        otp: '123456',
      });

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/verify-register-otp', {
        email: 'test@example.com',
        otp: '123456',
      });
      expect(res.accessToken).toBe('token-abc');
      expect(res.user.id).toBe('user-123');
    });
  });

  describe('resendRegisterOtp', () => {
    it('sends email to resend-register-otp endpoint', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          message: 'Mã OTP mới đã được gửi.',
        },
      });

      const res = await authApi.resendRegisterOtp({ email: 'test@example.com' });

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/resend-register-otp', {
        email: 'test@example.com',
      });
      expect(res.message).toBe('Mã OTP mới đã được gửi.');
    });
  });

  describe('forgotPassword', () => {
    it('sends email to forgot-password endpoint', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          message: 'Mã OTP đặt lại mật khẩu đã được gửi đến email.',
        },
      });

      const res = await authApi.forgotPassword({ email: 'test@example.com' });

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'test@example.com',
      });
      expect(res.message).toContain('Mã OTP');
    });
  });

  describe('resetPassword', () => {
    it('sends email, otp, and newPassword to reset-password endpoint', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          message: 'Mật khẩu đã được đặt lại thành công.',
        },
      });

      const res = await authApi.resetPassword({
        email: 'test@example.com',
        otp: '654321',
        newPassword: 'newPassword123',
      });

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        email: 'test@example.com',
        otp: '654321',
        newPassword: 'newPassword123',
      });
      expect(res.message).toContain('thành công');
    });
  });
});
