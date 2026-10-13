import React from 'react';
import { Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianAvailabilityEditor from './TechnicianAvailabilityEditor';
import { technicianProfileApi } from '../../api/technician-profile.api';

jest.mock('../../api/technician-profile.api', () => ({ technicianProfileApi: { getMySchedule: jest.fn(), getMyTimeOff: jest.fn(), updateMySchedule: jest.fn(), createTimeOff: jest.fn(), deleteTimeOff: jest.fn() } }));
jest.mock('../../components/CalendarDateField', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => ReactModule.createElement(Native.TextInput, { accessibilityLabel: label, value, onChangeText: onChange });
});
const api = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const changed = jest.fn();
const leave = { id: 'leave-fixture', startAt: '2026-10-18T00:00:00+07:00', endAt: '2026-10-19T23:59:59+07:00', reason: 'Nghỉ gia đình' };
async function render() { let tree!: ReactTestRenderer; await act(async () => { tree = create(<TechnicianAvailabilityEditor onChanged={changed} />); }); return tree; }
function text(tree: ReactTestRenderer) { return tree.root.findAllByType(Text).map(item => String(item.props.children ?? '')).join('\n'); }
function button(tree: ReactTestRenderer, label: string) { return tree.root.findAllByType(TouchableOpacity).find(item => item.props.accessibilityLabel === label || item.findAllByType(Text).some(value => value.props.children === label))!; }
beforeEach(() => { jest.clearAllMocks(); api.getMySchedule.mockResolvedValue([]); api.getMyTimeOff.mockResolvedValue([]); api.updateMySchedule.mockImplementation(async slots => slots); api.createTimeOff.mockResolvedValue(leave); });

test('empty saved schedule and seven days cause no writes on mount or selection', async () => {
  const tree = await render();
  expect(tree.root.findAllByType(TouchableOpacity).filter(item => String(item.props.accessibilityLabel).startsWith('Khung giờ '))).toHaveLength(7);
  expect(tree.root.findAllByType(ScrollView).some(item => item.props.horizontal)).toBe(false);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  await act(async () => button(tree, 'Khung giờ CN').props.onPress());
  expect(api.updateMySchedule).not.toHaveBeenCalled(); expect(api.createTimeOff).not.toHaveBeenCalled(); expect(api.deleteTimeOff).not.toHaveBeenCalled();
  expect(text(tree)).toContain('Chưa có ngày nghỉ đã khai báo.');
  await act(async () => tree.unmount());
});
test('Sunday remains day 0 and exact Wednesday intervals survive another day edit', async () => {
  const saved = [{ dayOfWeek: 0, startTime: '07:15', endTime: '11:45' }, { dayOfWeek: 3, startTime: '09:30', endTime: '17:30' }];
  api.getMySchedule.mockResolvedValue(saved);
  const tree = await render();
  await act(async () => button(tree, 'Khung giờ CN').props.onPress());
  expect(tree.root.findByProps({ accessibilityLabel: 'Giờ bắt đầu khung 1' }).props.value).toBe('07:15');
  await act(async () => button(tree, 'Sáng 08:00–12:00').props.onPress());
  expect(api.updateMySchedule).not.toHaveBeenCalled();
  await act(async () => button(tree, 'Lưu khung giờ').props.onPress());
  expect(api.updateMySchedule).toHaveBeenCalledWith([saved[1], { dayOfWeek: 0, startTime: '08:00', endTime: '12:00' }]);
  expect(changed).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});
