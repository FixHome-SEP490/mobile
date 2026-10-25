import { useSyncExternalStore } from 'react';

// The customer reviews the technician's handover before being asked to pay. In memory on purpose:
// after a restart seeing the handover once more is harmless, and the Backend never needs this fact.
const seen = new Set<string>();
const listeners = new Set<() => void>();

/** One key per order and handover request, so a handover sent again is reviewed again. */
export const handoverSeenKey = (orderId: string, completionRequestedAt?: string | null) => `${orderId}|${completionRequestedAt ?? ''}`;

export function markHandoverSeen(key: string) {
  if (!key || seen.has(key)) return;
  seen.add(key);
  listeners.forEach(listener => listener());
}

export function resetHandoverSeen() {
  seen.clear();
  listeners.forEach(listener => listener());
}

export function useHandoverSeen(key: string) {
  const read = () => seen.has(key);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, read, read);
}
