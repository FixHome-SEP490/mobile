import { UserRole, type UserInfo } from '../../types';
import { validatePassword } from '../../utils/input-validation';

const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export interface CustomerSecuritySessionSnapshot {
  userId: string;
  generation: number;
}

export function customerSecuritySession(
  state: {
    isAuthenticated: boolean;
    user: UserInfo | null;
    sessionGeneration: number;
  },
): CustomerSecuritySessionSnapshot | null {
  if (
    !state.isAuthenticated
    || !state.user
    || state.user.role !== UserRole.CUSTOMER
  ) {
    return null;
  }
  return {
    userId: state.user.id,
    generation: state.sessionGeneration,
  };
}

export function isSameCustomerSecuritySession(
  expected: CustomerSecuritySessionSnapshot,
  state: {
    isAuthenticated: boolean;
    user: UserInfo | null;
    sessionGeneration: number;
  },
): boolean {
  const current = customerSecuritySession(state);
  return Boolean(
    current
    && current.userId === expected.userId
    && current.generation === expected.generation,
  );
}

export function validateCustomerPasswordReset(
  otp: string,
  password: string,
  confirmPassword: string,
): string | null {
  if (!/^[0-9]{6}$/.test(otp.trim())) {
    return 'Vui lòng nhập đủ 6 số của mã OTP.';
  }

  const baseError = validatePassword(password);
  if (baseError) return baseError;

  if (!PASSWORD_COMPLEXITY.test(password)) {
    return 'Mật khẩu cần ít nhất: chữ hoa, chữ thường, số và ký tự đặc biệt.';
  }

  if (password !== confirmPassword) {
    return 'Mật khẩu xác nhận không khớp.';
  }

  return null;
}
