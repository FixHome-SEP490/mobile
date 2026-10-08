import { keysToServiceAreas, serviceAreasToKeys, toAreaKey } from './technician-onboarding';
import type { ServiceAreaItem } from '../../api/technician-onboarding.api';

export { keysToServiceAreas, serviceAreasToKeys, toAreaKey };

/** Province shown first: the one holding most of the saved areas, else Ho Chi Minh City (79). */
export function initialProvince(keys: string[], fallback = 79): number {
  const counts = new Map<number, number>();
  for (const key of keys) {
    const province = Number(key.split(':')[0]);
    if (Number.isFinite(province)) counts.set(province, (counts.get(province) ?? 0) + 1);
  }
  let best = fallback;
  let max = 0;
  for (const [province, n] of counts) if (n > max) { best = province; max = n; }
  return best;
}

/** True when the selection differs from what is saved, so Save is only offered for real changes. */
export function areasChanged(saved: ServiceAreaItem[], keys: string[]): boolean {
  const before = new Set(serviceAreasToKeys(saved));
  return before.size !== new Set(keys).size || keys.some((k) => !before.has(k));
}
