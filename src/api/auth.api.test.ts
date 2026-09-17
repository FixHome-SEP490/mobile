import { authApi } from './auth.api';
import apiClient from './client';
import { storageService } from '../services/storage.service';
import { UserRole, type UserInfo } from '../types';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../services/storage.service', () => ({
  storageService: {
    setToken: jest.fn(),
    setRefreshToken: jest.fn(),
    getRefreshToken: jest.fn(),
    removeToken: jest.fn(),
    removeRefreshToken: jest.fn(),
  },
}));

const mockedClient = apiClient as unknown as {
  get: jest.Mock;
  post: jest.Mock;
};
const mockedStorage = storageService as unknown as {
  setToken: jest.Mock;
  setRefreshToken: jest.Mock;
  getRefreshToken: jest.Mock;
  removeToken: jest.Mock;
  removeRefreshToken: jest.Mock;
};

const user: UserInfo = {
  id: 'user-1',
  email: 'customer@fixhome.test',
  fullName: 'FixHome Customer',
  role: UserRole.CUSTOMER,
};

describe('authApi', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('does not persist any token, since the backend requires OTP verification first', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          data: {
            message: 'OTP sent',
            email: 'customer@fixhome.test',
            expiresInMinutes: 5,
          },
        },
      });

      const result = await authApi.register({
        fullName: 'FixHome Customer',
        email: 'customer@fixhome.test',
        password: 'Secure123!',
        role: 'customer',
      });

      expect(mockedClient.post).toHaveBeenCalledWith(
        '/auth/register',
        expect.objectContaining({ email: 'customer@fixhome.test' }),
      );
      expect(result).toEqual({
        message: 'OTP sent',
        email: 'customer@fixhome.test',
        expiresInMinutes: 5,
      });
      expect(mockedStorage.setToken).not.toHaveBeenCalled();
      expect(mockedStorage.setRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('verifyRegisterOtp', () => {
    it('verifies the OTP and persists the returned tokens', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          data: {
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
            user,
          },
        },
      });

      const result = await authApi.verifyRegisterOtp('customer@fixhome.test', '123456');

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/verify-register-otp', {
        email: 'customer@fixhome.test',
        otp: '123456',
      });
      expect(result.user).toEqual(user);
      expect(mockedStorage.setToken).toHaveBeenCalledWith('access-1');
      expect(mockedStorage.setRefreshToken).toHaveBeenCalledWith('refresh-1');
    });

    it('propagates a rejected/expired OTP error without touching storage', async () => {
      mockedClient.post.mockRejectedValue({
        response: { data: { message: 'Mã OTP không chính xác' } },
      });

      await expect(
        authApi.verifyRegisterOtp('customer@fixhome.test', '000000'),
      ).rejects.toMatchObject({ response: { data: { message: 'Mã OTP không chính xác' } } });
      expect(mockedStorage.setToken).not.toHaveBeenCalled();
    });
  });

  describe('resendRegisterOtp', () => {
    it('posts the email and returns the resend cooldown', async () => {
      mockedClient.post.mockResolvedValue({
        data: { data: { message: 'OTP resent', resendAvailableAt: '2026-01-01T00:01:00.000Z' } },
      });

      const result = await authApi.resendRegisterOtp('customer@fixhome.test');

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/resend-register-otp', {
        email: 'customer@fixhome.test',
      });
      expect(result.resendAvailableAt).toBe('2026-01-01T00:01:00.000Z');
    });
  });

  describe('forgotPassword', () => {
    it('posts the email and returns the generic confirmation message', async () => {
      mockedClient.post.mockResolvedValue({
        data: { data: { message: 'If the email exists, an OTP was sent' } },
      });

      const result = await authApi.forgotPassword('customer@fixhome.test');

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'customer@fixhome.test',
      });
      expect(result.message).toBe('If the email exists, an OTP was sent');
    });
  });

  describe('resetPassword', () => {
    it('posts email, otp and newPassword', async () => {
      mockedClient.post.mockResolvedValue({
        data: { data: { message: 'Password reset successfully' } },
      });

      const result = await authApi.resetPassword(
        'customer@fixhome.test',
        '123456',
        'NewSecure123!',
      );

      expect(mockedClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        email: 'customer@fixhome.test',
        otp: '123456',
        newPassword: 'NewSecure123!',
      });
      expect(result.message).toBe('Password reset successfully');
    });

    it('propagates an expired-OTP error from the backend', async () => {
      mockedClient.post.mockRejectedValue({
        response: { data: { message: 'Mã OTP đã hết hạn' } },
      });

      await expect(
        authApi.resetPassword('customer@fixhome.test', '123456', 'NewSecure123!'),
      ).rejects.toMatchObject({ response: { data: { message: 'Mã OTP đã hết hạn' } } });
    });
  });
});
