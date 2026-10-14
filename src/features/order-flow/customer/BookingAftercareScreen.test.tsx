import React from 'react';
import { act, create } from 'react-test-renderer';
import { Pressable, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BookingAftercareScreen from './BookingAftercareScreen';

const mockRoute: any = { params: { bookingId: 'booking-one' } };
const mockBooking = { refresh: jest.fn(), prepareCancellation: jest.fn(), submitConfirmation: jest.fn(), cancelConfirmation: jest.fn() };
const mockSupport = { loadList: jest.fn(), loadDetail: jest.fn(), prepare: jest.fn(), submitConfirmation: jest.fn(), cancelConfirmation: jest.fn(), allowedTypes: jest.fn(() => ['other']) };
let mockBookingState: any;
const mockSupportState: any = { phase: 'idle', confirmation: null, message: null, knownActorOpenCount: 0, list: { status: 'ready', data: [] }, detail: { status: 'unloaded' } };
const mockRecovery: any = { kind: 'booking' };
jest.mock('./useBookingAftercare', () => ({ useBookingAftercare: () => ({ booking: mockBooking, support: mockSupport, bookingState: mockBookingState, supportState: mockSupportState, recovery: mockRecovery }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }), useRoute: () => mockRoute }));

const wrap = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><BookingAftercareScreen /></SafeAreaProvider>;

beforeEach(() => {
  mockRoute.params.bookingId = 'booking-one';
  mockRecovery.kind = 'booking';
  mockBookingState = { phase: 'idle', confirmation: null, message: null, booking: { status: 'ready', data: { id: 'booking-one', status: 'PENDING', serviceOrderId: null } } };
});

it('freezes a booking cancellation reason while verifying', async () => {
  mockBookingState.phase = 'verifying'; mockBookingState.confirmation = null;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(wrap()); });
  expect(renderer.root.findByType(TextInput).props.editable).toBe(false);
  await act(async () => renderer.unmount());
});

it('locks booking support fields during confirmation and labels choices for people', async () => {
  mockRecovery.kind = 'matching';
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(wrap()); });
  const createSupport = renderer.root.findAllByType(Pressable).find(node => node.findAllByType(Text).some(text => String(text.props.children).includes('Táº¡o yÃªu cáº§u há»— trá»£')));
  act(() => createSupport?.props.onPress?.());
  mockSupportState.phase = 'confirming'; mockSupportState.confirmation = { operation: 'create' };
  await act(async () => renderer.update(wrap()));
  expect(renderer.root.findAllByType(TextInput).filter(input => ['LÃ½ do há»— trá»£', 'MÃ´ táº£ thÃªm'].includes(input.props.accessibilityLabel)).every(input => input.props.editable === false)).toBe(true);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' }).every(input => input.props.accessibilityState.disabled === true)).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => text.props.children === 'other')).toBe(false);
  await act(async () => renderer.unmount());
});

it('clears cancellation drafts when the real booking target changes', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(wrap()); });
  act(() => renderer.root.findByType(TextInput).props.onChangeText('old booking reason'));
  mockRoute.params.bookingId = 'booking-two';
  mockBookingState = { ...mockBookingState, booking: { status: 'ready', data: { id: 'booking-two', status: 'PENDING', serviceOrderId: null } } };
  await act(async () => renderer.update(wrap()));
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(mockBooking.cancelConfirmation).toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
