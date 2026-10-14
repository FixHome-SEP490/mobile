import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OrderExceptionScreen from './OrderExceptionScreen';

const mockController = { canCancel: jest.fn(() => false), prepareCancellation: jest.fn(), submitConfirmation: jest.fn(), cancelConfirmation: jest.fn() };
const mockState: any = { phase: 'idle', result: 'unverified', confirmation: null, message: null };
const mockView = { access: 'current', summary: null };
jest.mock('../aftercare/useOrderException', () => ({ useOrderException: () => ({ controller: mockController, state: mockState, view: mockView }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));

it('keeps cancellation disabled when the frozen controller denies it', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><OrderExceptionScreen /></SafeAreaProvider>); });
  const button = renderer.root.findAllByType(TouchableOpacity).find(node => node.findAllByType(Text).some(text => text.props.children === 'Kiểm tra điều kiện hủy'));
  expect(button?.props.disabled).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('Chỉ có thể hủy'))).toBe(true);
  act(() => button?.props.onPress?.());
  expect(mockController.prepareCancellation).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('freezes the cancellation reason until the user explicitly edits the prepared request', async () => {
  mockState.phase = 'confirming'; mockState.confirmation = { reason: 'Giáº£i thÃ­ch báº£n Ä‘Ã£ xem' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><OrderExceptionScreen /></SafeAreaProvider>); });
  expect(renderer.root.findByType(TextInput).props.editable).toBe(false);
  expect(renderer.root.findAllByType(Text).some(text => text.props.children === 'Sửa nội dung')).toBe(true);
  await act(async () => renderer.unmount());
});
