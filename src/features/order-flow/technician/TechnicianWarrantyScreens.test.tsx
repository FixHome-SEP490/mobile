import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TechnicianWarrantyTaskScreen } from './TechnicianWarrantyScreens';
import { technicianWarrantyApi } from '../../../api/technician-warranty.api';

jest.mock('../../../api/technician-warranty.api', () => ({ technicianWarrantyApi: { returnFaultyPart: jest.fn().mockResolvedValue(undefined) } }));

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

it('shows the deadline for the faulty part and reports it back once, then refreshes the claim', async () => {
  const PART_ID = '44444444-4444-4444-8444-444444444444';
  mockState.claim.data.partRequest = { id: PART_ID, status: 'received', faultyReturnDueAt: '2099-01-01T00:00:00.000Z', faultyReturnedAt: null, faultyReturnChargedAt: null, faultyInspectionResult: null };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>); });
  const texts = () => renderer.root.findAllByType(Text).map(text => String(text.props.children));
  expect(texts().some(text => text.includes('Nộp linh kiện hỏng về kho'))).toBe(true);
  expect(texts().some(text => text.includes('Hạn nộp'))).toBe(true);

  const button = renderer.root.findAll(node => node.props.accessibilityLabel === 'Đã nộp linh kiện hỏng')[0];
  await act(async () => { await button.props.onPress(); });

  expect(technicianWarrantyApi.returnFaultyPart).toHaveBeenCalledWith(PART_ID);
  expect(mockController.refreshClaim).toHaveBeenCalled();
  mockState.claim.data.partRequest = undefined;
  await act(async () => renderer.unmount());
});

it('names the faulty part lines for a part fault and keeps the proposal disabled until one is picked', async () => {
  mockState.task = 'TW04'; mockController.availableCommands.mockReturnValue(['propose']);
  mockState.claim.data.order.partLines = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Tụ khởi động', quantity: 2, partSource: 'fixhome' }];
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianWarrantyTaskScreen /></SafeAreaProvider>); });
  const pickPart = renderer.root.findAll(node => node.props.accessibilityRole === 'radio' && node.findAllByType(Text).some(text => String(text.props.children).includes('Bảo hành linh kiện')))[0];
  act(() => pickPart.props.onPress());
  expect(renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('Linh kiện nào bị hỏng?'))).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('Tụ khởi động'))).toBe(true);
  mockState.claim.data.order.partLines = undefined;
  await act(async () => renderer.unmount());
});
