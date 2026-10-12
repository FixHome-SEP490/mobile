import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import BookingSchedulePicker from './BookingSchedulePicker';
import { getBookingDateRange } from '../utils/booking-window';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock('lucide-react-native', () => ({
  CalendarDays: () => null, ChevronDown: () => null, Clock3: () => null, SlidersHorizontal: () => null,
}));
jest.mock('@expo/ui/community/datetime-picker', () => ({
  DateTimePicker: () => null,
}));
const colors = {
  background: '#F8FAFC', border: '#E2E8F0', primary: '#2563EB',
  surface: '#FFFFFF', text: '#0F172A', textSecondary: '#64748B', error: '#DC2626',
};
function day(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}
async function setup() {
  const { minimumDate } = getBookingDateRange();
  const onDateChange = jest.fn();
  const onTimeChange = jest.fn();
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<BookingSchedulePicker colors={colors} date={minimumDate} time="09:00"
      onDateChange={onDateChange} onTimeChange={onTimeChange} />);
  });
  return { renderer, minimumDate, onDateChange, onTimeChange };
}
it('shows four dates and quick times immediately and keeps both open after a choice', async () => {
  const { renderer, minimumDate, onDateChange } = await setup();
  const dateBtn = renderer.root.findAll((n) => typeof n.props.onPress === 'function' &&
    String(n.props.accessibilityLabel).startsWith('Ngày hẹn,'))[0];
  expect(dateBtn).toBeDefined();
  expect(dateBtn.props.accessibilityState.expanded).toBe(true);
  expect(renderer.root.findAll((n) => n.props.accessibilityRole === 'radio').length).toBeGreaterThan(0);
  const grid = renderer.root.findByProps({ testID: 'booking-inline-date-choices' });
  const days = grid.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('Chọn ngày '));
  expect(days).toHaveLength(4);
  expect(days[0].props.accessibilityState.selected).toBe(true);
  await act(async () => { days[2].props.onPress(); });
  expect(onDateChange).toHaveBeenCalledTimes(1);
  const chosen = onDateChange.mock.calls[0][0] as Date;
  expect([chosen.getFullYear(), chosen.getMonth(), chosen.getDate()])
    .toEqual([day(minimumDate, 2).getFullYear(), day(minimumDate, 2).getMonth(), day(minimumDate, 2).getDate()]);
  expect(renderer.root.findByProps({ testID: 'booking-inline-date-choices' })).toBeDefined();
  await act(async () => renderer.unmount());
});

it.each([
  ['9:37', '09:37'], ['0937', '09:37'], ['09:00', '09:00'], ['1600', '16:00'],
  ['08:59', null], ['16:01', null], ['09:60', null], ['abc', null],
])('validates custom start %s against the existing Backend window', async (input, expected) => {
  const { renderer, onTimeChange, onDateChange } = await setup();
  const press = async (label: string) => {
    const button = renderer.root.findAll((node) => typeof node.props.onPress === 'function'
      && String(node.props.accessibilityLabel).startsWith(label))[0];
    expect(button).toBeDefined();
    await act(async () => button.props.onPress());
  };
  await press('Khung giờ dự kiến,');
  await press('Chọn giờ cụ thể');
  await act(async () => renderer.root.findByType(TextInput).props.onChangeText(input));
  await press('Áp dụng giờ cụ thể');
  if (expected) {
    expect(onTimeChange).toHaveBeenCalledTimes(1);
    expect(onTimeChange).toHaveBeenCalledWith(expected);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  } else {
    expect(onTimeChange).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType(Text).some((node) => node.props.accessibilityRole === 'alert')).toBe(true);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(1);
  }
  expect(onDateChange).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
it('preserves four-day Backend limit and never submits on date-selection', async () => {
  const { renderer, onTimeChange, onDateChange } = await setup();
  const date = renderer.root.findAll((n) => typeof n.props.onPress === 'function' &&
    String(n.props.accessibilityLabel).startsWith('Ngày hẹn,'))[0];
  await act(async () => date.props.onPress());
  const choices = renderer.root.findByProps({ testID: 'booking-inline-date-choices' })
    .findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('Chọn ngày '));
  expect(choices.map((n) => n.props.accessibilityLabel)).toHaveLength(4);
  expect(choices.every((n) => n.props.accessibilityState.disabled === false)).toBe(true);
  expect(onDateChange).not.toHaveBeenCalled();
  expect(onTimeChange).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Text).length).toBeGreaterThan(3);
  await act(async () => renderer.unmount());
});
