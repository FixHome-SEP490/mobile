import {
  createCustomerQuotationDecisionController,
  getEligibleWarrantyOptions,
  calculateReviewPreview,
  parseSafeIntegerMoney,
  REJECT_WHOLE_ORDER_WARNING,
  APPROVE_NOT_PAYMENT_NOTE,
  type CustomerQuotationDecisionDependencies,
  type CustomerQuotationDecisionTransport,
} from './customer-quotation-controller';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import type { OrderSessionKey, OrderSessionSnapshot, OrderQuotation } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    async getItem(k: string) {
      return store.get(k) ?? null;
    },
    async setItem(k: string, v: string) {
      store.set(k, v);
    },
  };
}

const sampleQuote: OrderQuotation = {
  id: 'quote-1',
  serviceOrderId: 'order-1',
  technicianId: 'tech-1',
  status: 'SENT',
  version: 1,
  laborTotal: '150000',
  partsTotal: '300000',
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'labor',
      description: 'Công thợ',
      quantity: 1,
      unitPrice: 150000,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'parts_equipment',
      partSource: 'fixhome',
      partCatalogId: '33333333-3333-4333-8333-333333333333',
      description: 'Linh kiện FixHome',
      quantity: 1,
      unitPrice: 200000,
      warrantyFee: 50000, // Should be ignored because partSource is fixhome
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'parts_equipment',
      partSource: 'technician',
      partWarrantyOption: 'paid_warranty',
      description: 'Tụ ngậm thợ (có phí BH)',
      quantity: 5, // Qty > 1 to test sum once per line
      unitPrice: 50000,
      warrantyFee: 20000,
      warrantyTermDays: 90,
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'parts_equipment',
      partSource: 'technician',
      partWarrantyOption: 'paid_warranty',
      description: 'Rơ le thợ (phí 0đ)',
      quantity: 1,
      unitPrice: 50000,
      warrantyFee: 0,
      warrantyTermDays: 30,
    },
  ],
};

describe('Warranty helpers & review preview', () => {
  it('getEligibleWarrantyOptions selects only technician paid_warranty lines with UUID and valid term', () => {
    const eligible = getEligibleWarrantyOptions(sampleQuote);
    expect(eligible).toHaveLength(2);
    expect(eligible[0].itemId).toBe('44444444-4444-4444-8444-444444444444');
    expect(eligible[0].fee).toBe(20000);
    expect(eligible[0].termDays).toBe(90);

    expect(eligible[1].itemId).toBe('55555555-5555-4555-8555-555555555555');
    expect(eligible[1].fee).toBe(0); // Zero fee supported
  });

  it('calculateReviewPreview sums labor, parts, and selected warrantyFee once per line (not qty * fee)', () => {
    // Default OFF (empty selection)
    const previewEmpty = calculateReviewPreview(sampleQuote, []);
    expect(previewEmpty).not.toBeNull();
    expect(previewEmpty!.baseLabor).toBe(150000);
    expect(previewEmpty!.baseParts).toBe(300000);
    expect(previewEmpty!.warrantyTotal).toBe(0);
    expect(previewEmpty!.previewGrandTotal).toBe(450000);

    // Selected item with quantity 5 and fee 20000 -> warrantyTotal must be 20000, NOT 100000!
    const previewSelected = calculateReviewPreview(sampleQuote, ['44444444-4444-4444-8444-444444444444']);
    expect(previewSelected).not.toBeNull();
    expect(previewSelected!.warrantyTotal).toBe(20000);
    expect(previewSelected!.previewGrandTotal).toBe(470000);
  });

  it('exact warnings and notes match required strings', () => {
    expect(REJECT_WHOLE_ORDER_WARNING).toBe('Từ chối báo giá sẽ hủy toàn bộ đơn dịch vụ, không chỉ báo giá');
    expect(APPROVE_NOT_PAYMENT_NOTE).toBe('Duyệt báo giá chưa phải thanh toán.');
  });
});

