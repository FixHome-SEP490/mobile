import {
  createTechnicianQuotationController,
  validateQuotationPayload,
  type TechnicianQuotationDependencies,
  type TechnicianQuotationTransport,
} from './technician-quotation-controller';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
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

describe('validateQuotationPayload', () => {
  it('bounds 1, 100, 101 items and 0 items fail closed', () => {
    expect(() => validateQuotationPayload({ items: [] })).toThrow(/từ 1 đến 100/);

    const oneItem = [{ type: 'labor', description: 'Kiểm tra', quantity: 1, unitPrice: 100000 }];
    expect(validateQuotationPayload({ items: oneItem }).items).toHaveLength(1);

    const hundredItems = Array.from({ length: 100 }, (_, i) => ({
      type: 'labor',
      description: `Hạng mục ${i + 1}`,
      quantity: 1,
      unitPrice: 10000,
    }));
    expect(validateQuotationPayload({ items: hundredItems }).items).toHaveLength(100);

    const hundredOneItems = Array.from({ length: 101 }, (_, i) => ({
      type: 'labor',
      description: `Hạng mục ${i + 1}`,
      quantity: 1,
      unitPrice: 10000,
    }));
    expect(() => validateQuotationPayload({ items: hundredOneItems })).toThrow(/từ 1 đến 100/);
  });

  it('validates exact DTO sources: labor with warrantyDays, FixHome catalog UUID, external, and technician parts', () => {
    const payload = validateQuotationPayload({
      note: 'Ghi chú tổng thể',
      items: [
        {
          type: 'labor',
          description: 'Công sửa chữa',
          quantity: 2,
          unitPrice: 150000,
          warrantyDays: 180,
        },
        {
          type: 'parts_equipment',
          partSource: 'fixhome',
          partCatalogId: '123e4567-e89b-12d3-a456-426614174000',
          description: 'Bo mạch chính',
          quantity: 1,
          unitPrice: 500000,
          partNameSnapshot: 'Main PCB',
          partSku: 'SKU-PCB-01',
          warrantyPolicy: 'Chính hãng 1 đổi 1',
        },
        {
          type: 'parts_equipment',
          partSource: 'external',
          description: 'Ống bảo ôn ngoài',
          quantity: 3,
          unitPrice: 50000,
        },
        {
          type: 'parts_equipment',
          partSource: 'technician',
          partWarrantyOption: 'paid_warranty',
          description: 'Tụ ngậm thợ',
          quantity: 1,
          unitPrice: 200000,
          warrantyTermDays: 90,
          warrantyFee: 30000,
        },
        {
          type: 'parts_equipment',
          partSource: 'technician',
          partWarrantyOption: 'no_warranty',
          description: 'Băng keo thợ',
          quantity: 2,
          unitPrice: 10000,
        },
      ],
    });

    expect(payload.note).toBe('Ghi chú tổng thể');
    expect(payload.items).toHaveLength(5);
    expect(payload.items[0]).toEqual({
      type: 'labor',
      description: 'Công sửa chữa',
      quantity: 2,
      unitPrice: 150000,
      warrantyDays: 180,
    });
    expect((payload.items[0] as any).partSource).toBeUndefined();

    expect(payload.items[1]).toEqual({
      type: 'parts_equipment',
      partSource: 'fixhome',
      partCatalogId: '123e4567-e89b-12d3-a456-426614174000',
      description: 'Bo mạch chính',
      quantity: 1,
      unitPrice: 500000,
      partNameSnapshot: 'Main PCB',
      partSku: 'SKU-PCB-01',
      warrantyPolicy: 'Chính hãng 1 đổi 1',
    });

    expect(payload.items[2]).toEqual({
      type: 'parts_equipment',
      partSource: 'external',
      partWarrantyOption: 'no_warranty',
      description: 'Ống bảo ôn ngoài',
      quantity: 3,
      unitPrice: 50000,
    });

    expect(payload.items[3]).toEqual({
      type: 'parts_equipment',
      partSource: 'technician',
      partWarrantyOption: 'paid_warranty',
      description: 'Tụ ngậm thợ',
      quantity: 1,
      unitPrice: 200000,
      warrantyTermDays: 90,
      warrantyFee: 30000,
    });
  });

  it('rejects invalid FixHome catalog ID and out-of-bound quantities/prices', () => {
    expect(() =>
      validateQuotationPayload({
        items: [
          {
            type: 'parts_equipment',
            partSource: 'fixhome',
            partCatalogId: 'invalid-not-uuid',
            description: 'Linh kiện',
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      }),
    ).toThrow(/ID danh mục hợp lệ/);

    expect(() =>
      validateQuotationPayload({
        items: [
          {
            type: 'labor',
            description: 'Công',
            quantity: 0,
            unitPrice: 100000,
          },
        ],
      }),
    ).toThrow(/Số lượng/);

    expect(() =>
      validateQuotationPayload({
        items: [
          {
            type: 'labor',
            description: 'Công',
            quantity: 1,
            unitPrice: -50,
          },
        ],
      }),
    ).toThrow(/Đơn giá/);
  });
});

describe('createTechnicianQuotationController', () => {
  let key: OrderSessionKey;
  let snapshot: OrderSessionSnapshot;
  let journal: ReturnType<typeof createOrderCommandJournal>;
  let transport: TechnicianQuotationTransport;
  let coordinator: any;
  let deps: TechnicianQuotationDependencies;

  const validPayload = {
    items: [
      {
        type: 'labor' as const,
        description: 'Vệ sinh dàn lạnh',
        quantity: 1,
        unitPrice: 150000,
      },
    ],
  };

  beforeEach(async () => {
    key = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
    snapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.order = readyResource(
      {
        id: 'order-1',
        code: 'SO-01',
        bookingId: 'booking-1',
        serviceName: 'Sửa điều hòa',
        status: 'EN_ROUTE',
        arrivalVerified: true,
        pricingMode: 'INSPECTION_REQUIRED',
        customerName: 'Khách hàng',
        customerPhone: '0900000000',
        addressSummary: '123 Đường A',
        scheduledAt: '2026-10-13T02:00:00Z',
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
    snapshot.resources.quotations = readyResource([], 1, 1);

    journal = createOrderCommandJournal(createMemoryStorage());
    await journal.restore();

    transport = {
      createQuotation: jest.fn(async () => ({ id: 'quote-new-1' })),
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
      newIntentId: () => 'intent-qt-1',
    };
  });

  it('a server rejection is final: its own message is shown and nothing stays unresolved, even if the read-back then fails', async () => {
    let posted = false;
    transport.createQuotation = jest.fn(async () => {
      posted = true;
      throw Object.assign(new Error('Request failed'), { response: { status: 409, data: { message: 'Số lượng linh kiện FixHome trong báo giá không khớp các dòng đã yêu cầu.' } } });
    });
    coordinator.refreshOrderSession.mockImplementation(async () => {
      if (posted) throw Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    });
    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);
    await ctrl.submit();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/không khớp các dòng đã yêu cầu/);
    expect(journal.hasUnresolved(key)).toBe(false);
  });

  it('a 401 or a timeout is still not proof: the send stays unknown', async () => {
    transport.createQuotation = jest.fn(async () => {
      throw Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    });
    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);
    await ctrl.submit();
    expect(ctrl.getState().phase).toBe('unknown');
  });

  describe('an old send that left no id', () => {
    const begin = (dispatchedAt: number) => journal.begin(key, { intentId: 'old-1', entityId: 'order-1', operation: 'quote-create' }, dispatchedAt);

    it('is cleared by "check again" when the order has no quote of this technician, so the form opens again', async () => {
      await begin(Date.now() - 10 * 60_000);
      const ctrl = createTechnicianQuotationController(deps);
      await ctrl.verify();
      expect(ctrl.getState().phase).toBe('denied');
      expect(ctrl.getState().message).toMatch(/không đến được hệ thống/);
      expect(journal.hasUnresolved(key)).toBe(false);
    });

    it('stays unknown when this technician already has a quote on the order (cannot tell which send made it)', async () => {
      await begin(Date.now() - 10 * 60_000);
      snapshot.resources.quotations = readyResource([{ id: 'q-old', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'SUPERSEDED', version: 1, items: [] }] as any, 2, 2);
      const ctrl = createTechnicianQuotationController(deps);
      await ctrl.verify();
      expect(ctrl.getState().phase).toBe('unknown');
      expect(journal.hasUnresolved(key)).toBe(true);
    });

    it('stays unknown while the send is recent, because it may still land', async () => {
      await begin(Date.now() - 10_000);
      const ctrl = createTechnicianQuotationController(deps);
      await ctrl.verify();
      expect(ctrl.getState().phase).toBe('unknown');
    });
  });

  it('explicit confirm captures target; cancelConfirm clears draft with zero writes', async () => {
    const ctrl = createTechnicianQuotationController(deps);
    expect(ctrl.confirm(validPayload)).toBe(true);
    expect(ctrl.getState().confirmDraft).not.toBeNull();
    expect(ctrl.getState().confirmDraft?.target.orderId).toBe('order-1');

    ctrl.cancelConfirm();
    expect(ctrl.getState().confirmDraft).toBeNull();
    expect(transport.createQuotation).not.toHaveBeenCalled();
  });

  it('submits confirmed quote, records returned ID, and readback resolves on exact match', async () => {
    const ctrl = createTechnicianQuotationController(deps);
    expect(ctrl.confirm(validPayload)).toBe(true);

    coordinator.refreshOrderSession.mockImplementation(async () => {
      // Simulate server returning the new quotation after POST
      snapshot.resources.quotations = readyResource(
        [
          {
            id: 'quote-new-1',
            serviceOrderId: 'order-1',
            technicianId: 'tech-1',
            status: 'SENT',
            version: 1,
            laborTotal: 150000,
            partsTotal: 0,
            items: [],
          },
        ] as any,
        2,
        2,
      );
    });

    await ctrl.submit();
    expect(transport.createQuotation).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('resolved');
    expect(ctrl.getState().createdQuotationId).toBe('quote-new-1');
  });

  it('lost response on create (no returned ID) stays unresolved and does not guess newest quote', async () => {
    // Transport rejects or returns without an id (e.g. network timeout)
    transport.createQuotation = jest.fn(async () => {
      throw new Error('Network timeout');
    });

    coordinator.refreshOrderSession.mockImplementation(async () => {
      // Even if another quote exists on server, timeout lost ID must NOT correlate
      snapshot.resources.quotations = readyResource(
        [
          {
            id: 'quote-unrelated',
            serviceOrderId: 'order-1',
            technicianId: 'tech-1',
            status: 'SENT',
            version: 5,
            items: [],
          },
        ] as any,
        2,
        2,
      );
    });

    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);
    await ctrl.submit();

    expect(ctrl.getState().phase).toBe('unknown');
    expect(ctrl.getState().message).toMatch(/chưa xác định/);
  });

  it('target change between confirm and submit invalidates confirmation and blocks POST', async () => {
    const ctrl = createTechnicianQuotationController(deps);
    expect(ctrl.confirm(validPayload)).toBe(true);

    // Simulate order status transition before submit
    ((snapshot.order as any).data).status = 'UNDER_REPAIR';

    await ctrl.submit();
    expect(transport.createQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/đã thay đổi/);
  });

  it('denies creation when quotation is already APPROVED', async () => {
    snapshot.resources.quotations = readyResource(
      [
        {
          id: 'quote-approved',
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          status: 'APPROVED',
          items: [],
        },
      ] as any,
      1,
      1,
    );

    const ctrl = createTechnicianQuotationController(deps);
    expect(ctrl.confirm(validPayload)).toBe(false);
    expect(ctrl.getState().phase).toBe('denied');
  });

  it('double-tap submit is prevented and logout/reassign aborts with zero writes', async () => {
    let resolvePost: (val: any) => void;
    const postPromise = new Promise(res => {
      resolvePost = res;
    });
    transport.createQuotation = jest.fn(() => postPromise);

    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);

    const p1 = ctrl.submit();
    const p2 = ctrl.submit(); // second tap while busy

    resolvePost!({ id: 'quote-new-1' });
    await Promise.all([p1, p2]);

    expect(transport.createQuotation).toHaveBeenCalledTimes(1);

    // Test logout/inactive
    deps.isActive = () => false;
    ctrl.confirm(validPayload);
    await ctrl.submit();
    expect(transport.createQuotation).toHaveBeenCalledTimes(1);
  });

  it('fails closed when quotations resource is error or unloaded to prove absence of APPROVED', async () => {
    snapshot.resources.quotations = { status: 'error', requestSeq: 1, error: 'unavailable' };
    const ctrl = createTechnicianQuotationController(deps);
    expect(ctrl.confirm(validPayload)).toBe(false);
    expect(ctrl.getState().phase).toBe('denied');

    snapshot.resources.quotations = { status: 'unloaded', requestSeq: 1 };
    expect(ctrl.confirm(validPayload)).toBe(false);
  });

  it('failed preflight GET before POST publishes denied and allows successful retry without lock', async () => {
    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);

    // Preflight refresh fails
    coordinator.refreshOrderSession.mockRejectedValueOnce(new Error('Network offline'));

    await ctrl.submit();
    expect(transport.createQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/Không thể kết nối/);
    expect(journal.hasUnresolved(key)).toBe(false);

    // Network recovers -> submit succeeds
    let postCalled = false;
    transport.createQuotation = jest.fn(async () => {
      postCalled = true;
      return { id: 'quote-new-1' };
    });
    coordinator.refreshOrderSession.mockImplementation(async () => {
      if (postCalled) {
        snapshot.resources.quotations = readyResource(
          [{ id: 'quote-new-1', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'SENT', version: 1, items: [] }] as any,
          2,
          2,
        );
      }
    });

    await ctrl.submit();
    expect(transport.createQuotation).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('resolved');
  });

  it('target change during deferred journal storage aborts with ZERO POST and failed-known', async () => {
    let setItemCalled = false;
    const slowStorage = {
      async getItem() { return null; },
      async setItem(_k: string, _v: string) {
        if (!setItemCalled) {
          setItemCalled = true;
          // While awaiting durable storage write, order transitions
          ((snapshot.order as any).data).status = 'UNDER_REPAIR';
        }
      },
    };
    const deferredJournal = createOrderCommandJournal(slowStorage);
    const deferredDeps = { ...deps, journal: deferredJournal };
    const ctrl = createTechnicianQuotationController(deferredDeps);

    ctrl.confirm(validPayload);
    await ctrl.submit();

    // ZERO POST sent!
    expect(transport.createQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('denied');
    expect(ctrl.getState().message).toMatch(/dữ liệu đã thay đổi/);
  });

  it('exact readback via transport.getQuotation validates canonical fields and rejects foreign or malformed quotes', async () => {
    transport.createQuotation = jest.fn(async () => ({ id: 'quote-exact-1' }));
    transport.getQuotation = jest.fn(async (id: string) => ({
      data: {
        id,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'SENT',
        version: 1,
        items: [],
      },
    }));

    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);
    await ctrl.submit();

    expect(transport.getQuotation).toHaveBeenCalledWith('quote-exact-1');
    expect(ctrl.getState().phase).toBe('resolved');
    expect(ctrl.getState().createdQuotationId).toBe('quote-exact-1');

    // Foreign technician quote readback fails to unresolved
    transport.getQuotation = jest.fn(async (id: string) => ({
      data: {
        id,
        serviceOrderId: 'order-1',
        technicianId: 'tech-foreign',
        status: 'SENT',
        version: 1,
      },
    }));
    const ctrlForeign = createTechnicianQuotationController(deps);
    ctrlForeign.confirm(validPayload);
    await ctrlForeign.submit();
    expect(ctrlForeign.getState().phase).toBe('unknown');
  });

  it('SUPERSEDED known-ID readback resolves the creation marker (concurrent newer version)', async () => {
    // Another device created a newer version: the exact durable resultEntityId
    // is now SUPERSEDED. This still proves the known creation was recorded.
    transport.createQuotation = jest.fn(async () => ({ id: 'quote-exact-1' }));
    transport.getQuotation = jest.fn(async (id: string) => ({
      data: {
        id,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'SUPERSEDED',
        version: 1,
      },
    }));

    const ctrl = createTechnicianQuotationController(deps);
    ctrl.confirm(validPayload);
    await ctrl.submit();

    expect(transport.getQuotation).toHaveBeenCalledWith('quote-exact-1');
    expect(ctrl.getState().phase).toBe('resolved');
    expect(ctrl.getState().createdQuotationId).toBe('quote-exact-1');
  });

  it('submit restore hasUnresolved releases busy so pending can GET verify, with NO marker deletion/replay', async () => {
    await journal.begin(key, { intentId: 'intent-pending-1', entityId: 'order-1', operation: 'quote-create' });
    const ctrl = createTechnicianQuotationController(deps);
    expect(ctrl.confirm(validPayload)).toBe(true);

    const refreshBefore = (coordinator.refreshOrderSession as jest.Mock).mock.calls.length;
    await ctrl.submit();
    expect(transport.createQuotation).not.toHaveBeenCalled();
    expect(ctrl.getState().phase).toBe('unknown');
    expect(journal.hasUnresolved(key)).toBe(true);
    expect(journal.list(key.userId)).toHaveLength(1);
    expect(coordinator.refreshOrderSession).toHaveBeenCalledTimes(refreshBefore);

    await ctrl.verify();
    expect(coordinator.refreshOrderSession.mock.calls.length).toBeGreaterThan(refreshBefore);
    expect(journal.hasUnresolved(key)).toBe(true);
    expect(journal.list(key.userId)).toHaveLength(1);
    expect(transport.createQuotation).not.toHaveBeenCalled();
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
    const ctrl = createTechnicianQuotationController(freshDeps);
    expect(ctrl.confirm(validPayload)).toBe(true);

    await ctrl.submit();
    expect(transport.createQuotation).not.toHaveBeenCalled();
    expect(freshJournal.list(key.userId)).toHaveLength(0);

    snapshot.key.sessionGeneration = 1;
    transport.createQuotation = jest.fn(async () => ({ id: 'quote-retry-1' }));
    coordinator.refreshOrderSession.mockImplementation(async () => {
      snapshot.resources.quotations = readyResource(
        [{ id: 'quote-retry-1', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'SENT', version: 1, items: [] }] as any,
        2,
        2,
      );
    });
    await ctrl.submit();
    expect(transport.createQuotation).toHaveBeenCalledTimes(1);
  });
});