test('preserves multiple existing intervals and blocks invalid exact hours', async () => {
  api.getMySchedule.mockResolvedValue([{ dayOfWeek: 1, startTime: '07:15', endTime: '11:45' }, { dayOfWeek: 1, startTime: '13:15', endTime: '18:45' }]);
  const tree = await render();
  await act(async () => button(tree, 'Khung giờ T2').props.onPress());
  expect(tree.root.findAllByType(TextInput)).toHaveLength(4);
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Giờ kết thúc khung 1' }).props.onChangeText('05:00'));
  await act(async () => button(tree, 'Lưu khung giờ').props.onPress());
  expect(api.updateMySchedule).not.toHaveBeenCalled(); expect(text(tree)).toContain('giờ kết thúc phải sau');
  await act(async () => tree.unmount());
});
test('time off displays only confirmed server data', async () => {
  api.getMyTimeOff.mockResolvedValue([leave]); const tree = await render();
  expect(text(tree)).toContain('Nghỉ gia đình'); expect(api.createTimeOff).not.toHaveBeenCalled(); expect(api.deleteTimeOff).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('failed GET never presents an empty saved list or editable save controls; retry is GET only', async () => {
  api.getMyTimeOff.mockRejectedValueOnce(new Error('offline')); const tree = await render();
  expect(text(tree)).toContain('Không thể tải khung giờ và ngày nghỉ'); expect(text(tree)).not.toContain('Chưa có ngày nghỉ');
  expect(button(tree, 'Lưu khung giờ')).toBeUndefined();
  await act(async () => button(tree, 'Thử lại').props.onPress());
  expect(api.getMyTimeOff).toHaveBeenCalledTimes(2); expect(api.updateMySchedule).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('repeated GET failures retain retry state', async () => {
  api.getMyTimeOff.mockRejectedValue(new Error('offline')); const tree = await render();
  await act(async () => button(tree, 'Thử lại').props.onPress());
  expect(text(tree)).toContain('Không thể tải khung giờ và ngày nghỉ'); expect(text(tree)).not.toContain('Chưa có ngày nghỉ');
  await act(async () => tree.unmount());
});
test('pending GET does not assert empty leave', async () => {
  api.getMyTimeOff.mockImplementation(() => new Promise(() => undefined)); const tree = await render();
  expect(text(tree)).not.toContain('Chưa có ngày nghỉ'); expect(text(tree)).not.toContain('Không thể tải');
  await act(async () => tree.unmount());
});
test('blocks duplicate saves before React renders busy state', async () => {
  api.updateMySchedule.mockImplementation(() => new Promise(() => undefined)); const tree = await render();
  await act(async () => button(tree, 'Khung giờ T2').props.onPress());
  await act(async () => { button(tree, 'Lưu khung giờ').props.onPress(); button(tree, 'Lưu khung giờ').props.onPress(); });
  expect(api.updateMySchedule).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});
test('saves real selected leave dates only on explicit add', async () => {
  const tree = await render();
  await act(async () => button(tree, 'Khai báo ngày nghỉ').props.onPress());
  await act(async () => { tree.root.findByProps({ accessibilityLabel: 'Ngày bắt đầu' }).props.onChangeText('18/10/2026'); tree.root.findByProps({ accessibilityLabel: 'Ngày kết thúc' }).props.onChangeText('19/10/2026'); });
  expect(api.createTimeOff).not.toHaveBeenCalled();
  await act(async () => button(tree, 'Thêm ngày nghỉ').props.onPress());
  expect(api.createTimeOff).toHaveBeenCalledWith({ startAt: '2026-10-18T00:00:00', endAt: '2026-10-19T23:59:59', reason: undefined });
  expect(text(tree)).toContain('Nghỉ gia đình');
  await act(async () => tree.unmount());
});

test('weekday copy is previewed, changes only the draft and preserves both weekend days', async () => {
  const weekend = [{ dayOfWeek: 6, startTime: '09:00', endTime: '10:00' }, { dayOfWeek: 0, startTime: '10:00', endTime: '11:00' }];
  api.getMySchedule.mockResolvedValue(weekend);
  const tree = await render();
  await act(async () => button(tree, 'Khung giờ T2').props.onPress());
  await act(async () => button(tree, 'Sáng 08:00–12:00').props.onPress());
  await act(async () => button(tree, 'Áp dụng T2–T6').props.onPress());
  expect(text(tree)).toContain('Bản xem trước T2–T6');
  expect(api.updateMySchedule).not.toHaveBeenCalled();
  await act(async () => button(tree, 'Xác nhận bản nháp T2–T6').props.onPress());
  expect(api.updateMySchedule).not.toHaveBeenCalled();
  await act(async () => button(tree, 'Lưu khung giờ').props.onPress());
  expect(api.updateMySchedule.mock.calls[0][0]).toEqual(expect.arrayContaining(weekend));
  expect(api.updateMySchedule.mock.calls[0][0].filter(slot => slot.dayOfWeek >= 1 && slot.dayOfWeek <= 5)).toHaveLength(5);
  await act(async () => tree.unmount());
});

test('overlapping intervals are rejected without a write', async () => {
  api.getMySchedule.mockResolvedValue([{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }, { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' }]);
  const tree = await render();
  await act(async () => button(tree, 'Khung giờ T2').props.onPress());
  await act(async () => button(tree, 'Lưu khung giờ').props.onPress());
  expect(api.updateMySchedule).not.toHaveBeenCalled();
  expect(text(tree)).toContain('không được trùng nhau');
  await act(async () => tree.unmount());
});
