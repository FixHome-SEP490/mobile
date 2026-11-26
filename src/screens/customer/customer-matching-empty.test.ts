import { matchingEmptyView } from './customer-matching-empty';

describe('matchingEmptyView', () => {
  it('sends an address outside the area to a rebook, keeping a way back to the request', () => {
    const view = matchingEmptyView('OUTSIDE_COVERAGE', false);
    expect(view.actionKind).toBe('rebook');
    expect(view.secondaryAction).toBe('Xem yêu cầu');
    expect(matchingEmptyView('OUTSIDE_COVERAGE', true).description).toContain('lượt sửa này');
  });

  it('uses visit wording for a multi-device visit and the plain wording otherwise', () => {
    expect(matchingEmptyView('BOOKING_LOCATION_MISSING', true).description.startsWith('Lượt sửa')).toBe(true);
    expect(matchingEmptyView('BOOKING_LOCATION_MISSING', false).action).toBe('Xem yêu cầu');
  });

  it('falls back to the generic copy for no reason or an unavailable one', () => {
    for (const reason of [null, 'UNAVAILABLE'] as const) {
      const view = matchingEmptyView(reason, false);
      expect(view.title).toBe('Chưa có kỹ thuật viên phù hợp');
      expect(view.actionKind).toBe('detail');
    }
  });
});
