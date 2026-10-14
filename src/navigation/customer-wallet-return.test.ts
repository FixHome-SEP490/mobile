import {
  handleWalletUrl,
  settleWalletQueue,
  takePendingWalletReturn,
  type WalletReturnNav,
  type WalletReturnSession,
} from './customer-wallet-return';

const RETURN_URL = 'fixhome://app/wallet?payment=success&amount=50000000&paymentId=return-1';

function sessionFor(authenticated: boolean, role: string | null): WalletReturnSession {
  return { authenticated, role };
}

function navFor(overrides: Partial<WalletReturnNav> = {}): WalletReturnNav & { calls: string[] } {
  const calls: string[] = [];
  return {
    ready: true, hasWalletRoute: true,
    navigate: (name: 'CustomerWallet') => { calls.push(name); },
    ...overrides, calls,
  };
}

it('foreign links are ignored and never stored', () => {
  const nav = navFor();
  expect(handleWalletUrl('fixhome://app/orders?payment=success', sessionFor(true, 'customer'), nav)).toBe('ignored');
  expect(handleWalletUrl(null, sessionFor(true, 'customer'), nav)).toBe('ignored');
  expect(nav.calls).toEqual([]);
  expect(takePendingWalletReturn()).toBe(false);
});

it('cold pre-auth return queues the safe destination without consuming early', () => {
  const nav = navFor();
  expect(handleWalletUrl(RETURN_URL, sessionFor(false, null), nav)).toBe('queued');
  expect(nav.calls).toEqual([]);
  expect(settleWalletQueue(sessionFor(false, null), nav)).toBe(false);
  expect(nav.calls).toEqual([]);
  // Non-customer auth never navigates and never consumes the destination.
  expect(settleWalletQueue(sessionFor(true, 'technician'), nav)).toBe(false);
  expect(nav.calls).toEqual([]);
  // Still held: the Customer settle navigates exactly once afterwards.
  expect(settleWalletQueue(sessionFor(true, 'customer'), nav)).toBe(true);
  expect(nav.calls).toEqual(['CustomerWallet']);
  expect(settleWalletQueue(sessionFor(true, 'customer'), nav)).toBe(false);
  expect(nav.calls).toEqual(['CustomerWallet']);
});

it('warm authenticated return navigates immediately through the root handler', () => {
  const nav = navFor();
  expect(handleWalletUrl(RETURN_URL, sessionFor(true, 'customer'), nav)).toBe('navigated');
  expect(nav.calls).toEqual(['CustomerWallet']);
});

it('warm unready stays queued, then navigates exactly once when ready', () => {
  const unready = navFor({ ready: false });
  expect(handleWalletUrl(RETURN_URL, sessionFor(true, 'customer'), unready)).toBe('queued');
  expect(unready.calls).toEqual([]);
  // Early settle while unready consumes nothing.
  expect(settleWalletQueue(sessionFor(true, 'customer'), unready)).toBe(false);
  expect(unready.calls).toEqual([]);
  const ready = navFor();
  expect(settleWalletQueue(sessionFor(true, 'customer'), ready)).toBe(true);
  expect(ready.calls).toEqual(['CustomerWallet']);
  expect(settleWalletQueue(sessionFor(true, 'customer'), ready)).toBe(false);
});

it('missing route holds, then registered route resolves once', () => {
  const missing = navFor({ hasWalletRoute: false });
  expect(handleWalletUrl(RETURN_URL, sessionFor(true, 'customer'), missing)).toBe('queued');
  expect(missing.calls).toEqual([]);
  expect(settleWalletQueue(sessionFor(true, 'customer'), missing)).toBe(false);
  const registered = navFor({ hasWalletRoute: true });
  expect(settleWalletQueue(sessionFor(true, 'customer'), registered)).toBe(true);
  expect(registered.calls).toEqual(['CustomerWallet']);
});

it('only a canonical boolean signal is retained; flags are never kept', () => {
  const nav = navFor({ ready: false });
  handleWalletUrl('fixhome://app/wallet?payment=success&amount=1&paymentId=x', sessionFor(false, null), nav);
  expect(takePendingWalletReturn()).toBe(true);
  // Single-spend: nothing leaks to a second consumer.
  expect(takePendingWalletReturn()).toBe(false);
});
