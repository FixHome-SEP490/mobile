import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import StopReplaceSheet from './StopReplaceSheet';

const mockList = jest.fn();
const mockRequest = jest.fn();
jest.mock('../api/support-cases.api', () => ({ supportCasesApi: { listMine: (...a: unknown[]) => mockList(...a), requestStopReplace: (...a: unknown[]) => mockRequest(...a) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));
jest.mock('../constants/theme', () => {
  const tone = { bg: '#eee', fg: '#111', text: '#222' };
  return { useAppTheme: () => ({ colors: { primary: '#2563EB', primaryStrong: '#1D4ED8', surface: '#fff', text: '#000', textSecondary: '#666', border: '#ddd', muted: '#999', tone: { danger: tone } } }) };
});

const kase = (over: Record<string, unknown> = {}) => ({ id: 'c1', caseType: 'mid_job_interruption', status: 'open', requestIntent: 'stop_or_replace', serviceOrderId: 'o1', reason: 'Thợ chưa xử lý được lỗi', resolutionReason: null, ...over });
const find = (tree: ReactTestRenderer, testID: string) => tree.root.findAll((n) => n.props.testID === testID)[0];
const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
async function mount() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<StopReplaceSheet orderId="o1" visible onClose={jest.fn()} />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}
const type = async (tree: ReactTestRenderer, value: string) => { await act(async () => { tree.root.findByType(TextInput).props.onChangeText(value); }); };

beforeEach(() => { jest.resetAllMocks(); mockList.mockResolvedValue({ data: [] }); });

it('shows the request already sent and no form to send another', async () => {
  mockList.mockResolvedValue({ data: [kase({ status: 'in_review' })] });
  const tree = await mount();
  expect(text(tree)).toContain('Quản lý đang xem xét');
  expect(find(tree, 'stop-request-send')).toBeUndefined();
});

it('sends a reason of enough length and then shows the request the server holds', async () => {
  mockRequest.mockImplementation(async () => { mockList.mockResolvedValue({ data: [kase()] }); });
  const tree = await mount();
  expect(find(tree, 'stop-request-send').props.disabled).toBe(true);
  await type(tree, 'ngắn');
  expect(find(tree, 'stop-request-send').props.disabled).toBe(true);
  await type(tree, 'Kỹ thuật viên chưa xử lý được lỗi');
  await act(async () => { find(tree, 'stop-request-send').props.onPress(); });
  expect(mockRequest).toHaveBeenCalledWith('o1', 'Kỹ thuật viên chưa xử lý được lỗi');
  expect(text(tree)).toContain('Đã gửi yêu cầu');
});

it('shows a refusal from the server and allows another try', async () => {
  mockRequest.mockRejectedValue({ response: { status: 409, data: { message: 'Đơn đã yêu cầu bàn giao.' } } });
  const tree = await mount();
  await type(tree, 'Kỹ thuật viên chưa xử lý được lỗi');
  await act(async () => { find(tree, 'stop-request-send').props.onPress(); });
  expect(find(tree, 'stop-request-error')).toBeDefined();
  expect(find(tree, 'stop-request-send').props.disabled).toBe(false);
});

it('after a lost answer reads the request back before offering to send again', async () => {
  mockRequest.mockRejectedValue(new Error('timeout'));
  const tree = await mount();
  await type(tree, 'Kỹ thuật viên chưa xử lý được lỗi');
  await act(async () => { find(tree, 'stop-request-send').props.onPress(); });
  expect(find(tree, 'stop-request-send')).toBeUndefined();
  expect(find(tree, 'stop-request-check')).toBeDefined();
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await act(async () => { find(tree, 'stop-request-check').props.onPress(); });
  expect(find(tree, 'stop-request-send')).toBeDefined();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});
