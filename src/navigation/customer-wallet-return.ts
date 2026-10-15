import { classifyCustomerWalletLink, createPendingWalletRoute } from '../features/order-flow/customer/customer-wallet-link';

export interface WalletReturnSession {
  authenticated: boolean;
  role: string | null;
}

export interface WalletReturnNav {
  ready: boolean;
  hasWalletRoute: boolean;
  navigate: (name: 'CustomerWallet') => void;
}

export type WalletUrlDecision = 'navigated' | 'queued' | 'ignored';

// Canonical GET-refresh signal only. No raw URL, query flag, payment,
// amount or id payload is ever retained: pre-auth SAFE DESTINATION ONLY,
// drop all flags.
let pendingRefresh = false;
// Deferred safe destination. Cleared only by a successful settle, never by
// an early/unready/non-customer consume attempt.
let pendingDestination = false;
const preauthQueue = createPendingWalletRoute();

/** Canonical wallet GET-refresh signal; single-spend. No payload. */
export function takePendingWalletReturn(): boolean {
  const signal = pendingRefresh;
  pendingRefresh = false;
  return signal;
}

/**
 * Root-connected wallet-return handler. Only the exact Customer wallet path
 * is accepted; every query flag is dropped at the door and only a safe
 * destination is ever produced. Warm authenticated-but-unready returns stay
 * queued and navigate exactly once when ready. No credit, no mutation, no
 * other route.
 */
export function handleWalletUrl(url: string | null | undefined, session: WalletReturnSession, nav: WalletReturnNav): WalletUrlDecision {
  if (!url || classifyCustomerWalletLink(url) !== 'wallet-return') return 'ignored';
  pendingRefresh = true;
  if (session.authenticated && session.role === 'customer' && nav.ready && nav.hasWalletRoute) {
    pendingDestination = false;
    nav.navigate('CustomerWallet');
    return 'navigated';
  }
  if (!(session.authenticated && session.role === 'customer')) preauthQueue.offer(url, session);
  pendingDestination = true;
  return 'queued';
}

/**
 * After auth/navigation settles: navigate exactly once, and only for a
 * CURRENT Customer with ready navigation and a registered route. Early,
 * unready, missing-route or non-customer attempts leave everything held;
 * repeated settles are idempotent.
 */
export function settleWalletQueue(session: WalletReturnSession, nav: WalletReturnNav): boolean {
  if (!pendingDestination && preauthQueue.peek() !== true) return false;
  if (!(session.authenticated && session.role === 'customer' && nav.ready && nav.hasWalletRoute)) return false;
  pendingDestination = false;
  preauthQueue.consume(session);
  nav.navigate('CustomerWallet');
  return true;
}
