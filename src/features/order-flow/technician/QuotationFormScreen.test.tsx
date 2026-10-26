import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import QuotationFormScreen from './QuotationFormScreen';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
const mockConfirm = jest.fn();
const mockCancelConfirm = jest.fn();
const mockSubmit = jest.fn();
const mockVerify = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});
const mockLoadResource: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();
const mockFetchCatalog: jest.Mock = jest.fn();
const mockFetchPartById: jest.Mock = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({
    key: mockKey,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: (...args: unknown[]) => mockLoadResource(...args),
    journal: { list: () => mockJournalList },
  }),
}));
jest.mock('./useTechnicianQuotation', () => ({
  useTechnicianQuotation: () => ({
    controller: {
      confirm: (...args: unknown[]) => mockConfirm(...args),
      cancelConfirm: (...args: unknown[]) => mockCancelConfirm(...args),
      submit: (...args: unknown[]) => mockSubmit(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      getState: () => mockState,
    },
    state: mockState,
  }),
}));
jest.mock('./parts-catalog-adapter', () => ({
  fetchStrictCatalog: (...args: unknown[]) => mockFetchCatalog(...args),
  fetchStrictPartById: (...args: unknown[]) => mockFetchPartById(...args),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...args: unknown[]) => mockNavigate(...args), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function formSnapshot(quoteRows: unknown[] = []) {
  const key: OrderSessionKey = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: 'order-1',
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa điều hòa',
      status: 'EN_ROUTE',
      arrivalVerified: true,
      pricingMode: 'INSPECTION_REQUIRED',
      customerName: 'Khách hàng',
      customerPhone: '0900000000',
      technician: { id: 'tech-1', fullName: 'Thợ', phoneNumber: '0901111111', averageRating: null },
      laborTotal: 0,
      partsTotal: 0,
      grandTotal: 0,
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-13T00:00:00Z',
    } as any,
    1,
    1,
  );
  snapshot.resources.quotations = readyResource(quoteRows as any, 1, 1);
  return { key, snapshot };
}

function idleState() {
  return { phase: 'idle', message: null, confirmDraft: null };
}

function bySuffix(root: any, suffix: string) {
  return root.findAll((node: any) => new RegExp(`${suffix}$`).test(String(node.props?.testID ?? '')));
}

function uniqIds(nodes: any[]): string[] {
  return [...new Set(nodes.map((node: any) => String(node.props.testID)))];
}

beforeEach(() => {
  const fixture = formSnapshot();
  mockKey = fixture.key;
  mockSnapshot = fixture.snapshot;
  mockJournalList = [];
  mockState = idleState();
  mockConfirm.mockImplementation(() => true);
  mockFetchCatalog.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } });
  mockFetchPartById.mockRejectedValue(new Error('Catalog part ID mismatch'));
  for (const mock of [mockConfirm, mockCancelConfirm, mockSubmit, mockVerify, mockNavigate, mockRefresh, mockLoadResource, mockFetchCatalog, mockFetchPartById]) {
    mock.mockClear();
  }
  mockConfirm.mockImplementation(() => true);
  mockFetchCatalog.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } });
  mockFetchPartById.mockRejectedValue(new Error('Catalog part ID mismatch'));
});

const serverPart = (id: string, sellingPrice: number) => ({ id, sku: null, name: 'Bo mạch', description: null, sellingPrice, warrantyDays: 365, warrantyPolicy: null, isActive: true, createdAt: '', updatedAt: '' });
const request = (over: Record<string, unknown> = {}, items: unknown[] = [{ id: 'i1', partCatalogId: 'part-1', partSource: 'fixhome', partNameSnapshot: 'Bo mạch', quantity: 2, usageStatus: 'pending' }]) =>
  ({ id: 'pr-1', serviceOrderId: 'order-1', technicianId: 'tech-1', requestType: 'pre_repair', status: 'received', fulfillmentMethod: 'pickup', items, ...over });
const withParts = (requests: unknown[]) => { mockSnapshot.resources.parts = readyResource(requests as any, 1, 1); };
const render = async () => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<QuotationFormScreen />); }); return r; };
const press = async (r: ReturnType<typeof create>, testID: string) => {
  await act(async () => { r.root.findByProps({ testID }).props.onPress(); });
  await act(async () => {});
};
async function fillLabor(r: ReturnType<typeof create>) {
  await act(async () => { bySuffix(r.root, '-description')[0].props.onChangeText('Vệ sinh dàn lạnh'); });
  await act(async () => { bySuffix(r.root, '-quantity')[0].props.onChangeText('2'); });
  await act(async () => { bySuffix(r.root, '-unitprice')[0].props.onChangeText('150000'); });
}

