import { validateSchedule, replaceDaySchedule, timeOffPayload } from './technician-availability';
test('editing one day preserves exact other saved intervals', () => {
  const original = [{ dayOfWeek: 1, startTime: '07:15', endTime: '11:45' }, { dayOfWeek: 1, startTime: '13:15', endTime: '18:45' }, { dayOfWeek: 2, startTime: '09:30', endTime: '17:30' }];
  expect(replaceDaySchedule(original, 2, [{ startTime: '08:00', endTime: '12:00' }])).toEqual([...original.slice(0, 2), { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' }]);
  expect(validateSchedule(original)).toBe('');
});
test.each([
  [{ dayOfWeek: 1, startTime: '25:00', endTime: '26:00' }],
  [{ dayOfWeek: 1, startTime: '12:00', endTime: '08:00' }],
  [{ dayOfWeek: 7, startTime: '08:00', endTime: '12:00' }],
  [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }, { dayOfWeek: 1, startTime: '11:00', endTime: '17:00' }],
])('rejects invalid or overlapping intervals %j', (...slots) => { expect(validateSchedule(slots)).not.toBe(''); });
test('time off preserves existing date payload and validates dates/range', () => {
  expect(timeOffPayload('12/10/2026', '13/10/2026', ' Nghỉ ')).toEqual({ startAt: '2026-10-12T00:00:00', endAt: '2026-10-13T23:59:59', reason: 'Nghỉ' });
  expect(timeOffPayload('31/02/2026', '13/10/2026', '')).toBeNull();
  expect(timeOffPayload('14/10/2026', '13/10/2026', '')).toBeNull();
});
