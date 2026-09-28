import {
  CUSTOMER_SKELETON_ROWS,
  MOTION_CARD_MS,
  MOTION_STANDARD_MS,
  SKELETON_DURATION_MS,
  SKELETON_MAX_OPACITY,
  SKELETON_MIN_OPACITY,
  clamp01,
  skeletonOpacityAt,
} from './motion';

describe('motion foundation (packet D1)', () => {
  it('keeps durations inside the specified ranges', () => {
    expect(MOTION_STANDARD_MS).toBeGreaterThanOrEqual(180);
    expect(MOTION_STANDARD_MS).toBeLessThanOrEqual(220);
    expect(MOTION_CARD_MS).toBeGreaterThanOrEqual(220);
    expect(MOTION_CARD_MS).toBeLessThanOrEqual(280);
    expect(SKELETON_DURATION_MS).toBeGreaterThanOrEqual(1100);
    expect(SKELETON_DURATION_MS).toBeLessThanOrEqual(1400);
  });

  it('keeps skeleton opacity bounds valid', () => {
    expect(SKELETON_MIN_OPACITY).toBeGreaterThan(0);
    expect(SKELETON_MIN_OPACITY).toBeLessThan(SKELETON_MAX_OPACITY);
    expect(SKELETON_MAX_OPACITY).toBeLessThanOrEqual(1);
  });

  it('defaults to 3-4 skeleton rows', () => {
    expect(CUSTOMER_SKELETON_ROWS).toBeGreaterThanOrEqual(3);
    expect(CUSTOMER_SKELETON_ROWS).toBeLessThanOrEqual(4);
  });

  it('clamps progress before mapping to opacity', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.4)).toBeCloseTo(0.4);
    expect(clamp01(2)).toBe(1);
    expect(skeletonOpacityAt(0)).toBeCloseTo(SKELETON_MIN_OPACITY);
    expect(skeletonOpacityAt(1)).toBeCloseTo(SKELETON_MAX_OPACITY);
    expect(skeletonOpacityAt(0.5)).toBeCloseTo(
      (SKELETON_MIN_OPACITY + SKELETON_MAX_OPACITY) / 2,
    );
  });
});