it('review shapes rows through the controller validator and sends once on explicit confirm', async () => {
  const r = await render();
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockConfirm.mock.calls[0][0]).toEqual({ items: [{ type: 'labor', description: 'Vệ sinh dàn lạnh', quantity: '2', unitPrice: '150000' }] });
  expect(uniqIds(r.root.findAllByProps({ testID: 'quote-review-sheet' }))).toHaveLength(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await press(r, 'quote-send');
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});

it('an empty form marks the fields and never reaches the controller', async () => {
  const r = await render();
  await press(r, 'quote-review');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(r.root.findByProps({ testID: 'quote-form-error' })).toBeTruthy();
  expect(JSON.stringify(r.toJSON())).toMatch(/Nhập mô tả hạng mục/);
  await act(async () => r.unmount());
});

it('an earlier requested part can be ticked: whole line, server price and FixHome warranty, no new stock pick needed', async () => {
  withParts([request()]);
  mockFetchPartById.mockResolvedValue(serverPart('part-1', 500000));
  const r = await render();
  await press(r, 'quote-earlier-i1');
  expect(mockFetchPartById).toHaveBeenCalledWith('part-1');
  expect(JSON.stringify(r.toJSON())).toMatch(/Bảo hành 365 ngày theo FixHome/);
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(mockConfirm.mock.calls[0][0].items).toEqual([
    { type: 'labor', description: 'Vệ sinh dàn lạnh', quantity: '2', unitPrice: '150000' },
    { type: 'parts_equipment', description: 'Bo mạch', quantity: '2', unitPrice: '500000', partSource: 'fixhome', partCatalogId: 'part-1', partNameSnapshot: 'Bo mạch' },
  ]);
  await act(async () => r.unmount());
});

it('lists only live FixHome pre-repair lines of this technician and unticking removes the line', async () => {
  withParts([
    request(),
    request({ id: 'pr-2', status: 'cancelled' }, [{ id: 'i2', partCatalogId: 'part-2', partSource: 'fixhome', partNameSnapshot: 'Tụ', quantity: 1, usageStatus: 'pending' }]),
    request({ id: 'pr-3', requestType: 'additional' }, [{ id: 'i3', partCatalogId: 'part-3', partSource: 'fixhome', partNameSnapshot: 'Quạt', quantity: 1, usageStatus: 'pending' }]),
    request({ id: 'pr-4', technicianId: 'tech-2' }, [{ id: 'i4', partCatalogId: 'part-4', partSource: 'fixhome', partNameSnapshot: 'Van', quantity: 1, usageStatus: 'pending' }]),
    request({ id: 'pr-5' }, [{ id: 'i5', partCatalogId: 'part-5', partSource: 'fixhome', partNameSnapshot: 'Gas', quantity: 1, usageStatus: 'returned' }]),
    request({ id: 'pr-6' }, [{ id: 'i6', partCatalogId: 'part-6', partSource: 'external', partNameSnapshot: 'Ngoài', quantity: 1, usageStatus: 'pending' }]),
  ]);
  mockFetchPartById.mockResolvedValue(serverPart('part-1', 500000));
  const r = await render();
  expect(uniqIds(r.root.findAll((n: any) => String(n.props?.testID ?? '').startsWith('quote-earlier-')))).toEqual(['quote-earlier-i1']);
  await press(r, 'quote-earlier-i1');
  await press(r, 'quote-earlier-i1');
  expect(JSON.stringify(r.toJSON())).not.toMatch(/Bảo hành 365 ngày/);
  await act(async () => r.unmount());
});

