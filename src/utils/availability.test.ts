import { availabilityText } from './availability';

const now = new Date('2026-10-09T03:00:00Z'); // 10:00 Fri 09/10 in Vietnam

describe('availabilityText', () => {
  it('says what the switch means right now', () => {
    expect(availabilityText({ state: 'receiving', receiving: true, until: '2026-10-09T10:00:00Z', nextStartAt: null }, now))
      .toEqual({ title: 'Đang nhận việc', detail: 'Theo lịch tới 17:00', receiving: true });
    expect(availabilityText({ state: 'off_hours', receiving: false, until: null, nextStartAt: '2026-10-09T23:30:00Z' }, now).detail)
      .toBe('Tự nhận việc lại lúc 06:30 T7 10/10');
    expect(availabilityText({ state: 'off_hours', receiving: false, until: null, nextStartAt: '2026-10-09T10:30:00Z' }, now).detail)
      .toBe('Tự nhận việc lại lúc 17:30 hôm nay');
    expect(availabilityText({ state: 'no_schedule', receiving: false, until: null, nextStartAt: null }, now).title).toBe('Chưa đặt lịch làm');
  });
});
