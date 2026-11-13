import { activityCardWhen } from './activity-card-date';

describe('activityCardWhen (M-22)', () => {
  it('shows the appointment, not the day the order was created', () => {
    // FH-20261112-35A2A890: created 12/11, appointment 14/11 09:00 (Vietnam time).
    expect(activityCardWhen('2026-11-14T02:00:00.000Z', '2026-11-12T05:00:00.000Z', 'Gần đây')).toBe('14/11/2026 · 09:00');
  });
  it('falls back to the creation day, then to the given text, when there is no valid appointment', () => {
    expect(activityCardWhen(null, '2026-11-12T05:00:00.000Z', 'Gần đây')).toBe('12/11/2026');
    expect(activityCardWhen('not a date', undefined, 'Gần đây')).toBe('Gần đây');
  });
});