it('offers no outside-part source and no paid warranty anywhere', async () => {
  withParts([request()]);
  const r = await render();
  expect(JSON.stringify(r.toJSON())).not.toMatch(/Nguồn linh kiện|ngoài|Thợ tự|Bảo hành có phí|Phí \(đ/i);
  await act(async () => r.unmount());
});

it('a failed price lookup drops the ticked line and says so', async () => {
  withParts([request()]);
  mockFetchPartById.mockRejectedValue(new Error('Catalog part ID mismatch'));
  const r = await render();
  await press(r, 'quote-earlier-i1');
  expect(JSON.stringify(r.toJSON())).toMatch(/Không lấy được giá linh kiện/);
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(mockConfirm.mock.calls[0][0].items).toHaveLength(1);
  await act(async () => r.unmount());
});

it('review waits while a ticked part price is still loading', async () => {
  withParts([request()]);
  mockFetchPartById.mockReturnValue(new Promise(() => {}));
  const r = await render();
  await press(r, 'quote-earlier-i1');
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(JSON.stringify(r.toJSON())).toMatch(/Đang lấy giá linh kiện/);
  await act(async () => r.unmount());
});

it('denied validation surfaces the controller message and sends nothing', async () => {
  mockConfirm.mockImplementation(() => {
    mockState = { ...idleState(), phase: 'denied', message: 'Số lượng phải là số nguyên.' };
    return false;
  });
  const r = await render();
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(r.root.findByProps({ testID: 'quote-form-error' })).toBeTruthy();
  expect(r.root.findAllByProps({ testID: 'quote-review-sheet' })).toHaveLength(0);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});

it('unknown offers GET-only verify and an approved quote keeps the form read-only', async () => {
  mockState = { ...idleState(), phase: 'unknown', message: 'Kết quả chưa xác định.' };
  let r = await render();
  await press(r, 'quote-verify');
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => r.unmount());

  mockState = idleState();
  mockSnapshot = formSnapshot([{ id: 'q-old', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'APPROVED', version: 1 }]).snapshot;
  r = await render();
  expect(r.root.findByProps({ testID: 'quote-review' }).props.disabled).toBe(true);
  expect(bySuffix(r.root, '-description')).toHaveLength(0);
  await act(async () => r.unmount());
});

it('busy and unknown deny draft review and sends, keeping verify usable', async () => {
  const r = await render();
  expect(bySuffix(r.root, '-description').length).toBeGreaterThan(0);

  mockState = { ...idleState(), phase: 'submitting' };
  await act(async () => { r.update(<QuotationFormScreen />); });
  expect(bySuffix(r.root, '-description')).toHaveLength(0);
  expect(r.root.findByProps({ testID: 'quote-review' }).props.disabled).toBe(true);
  await press(r, 'quote-review');
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => r.unmount());

  mockState = { ...idleState(), phase: 'unknown', message: 'Kết quả chưa xác định.' };
  const u = await render();
  expect(u.root.findAllByProps({ testID: 'quote-review' })).toHaveLength(0);
  expect(u.root.findByProps({ testID: 'quote-verify' }).props.disabled).toBe(false);
  await press(u, 'quote-verify');
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => u.unmount());
});

it('back cancels the review with zero POST', async () => {
  const r = await render();
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(uniqIds(r.root.findAllByProps({ testID: 'quote-review-sheet' }))).toHaveLength(1);
  await act(async () => { r.root.findAll(node => node.props?.accessibilityLabel === 'Quay lại')[0].props.onPress(); });
  expect(mockCancelConfirm).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => { r.update(<QuotationFormScreen />); });
  expect(r.root.findAllByProps({ testID: 'quote-review-sheet' })).toHaveLength(0);
  await act(async () => r.unmount());
});

it('an earlier requested part can be used in a smaller quantity, never above what was requested', async () => {
  withParts([request({}, [{ id: 'i1', partCatalogId: 'part-1', partSource: 'fixhome', partNameSnapshot: 'Bo mạch', quantity: 3, usageStatus: 'pending' }])]);
  mockFetchPartById.mockResolvedValue(serverPart('part-1', 500000));
  const r = await render();
  await press(r, 'quote-earlier-i1');
  const plus = () => r.root.findAll((n: any) => n.props?.testID === 'quote-earlier-i1-plus' && !!n.props.accessibilityState)[0];
  expect(plus().props.accessibilityState.disabled).toBe(true);
  await press(r, 'quote-earlier-i1-minus');
  await press(r, 'quote-earlier-i1-minus');
  await press(r, 'quote-earlier-i1-minus');
  expect(JSON.stringify(r.toJSON())).toContain('Số lượng dùng 1');
  await press(r, 'quote-earlier-i1-plus');
  await fillLabor(r);
  await press(r, 'quote-review');
  expect(mockConfirm.mock.calls[0][0].items[1]).toMatchObject({ partCatalogId: 'part-1', quantity: '2' });
  await act(async () => r.unmount());
});
