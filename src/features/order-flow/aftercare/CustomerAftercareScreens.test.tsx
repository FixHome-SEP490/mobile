import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CustomerReviewScreen, CustomerWarrantyClaimScreen, CustomerWarrantyScreen, WarrantyClaimCreateScreen } from './CustomerAftercareScreens';

const mockController = { canSubmitReview: jest.fn(() => true), canClaim: jest.fn(() => false), canRespond: jest.fn(() => false),
  prepareReview: jest.fn(), prepareClaim: jest.fn(), prepareResponse: jest.fn(), submitConfirmation: jest.fn(), cancelConfirmation: jest.fn(), loadReview: jest.fn(), loadWarranty: jest.fn(), verify: jest.fn() };
let mockState: any;
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
const mockRoute: any = { params: {} };
jest.mock('../runtime/OrderSessionProvider', () => ({ ...jest.requireActual('../runtime/OrderSessionProvider'), useOrderSession: () => ({ snapshot: { order: { status: 'ready', data: { code: 'FH-01', serviceName: 'Sửa máy giặt' } } } }) }));
jest.mock('../customer/useCustomerAftercare', () => ({ useCustomerAftercare: () => ({ controller: mockController, state: mockState }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack, replace: mockReplace, navigate: jest.fn() }), useRoute: () => mockRoute }));

function pressByText(tree: ReturnType<typeof create>, value: string) {
  const text = tree.root.findAllByType(Text).find(node => node.props.children === value);
  if (!text) throw new Error(`Missing text: ${value}`);
  let pressable: any = text;
  while (pressable && pressable.type !== TouchableOpacity) pressable = pressable.parent;
  if (!pressable || pressable.type !== TouchableOpacity) throw new Error(`${value} is not an accessible button`);
  act(() => pressable.props.onPress?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.params = {};
  mockState = { phase: 'idle', confirmation: null, message: null, review: { status: 'ready', data: null }, coverages: { status: 'unloaded' }, claims: { status: 'unloaded' } };
});

it('keeps review optional and requires a separate prepare step before submission', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><CustomerReviewScreen /></SafeAreaProvider>); });
  pressByText(renderer, 'Để sau');
  expect(mockController.prepareReview).not.toHaveBeenCalled();
  expect(mockController.submitConfirmation).not.toHaveBeenCalled();

  pressByText(renderer, 'Chuẩn bị gửi đánh giá');
  expect(mockController.prepareReview).toHaveBeenCalledWith({ rating: 5 });
  mockState = { ...mockState, phase: 'confirming', confirmation: { operation: 'review-create' } };
  await act(async () => renderer.update(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><CustomerReviewScreen /></SafeAreaProvider>));
  pressByText(renderer, 'Xác nhận gửi đánh giá');
  expect(mockController.submitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('locks the prepared review draft and exposes an explicit edit action', async () => {
  mockState = { ...mockState, phase: 'confirming', confirmation: { operation: 'review-create' } };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><CustomerReviewScreen /></SafeAreaProvider>); });
  expect(renderer.root.findByType(TextInput).props.editable).toBe(false);
  const rating = renderer.root.findAllByProps({ accessibilityRole: 'radio' });
  expect(rating.every(item => item.props.accessibilityState.disabled === true)).toBe(true);
  expect(renderer.root.findAllByType(Text).some(text => text.props.children === 'Sửa nội dung')).toBe(true);
  await act(async () => renderer.unmount());
});

it('clears the warranty claim draft when its coverage target changes', async () => {
  mockRoute.params = { coverageId: 'coverage-one' };
  mockState.coverages = { status: 'ready', data: [{ id: 'coverage-one', status: 'active', note: 'First' }, { id: 'coverage-two', status: 'active', note: 'Second' }] };
  mockState.claims = { status: 'ready', data: [] };
  mockController.canClaim.mockReturnValue(true);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><WarrantyClaimCreateScreen /></SafeAreaProvider>); });
  act(() => renderer.root.findByType(TextInput).props.onChangeText('Old coverage details'));
  mockRoute.params = { coverageId: 'coverage-two' };
  await act(async () => renderer.update(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><WarrantyClaimCreateScreen /></SafeAreaProvider>));
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(mockController.cancelConfirmation).toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('clears the customer response draft when the claim target changes', async () => {
  mockRoute.params = { claimId: 'claim-one' };
  mockState.claims = { status: 'ready', data: [{ id: 'claim-one', status: 'awaiting_customer', description: 'First' }, { id: 'claim-two', status: 'awaiting_customer', description: 'Second' }] };
  mockController.canRespond.mockReturnValue(true);
  let renderer!: ReturnType<typeof create>;
  const screen = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><CustomerWarrantyClaimScreen /></SafeAreaProvider>;
  await act(async () => { renderer = create(screen()); });
  act(() => renderer.root.findByType(TextInput).props.onChangeText('Old claim note'));
  mockRoute.params = { claimId: 'claim-two' };
  await act(async () => renderer.update(screen()));
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(mockController.cancelConfirmation).toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('opens one claim for the whole order on the item covered longest, so the customer never picks labor or part', async () => {
  const day = 86_400_000;
  mockState.coverages = { status: 'ready', data: [
    { id: 'labor', status: 'active', itemDescription: 'Công thay tụ', expiresAt: new Date(Date.now() + 10 * day).toISOString() },
    { id: 'part', status: 'active', itemDescription: 'Tụ khởi động', expiresAt: new Date(Date.now() + 60 * day).toISOString() }] };
  mockState.claims = { status: 'ready', data: [] };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><CustomerWarrantyScreen /></SafeAreaProvider>); });
  expect(mockReplace).toHaveBeenCalledWith('WarrantyClaimCreate', { coverageId: 'part' });
  await act(async () => renderer.unmount());
});

it('shows each item with its own term and caps a long order at three items plus a count', async () => {
  mockRoute.params = { coverageId: 'c0' };
  mockState.coverages = { status: 'ready', data: [
    { id: 'c0', status: 'active', itemDescription: 'Công thay tụ', warrantyDaysSnapshot: 30, expiresAt: '2026-12-05T00:00:00Z' },
    { id: 'c1', status: 'active', itemDescription: 'Tụ khởi động', warrantyDaysSnapshot: 90, expiresAt: '2027-02-03T00:00:00Z' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, status: 'active', itemDescription: `Linh kiện ${i + 3}` }))] };
  mockState.claims = { status: 'ready', data: [] };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><WarrantyClaimCreateScreen /></SafeAreaProvider>); });
  const texts = renderer.root.findAllByType(Text).map(text => String(text.props.children));
  const joined = texts.join('|');
  // Labor keeps its 30 days and the part its 90: never one merged term.
  expect(joined).toContain('Bảo hành 30 ngày');
  expect(joined).toContain('Bảo hành 90 ngày');
  expect(texts).toContain('#FH-01 · Sửa máy giặt');
  expect(texts.some(text => text.includes('Linh kiện 4'))).toBe(false);
  expect(joined).toContain('hạng mục khác');
  await act(async () => renderer.unmount());
});
