// src/services/customer-first-run.ts
//
// First-run flag for the Customer native entry flow (role choice -> 3 intro
// slides -> GuestHome). Non-secret UI preference only: stores '1' in
// AsyncStorage under a versioned key. Never stores tokens or credentials.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CUSTOMER_FIRST_RUN_KEY = '@fixhome/customer_first_run_seen_v1';

/** Minimal storage surface so unit tests can inject a fake; production uses AsyncStorage. */
export interface CustomerFirstRunStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memorySeen = false;

/** Test-only reset for the in-memory advance flag. */
export function resetCustomerFirstRunMemory(): void {
  memorySeen = false;
}

/**
 * True when the customer first-run flow was completed before. Failed storage
 * reads default to unseen so the flow still shows; an in-memory advance in
 * this session also counts as seen.
 */
export async function hasSeenCustomerFirstRun(
  storage: CustomerFirstRunStorage = AsyncStorage,
): Promise<boolean> {
  if (memorySeen) return true;
  try {
    return (await storage.getItem(CUSTOMER_FIRST_RUN_KEY)) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the seen flag. A failed write still advances in memory so the
 * current session continues to GuestHome without retry loops.
 */
export async function markCustomerFirstRunSeen(
  storage: CustomerFirstRunStorage = AsyncStorage,
): Promise<void> {
  memorySeen = true;
  try {
    await storage.setItem(CUSTOMER_FIRST_RUN_KEY, '1');
  } catch {
    // In-memory advance already applied; storage will retry next launch.
  }
}
