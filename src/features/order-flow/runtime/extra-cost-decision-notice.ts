// The customer's answer to an extra-cost proposal, kept for a few seconds so the screen the technician is working on can say it.
import { useSyncExternalStore } from 'react';

export const EXTRA_COST_NOTICE_MS = 6000;

export interface ExtraCostDecisionNotice { id: string; orderId: string; approved: boolean }

let current: ExtraCostDecisionNotice | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const get = () => current;

export function clearExtraCostDecision(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (current) { current = null; emit(); }
}

export function showExtraCostDecision(notice: ExtraCostDecisionNotice): void {
  if (timer) clearTimeout(timer);
  current = notice;
  timer = setTimeout(clearExtraCostDecision, EXTRA_COST_NOTICE_MS);
  emit();
}

/** The live notice for this order; it clears itself EXTRA_COST_NOTICE_MS after it arrived. */
export function useExtraCostDecisionNotice(orderId: string | undefined): ExtraCostDecisionNotice | null {
  const notice = useSyncExternalStore(subscribe, get, get);
  return notice && notice.orderId === orderId ? notice : null;
}
