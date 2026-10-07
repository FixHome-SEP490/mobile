import {
  formatNotificationTime,
  groupNotificationsByDay,
  mergeNotificationPage,
  technicianNotificationOrderId,
} from './technician-notifications';

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

describe('technicianNotificationOrderId', () => {
  const ORDER = '3f2c7a9e-1b4d-4c8a-9e2f-5a6b7c8d9e0f';

  it('opens the order of a departure warning', () => {
    expect(
      technicianNotificationOrderId({ referenceType: 'SERVICE_ORDER', referenceId: ORDER }),
    ).toBe(ORDER);
    expect(
      technicianNotificationOrderId({ referenceType: ' service_order ', referenceId: ` ${ORDER} ` }),
    ).toBe(ORDER);
  });

  it('does not guess a destination for other or broken references', () => {
    expect(technicianNotificationOrderId({ referenceType: 'BOOKING', referenceId: ORDER })).toBeNull();
    expect(technicianNotificationOrderId({ referenceType: 'SERVICE_ORDER', referenceId: 'FH-123' })).toBeNull();
    expect(technicianNotificationOrderId({ referenceType: null, referenceId: ORDER })).toBeNull();
    expect(technicianNotificationOrderId({ referenceType: 'SERVICE_ORDER', referenceId: null })).toBeNull();
  });
});
