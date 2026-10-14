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

it('review shapes rows through the controller validator and sends once on explicit confirm', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  // The single initial labor row starts expanded (one form at a time).
  await act(async () => {
    bySuffix(renderer.root, '-description')[0].props.onChangeText('Vệ sinh dàn lạnh');
  });
  await act(async () => {
    bySuffix(renderer.root, '-quantity')[0].props.onChangeText('2');
  });
  await act(async () => {
    bySuffix(renderer.root, '-unitprice')[0].props.onChangeText('150000');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-review' }).props.onPress();
  });
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockConfirm.mock.calls[0][0]).toEqual({
    items: [{ type: 'labor', description: 'Vệ sinh dàn lạnh', quantity: '2', unitPrice: '150000' }],
  });
  expect(uniqIds(renderer.root.findAllByProps({ testID: 'quote-review-sheet' }))).toHaveLength(1);
  expect(mockSubmit).not.toHaveBeenCalled();

  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-send' }).props.onPress();
  });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('denied validation surfaces the controller message and sends nothing', async () => {
  mockConfirm.mockImplementation(() => {
    mockState = { ...idleState(), phase: 'denied', message: 'Số lượng phải là số nguyên.' };
    return false;
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-review' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'quote-form-error' })).toBeTruthy();
  expect(renderer.root.findAllByProps({ testID: 'quote-review-sheet' })).toHaveLength(0);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('catalog failure is an error with retry and a mismatched part never fills the price', async () => {
  mockFetchCatalog.mockRejectedValueOnce(new Error('Network offline'));
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await act(async () => {
    bySuffix(renderer.root, '-kind-parts')[0].props.onPress();
  });
  await act(async () => {
    bySuffix(renderer.root, '-source-fixhome')[0].props.onPress();
  });
  await act(async () => {
    bySuffix(renderer.root, '-catalog-retry')[0].props.onPress();
  });
  expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  expect(uniqIds(bySuffix(renderer.root, '-catalog-error'))).toHaveLength(1);
  expect(renderer.root.findAll((node: any) => String(node.props?.testID ?? '').includes('catalog-option-'))).toHaveLength(0);

  mockFetchCatalog.mockResolvedValueOnce({
    data: [{ id: 'part-1', sku: null, name: 'Bo mạch', description: null, sellingPrice: 500000, warrantyDays: 365, warrantyPolicy: null, isActive: true, createdAt: '', updatedAt: '' }],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
  await act(async () => {
    bySuffix(renderer.root, '-catalog-retry')[0].props.onPress();
  });
  const options = renderer.root.findAll((node: any) => String(node.props?.testID ?? '').includes('catalog-option-'));
  expect(uniqIds(options)).toHaveLength(1);

  await act(async () => {
    options[0].props.onPress();
  });
  expect(mockFetchPartById).toHaveBeenCalledWith('part-1');
  expect(renderer.root.findByProps({ testID: 'quote-form-error' })).toBeTruthy();
  expect(bySuffix(renderer.root, '-unitprice')[0].props.value).toBe('');
  await act(async () => renderer.unmount());
});

it('unknown offers GET-only verify and an approved quote keeps the form read-only', async () => {
  mockState = { ...idleState(), phase: 'unknown', message: 'Kết quả chưa xác định.' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-verify' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  mockState = idleState();
  const fixture = formSnapshot([{ id: 'q-old', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'APPROVED', version: 1 }]);
  mockSnapshot = fixture.snapshot;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'quote-review' }).props.disabled).toBe(true);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

function catalogListPart(id: string) {
  return { id, sku: null, name: id === 'part-1' ? 'Bo mạch' : 'Tụ', description: null, sellingPrice: 500000, warrantyDays: 365, warrantyPolicy: null, isActive: true, createdAt: '', updatedAt: '' };
}

function serverPart(id: string, sellingPrice: number) {
  return { id, sku: null, name: id === 'part-1' ? 'Bo mạch' : 'Tụ', description: null, sellingPrice, warrantyDays: 365, warrantyPolicy: null, isActive: true, createdAt: '', updatedAt: '' };
}

async function openFixhomeRow(renderer: any) {
  await act(async () => {
    bySuffix(renderer.root, '-kind-parts')[0].props.onPress();
  });
  await act(async () => {
    bySuffix(renderer.root, '-source-fixhome')[0].props.onPress();
  });
}

it('a catalog response resolving after review entry leaves the frozen draft unchanged', async () => {
  let resolvePart!: (part: unknown) => void;
  mockFetchPartById.mockImplementation(() => new Promise(resolve => {
    resolvePart = resolve as (part: unknown) => void;
  }));
  mockFetchCatalog.mockResolvedValueOnce({
    data: [catalogListPart('part-1')],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await openFixhomeRow(renderer);
  await act(async () => {
    bySuffix(renderer.root, '-catalog-retry')[0].props.onPress();
  });
  await act(async () => {
    renderer.root.findAll(
      (node: any) => String(node.props?.testID ?? '').endsWith('catalog-option-part-1'),
    )[0].props.onPress();
  });
  expect(mockFetchPartById).toHaveBeenCalledWith('part-1');
  // The technician opens the frozen review while the detail GET is in flight.
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-review' }).props.onPress();
  });
  expect(uniqIds(renderer.root.findAllByProps({ testID: 'quote-review-sheet' }))).toHaveLength(1);
  await act(async () => {
    resolvePart(serverPart('part-1', 500000));
  });
  // The form stays hidden behind the frozen review; cancel back to the draft
  // and confirm the late response never filled the price nor errored.
  await act(async () => {
    renderer.root.findAll(node => node.props?.accessibilityLabel === 'Quay lại')[0].props.onPress();
  });
  expect(bySuffix(renderer.root, '-unitprice')[0].props.value).toBe('');
  expect(renderer.root.findAllByProps({ testID: 'quote-form-error' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('a late catalog response after a source switch is ignored', async () => {
  let resolvePart!: (part: unknown) => void;
  mockFetchPartById.mockImplementation(() => new Promise(resolve => {
    resolvePart = resolve as (part: unknown) => void;
  }));
  mockFetchCatalog.mockResolvedValueOnce({
    data: [catalogListPart('part-1')],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await openFixhomeRow(renderer);
  await act(async () => {
    bySuffix(renderer.root, '-catalog-retry')[0].props.onPress();
  });
  await act(async () => {
    renderer.root.findAll((node: any) => String(node.props?.testID ?? '').includes('catalog-option-'))[0].props.onPress();
  });
  expect(mockFetchPartById).toHaveBeenCalledWith('part-1');
  // The technician switches source while the detail GET is still in flight.
  await act(async () => {
    bySuffix(renderer.root, '-source-external')[0].props.onPress();
  });
  await act(async () => {
    resolvePart(serverPart('part-1', 500000));
  });
  expect(bySuffix(renderer.root, '-unitprice')[0].props.value).toBe('');
  expect(renderer.root.findAllByProps({ testID: 'quote-form-error' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('the latest catalog selection wins over an earlier pending one', async () => {
  const resolvers: Record<string, (part: unknown) => void> = {};
  mockFetchPartById.mockImplementation((id: string) => new Promise(resolve => {
    resolvers[id] = resolve as (part: unknown) => void;
  }));
  mockFetchCatalog.mockResolvedValueOnce({
    data: [catalogListPart('part-1'), catalogListPart('part-2')],
    meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await openFixhomeRow(renderer);
  await act(async () => {
    bySuffix(renderer.root, '-catalog-retry')[0].props.onPress();
  });
  const optionFor = (id: string) => renderer.root.findAll(
    (node: any) => String(node.props?.testID ?? '').endsWith(`catalog-option-${id}`),
  )[0];
  await act(async () => {
    optionFor('part-1').props.onPress();
  });
  await act(async () => {
    optionFor('part-2').props.onPress();
  });
  expect(mockFetchPartById).toHaveBeenCalledWith('part-1');
  expect(mockFetchPartById).toHaveBeenCalledWith('part-2');
  // The earlier pick resolves last but must not overwrite the latest selection.
  await act(async () => {
    resolvers['part-1'](serverPart('part-1', 500000));
  });
  await act(async () => {
    resolvers['part-2'](serverPart('part-2', 700000));
  });
  expect(bySuffix(renderer.root, '-unitprice')[0].props.value).toBe('700000');
  expect(renderer.root.findAllByProps({ testID: 'quote-form-error' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('busy and unknown deny draft review and sends, keeping verify usable', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  // Idle: the single row form is editable.
  expect(bySuffix(renderer.root, '-description').length).toBeGreaterThan(0);

  // Busy: the form unmounts to read-only, the footer locks, re-entry posts nothing.
  mockState = { ...idleState(), phase: 'submitting' };
  await act(async () => {
    renderer.update(<QuotationFormScreen />);
  });
  expect(bySuffix(renderer.root, '-description')).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'quote-review' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-review' }).props.onPress();
  });
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockVerify).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  mockState = { ...idleState(), phase: 'unknown', message: 'Kết quả chưa xác định.' };
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  // The review/send entry is gone while unknown; only GET verify remains.
  expect(renderer.root.findAllByProps({ testID: 'quote-review' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'quote-verify' }).props.disabled).toBe(false);
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-verify' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('back cancels the review with zero POST', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationFormScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-review' }).props.onPress();
  });
  expect(uniqIds(renderer.root.findAllByProps({ testID: 'quote-review-sheet' }))).toHaveLength(1);
  await act(async () => {
    renderer.root.findAll(node => node.props?.accessibilityLabel === 'Quay lại')[0].props.onPress();
  });
  expect(mockCancelConfirm).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => {
    renderer.update(<QuotationFormScreen />);
  });
  expect(renderer.root.findAllByProps({ testID: 'quote-review-sheet' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});