describe('createCustomerQuotationDecisionController', () => {
  let key: OrderSessionKey;
  let snapshot: OrderSessionSnapshot;
  let journal: ReturnType<typeof createOrderCommandJournal>;
  let transport: CustomerQuotationDecisionTransport;
  let coordinator: any;
  let deps: CustomerQuotationDecisionDependencies;

  const quoteId = '11111111-2222-4333-8444-555555555555';
  const warrantyItemId = '66666666-7777-4888-8999-000000000000';

  beforeEach(async () => {
    key = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
    snapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.order = readyResource(
      {
        id: 'order-1',
        code: 'SO-01',
        bookingId: 'booking-1',
        serviceName: 'Sửa điều hòa',
        status: 'EN_ROUTE',
        pricingMode: 'INSPECTION_REQUIRED',
        customerName: 'Khách hàng',
        customerPhone: '0900000000',
        technician: { id: 'tech-1', fullName: 'Thợ' },
        laborTotal: 150000,
        partsTotal: 100000,
        grandTotal: 250000,
        paymentStatus: 'UNPAID',
        createdAt: '2026-10-13T00:00:00Z',
      } as any,
      1,
      1,
    );
    snapshot.resources.quotations = readyResource(
      [
        {
          id: quoteId,
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          status: 'SENT',
          version: 1,
          laborTotal: 150000,
          partsTotal: 100000,
          items: [
            {
              id: warrantyItemId,
              type: 'parts_equipment',
              partSource: 'technician',
              partWarrantyOption: 'paid_warranty',
              description: 'Linh kiện thợ',
              quantity: 1,
              unitPrice: 100000,
              warrantyFee: 25000,
              warrantyTermDays: 90,
            },
          ],
        },
      ] as any,
      1,
      1,
    );

    journal = createOrderCommandJournal(createMemoryStorage());
    await journal.restore();

    transport = {
      approveQuotation: jest.fn(async () => ({ success: true })),
      rejectQuotation: jest.fn(async () => ({ success: true })),
    };

    coordinator = {
      getSnapshot: () => snapshot,
      refreshOrderSession: jest.fn(async () => {}),
      loadResource: jest.fn(async () => {}),
    };

    deps = {
      coordinator,
      journal,
      transport,
      getKey: () => key,
      isActive: () => true,
      newIntentId: () => 'intent-qd-1',
    };
  });

  it('approve EN_ROUTE: submits approved decision and resolves when quote is APPROVED', async () => {
    const ctrl = createCustomerQuotationDecisionController(deps);
    // Select warranty item
    ctrl.toggleWarrantyItem(warrantyItemId);
    expect(ctrl.getState().selectedWarrantyItemIds).toEqual([warrantyItemId]);

    expect(ctrl.confirm('APPROVE')).toBe(true);
    expect(ctrl.getState().confirmDraft?.action).toBe('APPROVE');
    expect(ctrl.getState().confirmDraft?.selectedWarrantyItemIds).toEqual([warrantyItemId]);

    let postCalled = false;
    transport.approveQuotation = jest.fn(async () => {
      postCalled = true;
      return { success: true };
    });

    coordinator.refreshOrderSession.mockImplementation(async () => {
      if (postCalled) {
        ((snapshot.resources.quotations as any).data[0]).status = 'APPROVED';
      }
    });

    await ctrl.submit();
    expect(transport.approveQuotation).toHaveBeenCalledTimes(1);
    expect(transport.approveQuotation).toHaveBeenCalledWith(quoteId, [warrantyItemId]);
    expect(ctrl.getState().phase).toBe('resolved');
    expect(ctrl.getState().decidedAction).toBe('APPROVE');
  });

  it('reject terminal: resolves ONLY when quote is REJECTED AND order is CANCELLED', async () => {
    const ctrl = createCustomerQuotationDecisionController(deps);
    expect(ctrl.confirm('REJECT')).toBe(true);

    let postCalled = false;
    transport.rejectQuotation = jest.fn(async () => {
      postCalled = true;
      return { success: true };
    });

    coordinator.refreshOrderSession.mockImplementation(async () => {
      if (postCalled) {
        // Quote rejected but order still EN_ROUTE -> must remain UNRESOLVED
        ((snapshot.resources.quotations as any).data[0]).status = 'REJECTED';
      }
    });

    await ctrl.submit();
    expect(transport.rejectQuotation).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('unknown');

    // When canonical order cancellation is reflected in readback, verify resolves it
    ((snapshot.order as any).data).status = 'CANCELLED';
    await ctrl.verify();
    expect(ctrl.getState().phase).toBe('resolved');
  });

  it('GET still SENT does not unlock and stays unknown', async () => {
    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.confirm('APPROVE');

    // Server returns SENT still after POST
    await ctrl.submit();
    expect(ctrl.getState().phase).toBe('unknown');
    expect(ctrl.getState().message).toMatch(/chưa xác định/);
  });

  it('target change (quote version / status / technician) between confirm and submit blocks POST', async () => {
    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.confirm('APPROVE');

    // Version bumped on server before submit
    ((snapshot.resources.quotations as any).data[0]).version = 2;

    await ctrl.submit();
    expect(transport.approveQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/đã được cập nhật hoặc thay đổi/);
  });

  it('superseded or approved quotes cannot be confirmed', async () => {
    ((snapshot.resources.quotations as any).data[0]).status = 'APPROVED';
    const ctrl = createCustomerQuotationDecisionController(deps);
    expect(ctrl.confirm('APPROVE')).toBe(false);
    expect(ctrl.getState().phase).toBe('denied');

    ((snapshot.resources.quotations as any).data[0]).status = 'SUPERSEDED';
    expect(ctrl.confirm('APPROVE')).toBe(false);
  });

  it('cancelConfirm clears draft with zero writes', async () => {
    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.confirm('APPROVE');
    ctrl.cancelConfirm();
    expect(ctrl.getState().confirmDraft).toBeNull();
    expect(transport.approveQuotation).not.toHaveBeenCalled();
  });

  it('double tap is prevented and inactive session aborts submit', async () => {
    let resolvePost: (val: any) => void;
    const postPromise = new Promise(res => {
      resolvePost = res;
    });
    transport.approveQuotation = jest.fn(() => postPromise);

    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.confirm('APPROVE');

    const p1 = ctrl.submit();
    const p2 = ctrl.submit(); // second tap while busy

    resolvePost!({ success: true });
    await Promise.all([p1, p2]);

    expect(transport.approveQuotation).toHaveBeenCalledTimes(1);

    // Inactive test
    deps.isActive = () => false;
    ctrl.confirm('APPROVE');
    await ctrl.submit();
    expect(transport.approveQuotation).toHaveBeenCalledTimes(1);
  });

  it('parseSafeIntegerMoney strictly parses safe integers and rejects decimals/unsafe/negative', () => {
    expect(parseSafeIntegerMoney(150000)).toBe(150000);
    expect(parseSafeIntegerMoney('150000')).toBe(150000);
    expect(parseSafeIntegerMoney(0)).toBe(0);
    expect(parseSafeIntegerMoney('0')).toBe(0);

    expect(parseSafeIntegerMoney(150.5)).toBeNull();
    expect(parseSafeIntegerMoney('150.5')).toBeNull();
    expect(parseSafeIntegerMoney(-1)).toBeNull();
    expect(parseSafeIntegerMoney(Number.MAX_SAFE_INTEGER + 100)).toBeNull();
    expect(parseSafeIntegerMoney('abc')).toBeNull();
  });

  it('getEligibleWarrantyOptions and calculateReviewPreview fail closed on invalid components', () => {
    // Missing laborTotal -> calculateReviewPreview returns null
    const brokenLaborQuote = { ...sampleQuote, laborTotal: undefined };
    expect(calculateReviewPreview(brokenLaborQuote as any, [])).toBeNull();

    // Fractional partsTotal -> calculateReviewPreview returns null
    const fractionalPartsQuote = { ...sampleQuote, partsTotal: 150000.5 };
    expect(calculateReviewPreview(fractionalPartsQuote as any, [])).toBeNull();

    // Ineligible selected ID -> calculateReviewPreview returns null
    expect(calculateReviewPreview(sampleQuote, ['unknown-id'])).toBeNull();

    // Labor item with paid_warranty is excluded
    const laborPaidQuote: OrderQuotation = {
      ...sampleQuote,
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        type: 'labor',
        description: 'Công thợ',
        quantity: 1,
        unitPrice: 100000,
        partSource: 'technician',
        partWarrantyOption: 'paid_warranty',
        warrantyFee: 20000,
        warrantyTermDays: 30,
      }],
    };
    expect(getEligibleWarrantyOptions(laborPaidQuote)).toHaveLength(0);

    // Missing warrantyFee does NOT default to 0 -> excluded
    const missingFeeQuote: OrderQuotation = {
      ...sampleQuote,
      items: [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'parts_equipment',
        partSource: 'technician',
        partWarrantyOption: 'paid_warranty',
        description: 'Tụ',
        quantity: 1,
        unitPrice: 50000,
        warrantyFee: undefined,
        warrantyTermDays: 30,
      }],
    };
    expect(getEligibleWarrantyOptions(missingFeeQuote)).toHaveLength(0);

    // Warranty term out of bounds (1..3650)
    const outOfBoundsTermQuote: OrderQuotation = {
      ...sampleQuote,
      items: [{
        id: '44444444-4444-4444-8444-444444444444',
        type: 'parts_equipment',
        partSource: 'technician',
        partWarrantyOption: 'paid_warranty',
        description: 'Tụ',
        quantity: 1,
        unitPrice: 50000,
        warrantyFee: 20000,
        warrantyTermDays: 5000,
      }],
    };
    expect(getEligibleWarrantyOptions(outOfBoundsTermQuote)).toHaveLength(0);
  });

  it('foreign holder quote or fixed-price order cannot be confirmed', async () => {
    // Fixed price order
    ((snapshot.order as any).data).pricingMode = 'FIXED_PRICE';
    const ctrlFixed = createCustomerQuotationDecisionController(deps);
    expect(ctrlFixed.confirm('APPROVE')).toBe(false);
    expect(ctrlFixed.getState().phase).toBe('denied');

    // Foreign quote technicianId
    ((snapshot.order as any).data).pricingMode = 'INSPECTION_REQUIRED';
    ((snapshot.resources.quotations as any).data[0]).technicianId = 'tech-foreign';
    const ctrlForeign = createCustomerQuotationDecisionController(deps);
    expect(ctrlForeign.confirm('APPROVE')).toBe(false);
    expect(ctrlForeign.getState().phase).toBe('denied');
  });

  it('failed preflight GET before POST publishes denied and allows successful retry without lock', async () => {
    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.confirm('APPROVE');

    // Preflight refresh throws network error
    coordinator.refreshOrderSession.mockRejectedValueOnce(new Error('Network offline'));

    await ctrl.submit();
    expect(transport.approveQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/Không thể kết nối/);
    expect(journal.hasUnresolved(key)).toBe(false); // No lock!

    // Network recovers -> submit again succeeds!
    let postCalled = false;
    transport.approveQuotation = jest.fn(async () => {
      postCalled = true;
      return { success: true };
    });
    coordinator.refreshOrderSession.mockImplementation(async () => {
      if (postCalled) {
        ((snapshot.resources.quotations as any).data[0]).status = 'APPROVED';
      }
    });
    await ctrl.submit();
    expect(transport.approveQuotation).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('resolved');
  });

  it('target change during deferred journal storage aborts with ZERO POST and failed-known', async () => {
    // Custom storage that mutates snapshot version during setItem (deferred storage)
    let setItemCalled = false;
    const slowStorage = {
      async getItem() { return null; },
      async setItem(_k: string, _v: string) {
        if (!setItemCalled) {
          setItemCalled = true;
          // While journal is awaiting durable write, order technician changes
          ((snapshot.order as any).data).technician = { id: 'tech-changed', fullName: 'Thợ mới' };
        }
      },
    };
    const deferredJournal = createOrderCommandJournal(slowStorage);
    const deferredDeps = { ...deps, journal: deferredJournal };
    const ctrl = createCustomerQuotationDecisionController(deferredDeps);

    ctrl.confirm('APPROVE');
    await ctrl.submit();

    // ZERO POST sent!
    expect(transport.approveQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/dữ liệu đã thay đổi/);
  });

  it('exact readback via transport.getQuotation verifies target and exposes resolvedQuotation with actual scope', async () => {
    transport.getQuotation = jest.fn(async (id: string) => ({
      data: {
        id,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'APPROVED',
        version: 1,
        laborTotal: 150000,
        partsTotal: 100000,
        items: [
          {
            id: warrantyItemId,
            type: 'parts_equipment',
            partSource: 'technician',
            partWarrantyOption: 'paid_warranty',
            description: 'Linh kiện thợ',
            quantity: 1,
            unitPrice: 100000,
            warrantyFee: 25000,
            warrantyTermDays: 90,
          },
        ],
      },
    }));

    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.toggleWarrantyItem(warrantyItemId);
    ctrl.confirm('APPROVE');

    await ctrl.submit();
    expect(transport.getQuotation).toHaveBeenCalledWith(quoteId);
    expect(ctrl.getState().phase).toBe('resolved');
    expect(ctrl.getState().resolvedQuotation).toBeDefined();
    expect(ctrl.getState().resolvedQuotation?.id).toBe(quoteId);
    expect(ctrl.getState().resolvedQuotation?.status).toBe('APPROVED');
  });

  it('malformed exact readback (APPROVED but missing scope) stays unresolved with no fabricated scope', async () => {
    // APPROVED status but empty items and missing subtotals: strict projection
    // must reject, never expose items [] or zero totals as resolved scope.
    transport.getQuotation = jest.fn(async (id: string) => ({
      data: {
        id,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'APPROVED',
        version: 1,
        items: [],
      },
    }));

    const ctrl = createCustomerQuotationDecisionController(deps);
    ctrl.toggleWarrantyItem(warrantyItemId);
    ctrl.confirm('APPROVE');

    await ctrl.submit();
    expect(transport.getQuotation).toHaveBeenCalledWith(quoteId);
    expect(transport.approveQuotation).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('unknown');
    expect(ctrl.getState().resolvedQuotation).toBeNull();
  });

  it('submit restore hasUnresolved releases busy so pending can GET verify, with NO marker deletion/replay', async () => {
    await journal.begin(key, { intentId: 'intent-pending-1', entityId: quoteId, operation: 'quote-decision' });
    const ctrl = createCustomerQuotationDecisionController(deps);
    expect(ctrl.confirm('APPROVE')).toBe(true);

    const refreshBefore = (coordinator.refreshOrderSession as jest.Mock).mock.calls.length;
    await ctrl.submit();
    expect(transport.approveQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('unknown');
    expect(journal.hasUnresolved(key)).toBe(true);
    expect(journal.list(key.userId)).toHaveLength(1);
    expect(coordinator.refreshOrderSession).toHaveBeenCalledTimes(refreshBefore);

    await ctrl.verify();
    expect(coordinator.refreshOrderSession.mock.calls.length).toBeGreaterThan(refreshBefore);
    expect(journal.hasUnresolved(key)).toBe(true);
    expect(journal.list(key.userId)).toHaveLength(1);
    expect(transport.approveQuotation).not.toHaveBeenCalled();
  });

  it('submit restore session-change releases busy without marker replay', async () => {
    const mutatingStorage = {
      async getItem() {
        snapshot.key.sessionGeneration = 999;
        return null;
      },
      async setItem() {},
    };
    const freshJournal = createOrderCommandJournal(mutatingStorage);
    const freshDeps = { ...deps, journal: freshJournal };
    const ctrl = createCustomerQuotationDecisionController(freshDeps);
    expect(ctrl.confirm('APPROVE')).toBe(true);

    await ctrl.submit();
    expect(transport.approveQuotation).not.toHaveBeenCalled();
    expect(freshJournal.list(key.userId)).toHaveLength(0);

    snapshot.key.sessionGeneration = 1;
    await ctrl.submit();
    expect(transport.approveQuotation).toHaveBeenCalledTimes(1);
  });
});
