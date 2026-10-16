import { periodRange } from './earnings-period';

describe('periodRange', () => {
  // 2026-10-15 05:00 Vietnam (Thursday)
  const now = Date.parse('2026-10-14T22:00:00Z');
  it('day, week (Mon–Sun) and month, current and previous', () => {
    expect(periodRange('day', 0, now)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
    expect(periodRange('day', 1, now)).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(periodRange('week', 0, now)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(periodRange('week', 1, now)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(periodRange('month', 0, now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('month', 10, now)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});
