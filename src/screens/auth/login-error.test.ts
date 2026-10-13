import { loginErrorMessage } from './login-error';
test('network failure differs from rejected credentials without exposing details', () => {
  expect(loginErrorMessage({ isAxiosError: true, code: 'ERR_NETWORK', message: 'private URL' })).toContain('Không thể kết nối');
  expect(loginErrorMessage({ isAxiosError: true, response: { status: 401, data: { error: { message: 'Email hoặc mật khẩu không đúng.' } } } })).toBe('Email hoặc mật khẩu không đúng.');
});
