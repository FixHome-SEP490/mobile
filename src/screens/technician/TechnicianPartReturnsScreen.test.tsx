import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TechnicianPartReturnsScreen from './TechnicianPartReturnsScreen';

const mockNavigate = jest.fn();
const mockListMine = jest.fn();
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }), useFocusEffect: (cb: () => void) => { React.useEffect(cb, []); } };
});
jest.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh: jest.fn() }));
jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/BackButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../api/part-requests.api', () => ({ partReturnsApi: { getMine: jest.fn().mockResolvedValue([]) }, isPartReturnsUnavailableError: () => false }));
jest.mock('../../api/technician-warranty.api', () => ({ technicianWarrantyApi: { listMine: (...args: unknown[]) => mockListMine(...args) } }));

const claim = (id: string, partRequest: Record<string, unknown> | null) => ({ id, order: { code: `FH-${id}` }, partRequest });
const part = (overrides: Record<string, unknown> = {}) => ({ status: 'received', faultyReturnDueAt: '2099-01-01T00:00:00.000Z', faultyReturnedAt: null, faultyReturnChargedAt: null, ...overrides });
const textOf = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map(n => [n.props.children].flat().join('')).join(' | ');
const render = async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><TechnicianPartReturnsScreen /></SafeAreaProvider>); });
  return renderer;
};

beforeEach(() => { jest.clearAllMocks(); });

it('lists the faulty warranty parts still to hand in even when the ledger is empty, and opens the claim', async () => {
  mockListMine.mockResolvedValue({ data: [
    claim('later', part({ faultyReturnDueAt: '2099-06-01T00:00:00.000Z' })), claim('soon', part({ faultyReturnDueAt: '2099-02-01T00:00:00.000Z' })),
    claim('done', part({ faultyReturnedAt: '2026-11-20T00:00:00.000Z' })), claim('waiting', part({ status: 'ready' })), claim('none', null),
  ] });
  const tree = await render();
  const text = textOf(tree);
  expect(text).toContain('Linh kiện hỏng cần nộp (bảo hành) · 2');
  expect(text.indexOf('FH-soon')).toBeLessThan(text.indexOf('FH-later'));
  expect(text).not.toContain('FH-done');
  expect(text).not.toContain('Bạn không còn linh kiện nào cần trả');
  await act(async () => { tree.root.findAllByType(TouchableOpacity).find(n => n.props.testID === 'faulty-return-soon')!.props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('TechnicianWarrantyTask', { claimId: 'soon' });
  await act(async () => tree.unmount());
});

it('flags an overdue part and one already charged to the wallet', async () => {
  mockListMine.mockResolvedValue({ data: [claim('late', part({ faultyReturnDueAt: '2020-01-01T00:00:00.000Z' })), claim('charged', part({ faultyReturnChargedAt: '2020-01-02T00:00:00.000Z' }))] });
  const text = textOf(await render());
  expect(text).toContain('Đã quá hạn nộp');
  expect(text).toContain('Quá hạn, đã bị trừ ví');
});

it('keeps the empty message when nothing is owed', async () => {
  mockListMine.mockResolvedValue({ data: [claim('done', part({ faultyReturnedAt: '2026-11-20T00:00:00.000Z' }))] });
  const text = textOf(await render());
  expect(text).not.toContain('Linh kiện hỏng cần nộp');
  expect(text).toContain('Bạn không còn linh kiện nào cần trả');
});
