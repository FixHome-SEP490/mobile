import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SupportCaseCreateScreen, SupportCaseListScreen } from './SupportCaseScreens';

const mockNavigate = jest.fn(); const mockController = { loadList: jest.fn(), loadDetail: jest.fn(), prepare: jest.fn(), submitConfirmation: jest.fn(), cancelConfirmation: jest.fn(), allowedTypes: jest.fn(() => ['other']) };
const mockState: any = { phase: 'idle', confirmation: null, message: null, knownActorOpenCount: 1, openCountSemantics: 'known-actor-created-lower-bound', list: { status: 'ready', data: [{ id: 'actual-case-id', caseType: 'quality', status: 'open' }] }, detail: { status: 'unloaded' } };
jest.mock('./useOrderSupport', () => ({ useOrderSupport: () => ({ controller: mockController, state: mockState, allowedTypes: ['other'] }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }) }));

it('locks support case choices and draft fields while the prepared case awaits confirmation', async () => {
  mockState.phase = 'confirming'; mockState.confirmation = { operation: 'create' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><SupportCaseCreateScreen /></SafeAreaProvider>); });
  expect(renderer.root.findAllByType(TextInput).every(input => input.props.editable === false)).toBe(true);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' }).every(input => input.props.accessibilityState.disabled === true)).toBe(true);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'checkbox' }).every(input => input.props.accessibilityState.disabled === true)).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => text.props.children === 'other')).toBe(false);
  expect(renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('Nội dung khác'))).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => text.props.children === 'Sửa nội dung')).toBe(true);
  await act(async () => renderer.unmount());
});

it('opens the exact returned case ID and labels the actor-known count as a lower bound', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><SupportCaseListScreen /></SafeAreaProvider>); });
  expect(renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('không phải tổng số yêu cầu'))).toBe(true);
  const target = renderer.root.findAllByType(Text).find(text => String(text.props.children).includes('Chất lượng sửa chữa'));
  expect(target).toBeDefined();
  const button = renderer.root.findByProps({ testID: 'support-case-actual-case-id' });
  act(() => button.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('SupportCaseDetail', { caseId: 'actual-case-id' });
  await act(async () => renderer.unmount());
});
