import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TechnicianWarrantyTaskScreen } from './TechnicianWarrantyScreens';

const mockRoute: any = { params: { claimId: 'assigned-claim-id' } };
const mockController = { availableCommands: jest.fn((): string[] => []), authorizedEvidenceRefs: jest.fn(() => []), refreshClaim: jest.fn(), cancelConfirmation: jest.fn(), submitConfirmation: jest.fn(), prepare: jest.fn() };
const mockState: any = { phase: 'idle', access: 'assigned', task: 'TW06', selectedClaimId: 'assigned-claim-id', confirmation: null, message: null, inbox: { status: 'unloaded' }, claim: { status: 'ready', data: { id: 'assigned-claim-id', status: 'resolved', description: 'Kiểm tra lại thiết bị', order: { id: 'order-id', code: 'FH-01', serviceName: 'Sửa máy', addressSummary: 'Quận 1', customerName: 'Khách hàng' }, coverage: null, visit: null } } };
jest.mock('./useTechnicianWarranty', () => ({ useTechnicianWarranty: () => ({ controller: mockController, state: mockState }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }), useRoute: () => mockRoute }));

beforeEach(() => {
  mockRoute.params = { claimId: 'assigned-claim-id' };
  mockState.phase = 'idle'; mockState.task = 'TW06'; mockState.confirmation = null; mockController.availableCommands.mockReturnValue([]);
});

it('shows a read-only waiting state without technician approval or close actions', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>); });
  expect(renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('Màn này chỉ đọc'))).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => /Duyệt|Đóng yêu cầu/.test(String(text.props.children)))).toBe(false);
  expect(mockController.availableCommands).toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('places check-in preparation in the fixed footer', async () => {
  mockState.task = 'TW03'; mockState.phase = 'idle'; mockController.availableCommands.mockReturnValue(['check-in']);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>); });
  const footer = renderer.root.findByProps({ testID: 'order-flow-fixed-footer' });
  expect(footer.findAllByType(TouchableOpacity).some(button => button.props.testID === 'technician-warranty-primary-action')).toBe(true);
  await act(async () => renderer.unmount());
});

it('locks technician inputs and exposes edit while confirmation is pending', async () => {
  mockState.task = 'TW04'; mockState.phase = 'confirming'; mockState.confirmation = { operation: 'propose' }; mockController.availableCommands.mockReturnValue(['propose']);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>); });
  expect(renderer.root.findAllByType(TextInput).every(input => input.props.editable === false)).toBe(true);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' }).every(input => input.props.accessibilityState.disabled === true)).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => text.props.children === 'Sửa nội dung')).toBe(true);
  await act(async () => renderer.unmount());
});

it('places acceptance and decline in the fixed footer for an assigned claim', async () => {
  mockState.task = 'TW02'; mockController.availableCommands.mockReturnValue(['accept', 'decline']);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>); });
  const footer = renderer.root.findByProps({ testID: 'order-flow-fixed-footer' });
  const buttons = footer.findAllByType(TouchableOpacity);
  expect(buttons.some(button => button.props.testID === 'technician-warranty-primary-action')).toBe(true);
  expect(buttons.some(button => button.props.testID === 'technician-warranty-secondary-action')).toBe(true);
  await act(async () => renderer.unmount());
});

it('clears technician drafts when the assigned claim ID changes', async () => {
  mockState.task = 'TW05'; mockController.availableCommands.mockReturnValue(['complete']);
  let renderer!: ReturnType<typeof create>;
  const screen = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>;
  await act(async () => { renderer = create(screen()); });
  act(() => renderer.root.findByType(TextInput).props.onChangeText('Old claim completion note'));
  mockRoute.params = { claimId: 'other-assigned-claim' };
  await act(async () => renderer.update(screen()));
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(mockController.cancelConfirmation).toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
