import { UserRole, type UserInfo } from '../../types';
import {
  customerSecuritySession,
  isSameCustomerSecuritySession,
  validateCustomerPasswordReset,
} from './customer-security';

const user: UserInfo = {
  id: 'customer-1',
  email: 'customer@example.test',
  fullName: 'Customer One',
  role: UserRole.CUSTOMER,
};

describe('customer security helpers', () => {
  it('binds destructive work to the exact authenticated customer generation', () => {
    const snapshot = customerSecuritySession({
      isAuthenticated: true,
      user,
      sessionGeneration: 7,
    });
    expect(snapshot).toEqual({ userId: 'customer-1', generation: 7 });
    expect(isSameCustomerSecuritySession(snapshot!, {
      isAuthenticated: true,
      user,
      sessionGeneration: 7,
    })).toBe(true);
    expect(isSameCustomerSecuritySession(snapshot!, {
      isAuthenticated: true,
      user,
      sessionGeneration: 8,
    })).toBe(false);
    expect(isSameCustomerSecuritySession(snapshot!, {
      isAuthenticated: false,
      user: null,
      sessionGeneration: 8,
    })).toBe(false);
    expect(isSameCustomerSecuritySession(snapshot!, {
      isAuthenticated: true,
      user: { ...user, id: 'customer-2' },
      sessionGeneration: 7,
    })).toBe(false);
  });

  it('rejects non-customer sessions', () => {
    expect(customerSecuritySession({
      isAuthenticated: true,
      user: { ...user, role: UserRole.TECHNICIAN },
      sessionGeneration: 1,
    })).toBeNull();
  });

  it('matches Backend OTP and password boundaries for immediate UX', () => {
    expect(validateCustomerPasswordReset('12345', 'SecurePassword1!', 'SecurePassword1!'))
      .toMatch(/6 số/);
    expect(validateCustomerPasswordReset('123456', 'short1!', 'short1!'))
      .toMatch(/8 ký tự/);
    expect(validateCustomerPasswordReset('123456', 'alllowercase1!', 'alllowercase1!'))
      .toMatch(/chữ hoa/);
    expect(validateCustomerPasswordReset('123456', 'SecurePassword1!', 'different1!A'))
      .toMatch(/không khớp/);
    expect(validateCustomerPasswordReset(
      '123456',
      'Aa1!' + 'é'.repeat(36),
      'Aa1!' + 'é'.repeat(36),
    )).toMatch(/72 byte/);
    expect(validateCustomerPasswordReset('123456', 'SecurePassword1!', 'SecurePassword1!'))
      .toBeNull();
  });
});
