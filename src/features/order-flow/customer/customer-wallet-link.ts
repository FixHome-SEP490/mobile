import { isCustomerWalletReturn } from './customer-wallet-controller';

export type WalletLinkDecision = 'wallet-return' | 'queued' | 'ignored';

/**
 * Customer-only wallet deep-link gate. Return URLs only ever trigger a
 * GET-only ledger check; query flags (payment/amount/paymentId) are never
 * trusted. Before auth, only the safe destination is queued — never payload.
 */
export function classifyCustomerWalletLink(url: string): 'wallet-return' | 'not-wallet' {
  return isCustomerWalletReturn(url) ? 'wallet-return' : 'not-wallet';
}

export function createPendingWalletRoute() {
  let queued = false;
  return {
    /** Pre-auth cold start: remember the destination, drop everything else. */
    offer(url: string, session: { authenticated: boolean; role: string | null }): WalletLinkDecision {
      if (classifyCustomerWalletLink(url) !== 'wallet-return') return 'ignored';
      if (session.authenticated && session.role === 'customer') return 'wallet-return';
      queued = true;
      return 'queued';
    },
    /** After auth settles: exactly one safe destination, Customer-only. */
    consume(session: { authenticated: boolean; role: string | null }): 'CustomerWallet' | null {
      if (!queued) return null;
      if (!session.authenticated || session.role !== 'customer') return null;
      queued = false;
      return 'CustomerWallet';
    },
    peek(): boolean {
      return queued;
    },
  };
}

export type PendingWalletRoute = ReturnType<typeof createPendingWalletRoute>;
