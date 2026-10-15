import { classifyCustomerWalletLink, createPendingWalletRoute } from './customer-wallet-link';

it('only the exact wallet return path is recognised', () => {
  expect(classifyCustomerWalletLink('fixhome://app/wallet')).toBe('wallet-return');
  expect(classifyCustomerWalletLink('fixhome://app/wallet?payment=success&amount=50000000&paymentId=forged')).toBe('wallet-return');
  expect(classifyCustomerWalletLink('fixhome://app/orders?payment=success')).toBe('not-wallet');
  expect(classifyCustomerWalletLink('https://payments.example.test/start')).toBe('not-wallet');
  expect(classifyCustomerWalletLink('not a url')).toBe('not-wallet');
  expect(classifyCustomerWalletLink('fixhome://tech/wallet')).toBe('not-wallet');
});

it('cold pre-auth start queues only the safe destination; flags never grant credit', () => {
  const queue = createPendingWalletRoute();
  expect(queue.offer('fixhome://app/wallet?payment=success&paymentId=forged', { authenticated: false, role: null })).toBe('queued');
  expect(queue.peek()).toBe(true);
  expect(queue.consume({ authenticated: false, role: null })).toBeNull();
  expect(queue.consume({ authenticated: true, role: 'technician' })).toBeNull();
  expect(queue.peek()).toBe(true);
  expect(queue.consume({ authenticated: true, role: 'customer' })).toBe('CustomerWallet');
  expect(queue.peek()).toBe(false);
  expect(queue.consume({ authenticated: true, role: 'customer' })).toBeNull();
});

it('authenticated customer return needs no queue; foreign links are ignored', () => {
  const queue = createPendingWalletRoute();
  expect(queue.offer('https://example.test/other', { authenticated: true, role: 'customer' })).toBe('ignored');
  expect(queue.peek()).toBe(false);
  expect(queue.offer('fixhome://app/wallet', { authenticated: true, role: 'customer' })).toBe('wallet-return');
  expect(queue.peek()).toBe(false);
});
