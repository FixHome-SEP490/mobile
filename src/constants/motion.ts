/**
 * Shared Customer motion foundation (presentation-only, packet D1).
 * Pure config/helpers: safe to unit-test without native modules.
 */

/** Standard UI feedback (press, tab, menu): 180-220ms. */
export const MOTION_STANDARD_MS = 200;

/** Card/list transitions: 220-280ms. */
export const MOTION_CARD_MS = 250;

/** Full skeleton pulse cycle: 1100-1400ms. */
export const SKELETON_DURATION_MS = 1200;

/** Skeleton pulse opacity bounds. */
export const SKELETON_MIN_OPACITY = 0.35;
export const SKELETON_MAX_OPACITY = 1;

/** Default skeleton row count for first-adoption Customer lists. */
export const CUSTOMER_SKELETON_ROWS = 4;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Map a 0..1 pulse progress to the skeleton opacity range.
 * Pure helper so the opacity contract is unit-testable.
 */
export function skeletonOpacityAt(progress: number): number {
  const t = clamp01(progress);
  return SKELETON_MIN_OPACITY + (SKELETON_MAX_OPACITY - SKELETON_MIN_OPACITY) * t;
}
