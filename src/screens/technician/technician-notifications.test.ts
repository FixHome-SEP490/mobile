import { formatNotificationTime, groupNotificationsByDay, mergeNotificationPage } from './technician-notifications';

const NOW = Date.parse('2026-09-30T07:00:00Z'); // 14:00 30/09/2026 VN

describe('groupNotificationsByDay', () => {
  it('splits today (VN calendar day) from earlier and keeps order', () => {
    const items = [
      { id: 'a', createdAt: '2026-09-30T06:00:00Z' },
      { id: 'b', createdAt: '2026-09-29T20:00:00Z' }, // 03:00 30/09 VN → still today
      { id: 'c', createdAt: '2026-09-29T05:00:00Z' },
      { id: 'd' },
    ];
    const sections = groupNotificationsByDay(items, NOW);
    expect(sections.map((s) => [s.key, s.data.map((i) => i.id)])).toEqual([
      ['today', ['a', 'b']],
      ['earlier', ['c', 'd']],
    ]);
  });

  it('omits empty groups', () => {
    expect(groupNotificationsByDay([], NOW)).toEqual([]);
    expect(groupNotificationsByDay([{ id: 'x', createdAt: '2026-01-01T00:00:00Z' }], NOW).map((s) => s.key)).toEqual(['earlier']);
  });
});

describe('formatNotificationTime', () => {
  it('shows HH:mm today, dd/MM earlier this year, full date across years', () => {
    expect(formatNotificationTime('2026-09-30T06:05:00Z', NOW)).toBe('13:05');
    expect(formatNotificationTime('2026-09-28T06:05:00Z', NOW)).toBe('28/09');
    expect(formatNotificationTime('2025-12-31T06:05:00Z', NOW)).toBe('31/12/2025');
  });
});

describe('mergeNotificationPage', () => {
  it('appends new items and drops ones already loaded', () => {
    const merged = mergeNotificationPage([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }, {}]);
    expect(merged.map((i) => i.id)).toEqual(['1', '2', '3', undefined]);
  });
});
