import React from 'react';
import { act, create } from 'react-test-renderer';
import BookingSessionPicker from './BookingSessionPicker';
import type { BookingSchedule } from '../utils/booking-session';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('lucide-react-native', () => ({ Clock: () => null, CalendarDays: () => null }));

const byId = (r: ReturnType<typeof create>, id: string) => r.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];

describe('BookingSessionPicker', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-15T00:00:00Z')); }); // 07:00 VN
  afterEach(() => jest.useRealTimers());

  it('offers both modes and reports a chosen session', () => {
    const onChange = jest.fn();
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<BookingSessionPicker value={null} onChange={onChange} />); });
    act(() => byId(r, 'session-slot-afternoon').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ mode: 'scheduled', date: '2026-10-15', slot: 'afternoon' });
    act(() => byId(r, 'mode-urgent').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'urgent' });
    act(() => r.unmount());
  });

  it('hides the day list for "tới ngay" and keeps the slot when changing day', () => {
    const onChange = jest.fn();
    let r!: ReturnType<typeof create>;
    const value: BookingSchedule = { mode: 'scheduled', date: '2026-10-15', slot: 'afternoon' };
    act(() => { r = create(<BookingSessionPicker value={value} onChange={onChange} />); });
    act(() => byId(r, 'session-day-2026-10-16').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ mode: 'scheduled', date: '2026-10-16', slot: 'afternoon' });
    act(() => r.update(<BookingSessionPicker value={{ mode: 'urgent' }} onChange={onChange} />));
    expect(r.root.findAll((n) => n.props.testID === 'session-slot-morning')).toHaveLength(0);
    act(() => r.unmount());
  });
});
