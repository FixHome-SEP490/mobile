import React from 'react';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import DelayNoticeCard from './DelayNoticeCard';

const mockDecide = jest.fn();
const mockNavigate = jest.fn();
const mockRefresh = jest.fn();
jest.mock('../../../api/orders.api', () => ({ ordersApi: { decideDelay: (...a: unknown[]) => mockDecide(...a) } }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('../runtime/OrderSessionProvider', () => ({ useOptionalOrderSession: () => ({ refresh: mockRefresh }) }));

const order = (delayNotice: object | null, status = 'ACCEPTED') =>
  ({ id: 'o-2', bookingId: 'b-2', status, delayNotice }) as never;
const notice = (decision: string | null = null) => ({ minutes: 90, noticedAt: '2026-10-31T03:00:00Z', decision, reasonCode: 'waiting_parts' });
const render = async (o: never) => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<DelayNoticeCard order={o} />); }); return r; };
const press = async (r: ReturnType<typeof create>, id: string) =>
  act(async () => r.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0].props.onPress());
const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON());
const confirm = (alert: jest.SpyInstance, label: string) =>
  (alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[]).find((b) => b.text === label)!;

beforeEach(() => { jest.clearAllMocks(); mockDecide.mockResolvedValue({}); mockRefresh.mockResolvedValue(undefined); });

it('renders nothing without a notice, and only a reminder once the customer chose to wait', async () => {
  expect((await render(order(null))).toJSON()).toBeNull();
  const r = await render(order(notice('wait')));
  expect(text(r)).toContain('Bạn đã chọn đợi thêm');
  expect(r.root.findAll((n) => n.props.testID === 'delay-choice-cancel')).toHaveLength(0);
});

it('tells the customer the minutes and the reason and offers the three choices', async () => {
  const r = await render(order(notice()));
  expect(text(r)).toContain('90 phút');
  expect(text(r)).toContain('chờ linh kiện');
  for (const id of ['wait', 'switch', 'cancel']) expect(r.root.findAll((n) => n.props.testID === `delay-choice-${id}`).length).toBeGreaterThan(0);
});

it('waiting needs no confirmation and refreshes the order', async () => {
  const r = await render(order(notice()));
  await press(r, 'delay-choice-wait');
  expect(mockDecide).toHaveBeenCalledWith('o-2', 'wait');
  expect(mockRefresh).toHaveBeenCalled();
});

it('cancelling asks first, then sends and refreshes', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await render(order(notice()));
  await press(r, 'delay-choice-cancel');
  expect(mockDecide).not.toHaveBeenCalled();
  await act(async () => confirm(alert, 'Hủy đơn, không mất phí').onPress!());
  expect(mockDecide).toHaveBeenCalledWith('o-2', 'cancel');
  expect(mockRefresh).toHaveBeenCalled();
});

it('choosing another technician asks first, then opens the booking to choose one', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await render(order(notice()));
  await press(r, 'delay-choice-switch');
  await act(async () => confirm(alert, 'Chọn kỹ thuật viên khác').onPress!());
  expect(mockDecide).toHaveBeenCalledWith('o-2', 'switch');
  expect(mockNavigate).toHaveBeenCalledWith('CustomerBookingDetail', { bookingId: 'b-2', released: true });
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('shows the Backend message when the answer is refused and lets the customer try again', async () => {
  mockDecide.mockRejectedValueOnce({ response: { data: { error: { message: 'Bạn đã trả lời thông báo báo trễ này.' } } } });
  const r = await render(order(notice()));
  await press(r, 'delay-choice-wait');
  expect(text(r)).toContain('Bạn đã trả lời thông báo báo trễ này.');
  await press(r, 'delay-choice-wait');
  expect(mockDecide).toHaveBeenCalledTimes(2);
});
