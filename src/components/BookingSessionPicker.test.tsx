import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import BookingSessionPicker from './BookingSessionPicker';
import type { BookingSchedule } from '../utils/booking-session';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('lucide-react-native', () => ({
  Clock: () => null,
  CalendarDays: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  X: () => null,
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
}));

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

  it('keeps quick dates compact and shows a selected date outside the strip', () => {
    let r!: ReturnType<typeof create>;
    const value: BookingSchedule = { mode: 'scheduled', date: '2026-10-28', slot: 'afternoon' };
    act(() => { r = create(<BookingSessionPicker value={value} onChange={jest.fn()} />); });
    expect(new Set(r.root.findAll((n) => /^session-day-/.test(String(n.props.testID))).map((n) => n.props.testID)).size).toBe(6);
    expect(r.root.findByProps({ testID: 'session-days-swipe-hint' }).props.children).toContain('Vuốt ngang để xem thêm ngày');
    expect(byId(r, 'session-selected-day').props.accessibilityState.selected).toBe(true);
    expect(r.root.findAll((n) => n.props.testID === 'session-day-2026-10-28')).toHaveLength(0);
    act(() => r.unmount());
  });

  it('opens the calendar, disables unavailable dates, and selects a valid date without selecting a slot', () => {
    const onChange = jest.fn();
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<BookingSessionPicker value={null} onChange={onChange} />); });
    act(() => byId(r, 'calendar-open').props.onPress());
    const modal = r.root.findByProps({ testID: 'session-calendar-modal' });
    expect(modal.props.visible).toBe(true);
    expect(r.root.findByProps({ testID: 'calendar-weekday-T2' }).props.children).toBe('T2');
    expect(byId(r, 'calendar-date-2026-10-14').props.accessibilityState.disabled).toBe(true);
    expect(byId(r, 'calendar-date-2026-10-29').props.accessibilityState.disabled).toBe(true);
    act(() => byId(r, 'calendar-date-2026-10-29').props.onPress());
    expect(r.root.findByProps({ testID: 'session-calendar-modal' }).props.visible).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    act(() => byId(r, 'calendar-date-2026-10-16').props.onPress());
    expect(r.root.findByProps({ testID: 'session-calendar-modal' }).props.visible).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(byId(r, 'session-day-2026-10-16').props.accessibilityState.selected).toBe(true);
    act(() => r.unmount());
  });

  it('does not invent a date or slot when switching from urgent to scheduled', () => {
    const onChange = jest.fn();
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<BookingSessionPicker value={null} onChange={onChange} />); });
    act(() => byId(r, 'mode-urgent').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'urgent' });
    act(() => byId(r, 'mode-scheduled').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(r.root.findAll((n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityState?.checked === true && String(n.props.testID ?? '').startsWith('session-slot-'))).toHaveLength(0);
    act(() => r.unmount());
  });

  it('refreshes expired sessions when the app returns to the foreground', () => {
    let changeAppState: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
      changeAppState = listener as (state: string) => void;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
    const onChange = jest.fn();
    const value: BookingSchedule = { mode: 'scheduled', date: '2026-10-16', slot: 'morning' };
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<BookingSessionPicker value={value} onChange={onChange} />); });
    expect(byId(r, 'session-slot-morning').props.accessibilityState.disabled).toBe(false);
    act(() => {
      jest.setSystemTime(new Date('2026-10-16T01:00:00Z')); // 08:00 VN
      changeAppState?.('active');
    });
    expect(byId(r, 'session-slot-morning').props.accessibilityState.disabled).toBe(true);
    expect(onChange).toHaveBeenCalledWith(null);
    act(() => r.unmount());
    jest.restoreAllMocks();
  });

  it('keeps month navigation inside the valid upcoming-date range', () => {
    jest.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<BookingSessionPicker value={null} onChange={jest.fn()} />); });
    act(() => byId(r, 'calendar-open').props.onPress());
    expect(byId(r, 'calendar-month-prev').props.accessibilityState.disabled).toBe(true);
    act(() => byId(r, 'calendar-month-next').props.onPress());
    expect(r.root.findByProps({ testID: 'calendar-month-title' }).props.children).toContain('tháng 11');
    expect(byId(r, 'calendar-month-next').props.accessibilityState.disabled).toBe(true);
    act(() => r.unmount());
  });
});
