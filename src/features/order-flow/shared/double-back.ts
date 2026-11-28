import { useAuthStore } from '../../../store/auth.store';

import { goJobsKeepingFlow } from '../navigation/resume-order';

const WINDOW_MS = 500;
let last = 0;

/** A second back within 0.5 s leaves the whole work flow for the technician's Jobs tab; a single back does what the screen asks. */
export function backOrJobs(back: () => void, now = Date.now()): void {
  if (useAuthStore.getState().user?.role !== 'technician') { back(); return; }
  const second = now - last < WINDOW_MS;
  last = second ? 0 : now;
  if (!second) { back(); return; }
  goJobsKeepingFlow();
}
