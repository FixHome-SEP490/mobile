import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import TechnicianPartsSection from './technician-parts-section';
import { partRequestsApi, partReturnsApi } from '../../api/part-requests.api';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));
jest.mock('../../api/parts-catalog.api', () => ({ partsCatalogApi: { search: jest.fn().mockResolvedValue([]), getById: jest.fn() } }));
jest.mock('../../api/part-requests.api', () => ({
  ...jest.requireActual('../../api/part-requests.api'),
  partRequestsApi: { getByOrderId: jest.fn() },
  partReturnsApi: { getByOrderId: jest.fn(), declare: jest.fn() },
}));

const request = {
  id: 'req-1', serviceOrderId: 'o1', technicianId: 't1', requestType: 'pre_repair', fulfillmentMethod: 'pickup', status: 'received',
  shippingFee: 0, receivedAt: '2026-10-19T01:00:00Z', createdAt: '', updatedAt: '',
  items: [{ id: 'item-1', partRequestId: 'req-1', partSource: 'fixhome', partNameSnapshot: 'Block', quantity: 3, unitPriceSnapshot: 1000, usageStatus: 'pending', createdAt: '', updatedAt: '' }],
};
const record = {
  partRequestId: 'req-1', partRequestItemId: 'item-1', partNameSnapshot: 'Block', issuedQty: 3, usedQty: 1,
  declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 2, version: 7,
};
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map((n) => [n.props.children].flat().join('')).join('\n');
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const press = (r: ReturnType<typeof create>, label: string) => {
  const t = r.root.findAllByType(TouchableOpacity).find((x) => x.findAllByType(Text).some((y) => y.props.children === label)
    || x.props.accessibilityLabel === label)!;
  return act(async () => { t.props.onPress(); });
};

async function mount() {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<TechnicianPartsSection orderId="o1" orderStatus="UNDER_REPAIR" />); });
  await flush();
  return r;
}

beforeEach(() => {
  (partRequestsApi.getByOrderId as jest.Mock).mockResolvedValue([request]);
  (partReturnsApi.getByOrderId as jest.Mock).mockReset();
  (partReturnsApi.declare as jest.Mock).mockReset().mockResolvedValue(undefined);
});

it('shows what is owed and sends the declaration with the record version and an idempotency key', async () => {
  (partReturnsApi.getByOrderId as jest.Mock).mockResolvedValue([record]);
  const r = await mount();
  expect(texts(r)).toContain('Cấp 3 · Dùng 1 · Cần trả 2');
  await press(r, 'Khai trả');
  await press(r, 'Tăng số lượng trả');
  await press(r, 'Gửi khai trả');
  expect(partReturnsApi.declare).toHaveBeenCalledWith('req-1', 'item-1', {
    quantity: 2, expectedVersion: 7, idempotencyKey: expect.stringMatching(/^declare-/),
  });
});

it('says the manager still has to confirm, and offers no further declaration, once everything owed is declared', async () => {
  (partReturnsApi.getByOrderId as jest.Mock).mockResolvedValue([{ ...record, declaredQty: 2 }]);
  const r = await mount();
  expect(texts(r)).toContain('Đang chờ quản lý xác nhận');
  expect(r.root.findAllByType(Text).some((t) => t.props.children === 'Khai trả')).toBe(false);
});

it('hides the whole return block when the backend has the feature off', async () => {
  (partReturnsApi.getByOrderId as jest.Mock).mockRejectedValue({ response: { status: 404 } });
  const r = await mount();
  expect(texts(r)).not.toContain('Hoàn trả:');
  expect(texts(r)).toContain('Block');
});
