import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { createOrderSessionSnapshot, readyResource, type OrderSessionSnapshot } from '../domain/order-session.types';
import FaceReviewWaitingScreen from './FaceReviewWaitingScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

let mockSnapshot: OrderSessionSnapshot | null;
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({ key: mockSnapshot?.key ?? null, snapshot: mockSnapshot, loadResource: jest.fn(async () => {}) }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));
jest.mock('../shared/TechnicianOrderHub', () => () => null);

const key = { userId: 'tech', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };

function snapshot(technicianId = 'tech'): OrderSessionSnapshot {
  const s = createOrderSessionSnapshot(key);
  s.access = 'current';
  s.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'b', serviceName: 'Sửa máy lạnh', status: 'EN_ROUTE',
    customerName: 'Khách', customerPhone: '', addressSummary: '12 Lê Lợi', scheduledAt: '',
    laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '',
    technician: { id: technicianId, fullName: 'KTV', phoneNumber: '', averageRating: null },
    arrivalVerified: true, checkinFaceReview: { status: 'pending', note: null },
  } as never, 1, 1);
  return s;
}

const texts = (renderer: ReturnType<typeof create>) => renderer.root.findAllByType(Text).map(node => String(node.props.children));

async function render() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<FaceReviewWaitingScreen />); });
  return renderer;
}

beforeEach(() => jest.clearAllMocks());

it('tells the technician the face waits for a service manager, with the order code', async () => {
  mockSnapshot = snapshot();
  const renderer = await render();
  const shown = texts(renderer).join(' | ');
  expect(shown).toContain('Đang chờ quản lý dịch vụ xác nhận khuôn mặt…');
  expect(shown).toContain('Chờ xác nhận khuôn mặt');
  expect(shown).toContain('SO-1');
  await act(async () => renderer.unmount());
});

it('goes back to the order task on Tiếp tục, where the server state decides the next step', async () => {
  mockSnapshot = snapshot();
  const renderer = await render();
  await act(async () => { renderer.root.findByProps({ testID: 'face-review-continue' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  await act(async () => renderer.unmount());
});

it('shows nothing about the face when the order is not the signed-in technician\'s', async () => {
  mockSnapshot = snapshot('someone-else');
  const renderer = await render();
  const shown = texts(renderer).join(' | ');
  expect(shown).not.toContain('Đang chờ quản lý dịch vụ xác nhận khuôn mặt…');
  expect(shown).toContain('Không mở được bước này.');
  await act(async () => renderer.unmount());
});
