import {
  createTechnicianPartsController,
  validateCreatePreRepairPayload,
  validateReceiveQrToken,
  validateItemUsageStatus,
  validateCancelReason,
  type TechnicianPartsControllerDeps,
} from './parts-controller';
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

describe('Parts Validators', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  describe('validateCreatePreRepairPayload', () => {
    it('bounds items between 1 and 50 and enforces quantity 1..100', () => {
      expect(() => validateCreatePreRepairPayload(null)).toThrow(/không hợp lệ/);
      expect(() => validateCreatePreRepairPayload({ items: [] })).toThrow(/từ 1 đến 50/);

      const fiftyItems = Array.from({ length: 50 }, () => ({
        partCatalogId: validUuid,
        quantity: 1,
      }));
      expect(validateCreatePreRepairPayload({ items: fiftyItems }).items).toHaveLength(50);

      const fiftyOneItems = Array.from({ length: 51 }, () => ({
        partCatalogId: validUuid,
        quantity: 1,
      }));
      expect(() => validateCreatePreRepairPayload({ items: fiftyOneItems })).toThrow(/từ 1 đến 50/);

      expect(() =>
        validateCreatePreRepairPayload({
          items: [{ partCatalogId: 'invalid-id', quantity: 1 }],
        }),
      ).toThrow(/không phải UUID hợp lệ/);

      expect(() =>
        validateCreatePreRepairPayload({
          items: [{ partCatalogId: validUuid, quantity: 0 }],
        }),
      ).toThrow(/từ 1 đến 100/);

      expect(() =>
        validateCreatePreRepairPayload({
          items: [{ partCatalogId: validUuid, quantity: 101 }],
        }),
      ).toThrow(/từ 1 đến 100/);
    });

    it('enforces note <= 500 chars and reason <= 2000 chars, fulfillmentMethod defaults to pickup', () => {
      expect(() =>
        validateCreatePreRepairPayload({
          items: [{ partCatalogId: validUuid, quantity: 1, note: 'a'.repeat(501) }],
        }),
      ).toThrow(/không được vượt quá 500/);

      expect(() =>
        validateCreatePreRepairPayload({
          items: [{ partCatalogId: validUuid, quantity: 1 }],
          reason: 'r'.repeat(2001),
        }),
      ).toThrow(/không được vượt quá 2000/);

      const parsed = validateCreatePreRepairPayload({
        items: [{ partCatalogId: validUuid, quantity: 2, note: '  ghi chú ' }],
        reason: '  lý do  ',
        fulfillmentMethod: 'delivery',
      });
      expect(parsed.items[0].note).toBe('ghi chú');
      expect(parsed.reason).toBe('lý do');
      expect(parsed.fulfillmentMethod).toBe('delivery');

      const defaultFulfillment = validateCreatePreRepairPayload({
        items: [{ partCatalogId: validUuid, quantity: 2 }],
      });
      expect(defaultFulfillment.fulfillmentMethod).toBe('pickup');

      expect(() =>
        validateCreatePreRepairPayload({
          items: [{ partCatalogId: validUuid, quantity: 1 }],
          fulfillmentMethod: 'drone' as any,
        }),
      ).toThrow(/chỉ chấp nhận.*pickup.*delivery/i);
    });
  });

  describe('validateReceiveQrToken', () => {
    it('validates qr token bounds 1..128 chars', () => {
      expect(() => validateReceiveQrToken('')).toThrow(/từ 1 đến 128/);
      expect(() => validateReceiveQrToken(null)).toThrow(/không hợp lệ/);
      expect(() => validateReceiveQrToken('a'.repeat(129))).toThrow(/từ 1 đến 128/);
      expect(validateReceiveQrToken('  token-123  ')).toBe('token-123');
    });
  });

  describe('validateItemUsageStatus', () => {
    it('accepts only used or returned', () => {
      expect(validateItemUsageStatus('USED')).toBe('used');
      expect(validateItemUsageStatus('returned')).toBe('returned');
      expect(() => validateItemUsageStatus('discarded')).toThrow(/used.*returned/);
    });
  });

  describe('validateCancelReason', () => {
    it('bounds cancel reason <= 2000 chars', () => {
      expect(validateCancelReason(undefined)).toBeUndefined();
      expect(validateCancelReason('  ')).toBeUndefined();
      expect(validateCancelReason('  Hủy yêu cầu  ')).toBe('Hủy yêu cầu');
      expect(() => validateCancelReason('x'.repeat(2001))).toThrow(/không được vượt quá 2000/);
    });
  });
});

describe('createTechnicianPartsController', () => {
  let key: OrderSessionKey;
  let snapshot: OrderSessionSnapshot;
  let journal: ReturnType<typeof createOrderCommandJournal>;
  let transport: {
    createPreRepair: jest.Mock;
    receiveByQr: jest.Mock;
    updateItemUsage: jest.Mock;
    cancel: jest.Mock;
    getPartRequest: jest.Mock;
  };
  let coordinator: any;
  let isCurrentMock: jest.Mock;
  let notifyMock: jest.Mock;
  let deps: TechnicianPartsControllerDeps;

  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const validPayload = {
    items: [{ partCatalogId: validUuid, quantity: 1, note: 'Cần gấp' }],
    reason: 'Thay thế linh kiện hỏng',
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
        serviceName: 'Sửa tủ lạnh',
        status: 'ACCEPTED',
        customerName: 'Khách',
        customerPhone: '0901234567',
        addressSummary: '123 Phố',
        scheduledAt: '2026-10-14T08:00:00Z',
        technician: { id: 'tech-1', fullName: 'Thợ', phoneNumber: '0908888888', averageRating: null },
        laborTotal: 0,
        partsTotal: 0,
        grandTotal: 0,
        paymentStatus: 'UNPAID',
        createdAt: '2026-10-14T00:00:00Z',
      } as any,
      1,
      1,
    );
    snapshot.resources.parts = readyResource([], 1, 1);

    journal = createOrderCommandJournal(createMemoryStorage());
    await journal.restore();

    transport = {
      createPreRepair: jest.fn(async () => ({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        requestType: 'pre_repair',
        status: 'requested',
        items: [{ id: 'item-1', partCatalogId: validUuid, quantity: 1, usageStatus: 'pending' }],
        fulfillmentMethod: 'pickup',
        createdAt: '2026-10-14T01:00:00Z',
      } as any)),
      receiveByQr: jest.fn(async () => ({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        requestType: 'pre_repair',
        status: 'received',
        items: [{ id: 'item-1', partCatalogId: validUuid, quantity: 1, usageStatus: 'pending' }],
        fulfillmentMethod: 'pickup',
        receivedAt: '2026-10-14T02:00:00Z',
        createdAt: '2026-10-14T01:00:00Z',
      } as any)),
      updateItemUsage: jest.fn(async () => ({
        id: 'item-1',
        partCatalogId: validUuid,
        quantity: 1,
        usageStatus: 'used',
      } as any)),
      cancel: jest.fn(async () => ({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        requestType: 'pre_repair',
        status: 'cancelled',
        items: [{ id: 'item-1', partCatalogId: validUuid, quantity: 1, usageStatus: 'pending' }],
        fulfillmentMethod: 'pickup',
        createdAt: '2026-10-14T01:00:00Z',
      } as any)),
      getPartRequest: jest.fn(async (id: string) => ({
        id,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        requestType: 'pre_repair',
        status: 'requested',
        items: [{ id: 'item-1', partCatalogId: validUuid, quantity: 1, usageStatus: 'pending' }],
        fulfillmentMethod: 'pickup',
        createdAt: '2026-10-14T01:00:00Z',
      } as any)),
    };

    coordinator = {
      getSnapshot: () => snapshot,
      refreshOrderSession: jest.fn(async () => {}),
      loadResource: jest.fn(async () => {}),
    };

    isCurrentMock = jest.fn(() => true);
    notifyMock = jest.fn();

    deps = {
      journal,
      readCoordinator: coordinator,
      isCurrent: isCurrentMock,
      notify: notifyMock,
      transport,
    };
  });

  describe('createPreRepair', () => {
    it('creates pre-repair request successfully when order is ACCEPTED and no active pre-repair exists', async () => {
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).toHaveBeenCalledWith('order-1', expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ partCatalogId: validUuid, quantity: 1 })]),
      }));
      expect(transport.getPartRequest).toHaveBeenCalledWith('req-1');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().resolvedEntityId).toBe('req-1');
      expect(notifyMock).toHaveBeenCalled();
    });

    it('denies creation when order status is not ACCEPTED', async () => {
      ((snapshot.order as any).data).status = 'UNDER_REPAIR';
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/ACCEPTED/);
    });

    it('denies creation when order is assigned to another technician', async () => {
      ((snapshot.order as any).data).technician = { id: 'other-tech' };
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/kỹ thuật viên phụ trách/);
    });

    it('denies creation when active pre-repair already exists', async () => {
      (snapshot.resources.parts as any).data = [
        { id: 'existing-req', requestType: 'pre_repair', status: 'requested' },
      ];
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/đã có yêu cầu linh kiện dự kiến/);
    });

    it('allows creation when existing pre-repair was cancelled', async () => {
      (snapshot.resources.parts as any).data = [
        { id: 'cancelled-req', requestType: 'pre_repair', status: 'cancelled' },
      ];
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).toHaveBeenCalled();
      expect(controller.getState().phase).toBe('resolved');
    });

    it('denies creation when parts resource is unloaded or in error (fail-closed)', async () => {
      snapshot.resources.parts = null as any;
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/Không thể tải danh sách linh kiện/);
    });

    it('denies creation via deferred guard when order changes before wire call', async () => {
      const controller = createTechnicianPartsController(deps);
      // Simulate race where snapshot changes right as command starts
      let called = false;
      const originalGetSnapshot = coordinator.getSnapshot;
      coordinator.getSnapshot = () => {
        if (called) {
          // Deferred guard reads altered state
          return {
            ...snapshot,
            order: readyResource({ ...((snapshot.order as any).data), status: 'COMPLETED' }, 1, 1),
          };
        }
        called = true;
        return originalGetSnapshot();
      };

      await controller.createPreRepair(key, validPayload);

      expect(transport.createPreRepair).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/ACCEPTED/);
    });

    it('persists entityId in journal before readback enabling restart recovery', async () => {
      let recordedEntityId: string | undefined;
      const originalRecordEntity = journal.recordEntity.bind(journal);
      journal.recordEntity = async (userId, intentId, entityId) => {
        recordedEntityId = entityId;
        return originalRecordEntity(userId, intentId, entityId);
      };

      const controller = createTechnicianPartsController(deps);
      await controller.createPreRepair(key, validPayload);

      expect(recordedEntityId).toBe('req-1');
      const markers = journal.list(key.userId);
      expect(markers[0]?.resultEntityId).toBe('req-1');
      expect(markers[0]?.status).toBe('resolved');
    });

    it('marks phase as unknown when 201 response does not return entity id (lost ID protection)', async () => {
      transport.createPreRepair.mockResolvedValueOnce({} as any);
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);

      expect(controller.getState().phase).toBe('unknown');
      expect(controller.getState().error).toMatch(/Chưa xác nhận yêu cầu linh kiện đã được tạo/);
    });

    it('marks phase as unknown when readback verification fails', async () => {
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        requestType: 'pre_repair',
        status: 'cancelled', // Mismatched status!
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.createPreRepair(key, validPayload);

      expect(controller.getState().phase).toBe('unknown');
    });

    it('ignores call if session is not current or role is customer', async () => {
      isCurrentMock.mockReturnValue(false);
      const controller = createTechnicianPartsController(deps);

      await controller.createPreRepair(key, validPayload);
      expect(transport.createPreRepair).not.toHaveBeenCalled();

      isCurrentMock.mockReturnValue(true);
      const customerKey: OrderSessionKey = { ...key, role: 'customer' };
      await controller.createPreRepair(customerKey, validPayload);
      expect(transport.createPreRepair).not.toHaveBeenCalled();
    });
  });

  describe('receiveByQr', () => {
    beforeEach(() => {
      snapshot.resources.parts = readyResource(
        [
          {
            id: 'req-1',
            serviceOrderId: 'order-1',
            technicianId: 'tech-1',
            requestType: 'pre_repair',
            status: 'ready',
            fulfillmentMethod: 'pickup',
            items: [{ id: 'item-1', partCatalogId: validUuid, partNameSnapshot: 'Linh kiện', quantity: 1, usageStatus: 'pending' }],
          },
        ],
        1,
        1,
      );
    });

    it.each(['pickup', 'delivery'] as const)('blocks %s receive if fulfillment state changes during journal storage', async fulfillment => {
      const request = (snapshot.resources.parts as any).data[0];
      request.fulfillmentMethod = fulfillment;
      request.status = fulfillment === 'pickup' ? 'ready' : 'delivering';
      const originalBegin = journal.begin.bind(journal);
      journal.begin = async (...args) => {
        const begun = await originalBegin(...args);
        request.status = fulfillment === 'pickup' ? 'delivering' : 'ready';
        return begun;
      };
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'qr-token');
      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).not.toBe('resolved');
    });

    it('receives pickup parts via QR code when status is ready and marks resolved upon readback', async () => {
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'valid-qr-token-xyz');

      expect(transport.receiveByQr).toHaveBeenCalledWith('req-1', 'valid-qr-token-xyz');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().resolvedEntityId).toBe('req-1');
    });

    it('receives delivery parts via QR code when status is delivering', async () => {
      (snapshot.resources.parts as any).data = [
        {
          id: 'req-2',
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          requestType: 'pre_repair',
          status: 'delivering',
          fulfillmentMethod: 'delivery',
          items: [],
        },
      ];
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-2',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-2', 'valid-qr-token-xyz');

      expect(transport.receiveByQr).toHaveBeenCalledWith('req-2', 'valid-qr-token-xyz');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().resolvedEntityId).toBe('req-2');
    });

    it('denies if pickup request is not yet ready (e.g. approved or requested)', async () => {
      (snapshot.resources.parts as any).data = [
        {
          id: 'req-1',
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          status: 'approved',
          fulfillmentMethod: 'pickup',
        },
      ];
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'valid-qr-token-xyz');

      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/ĐÃ SẴN SÀNG|ready/i);
    });

    it('denies if delivery request is not yet delivering', async () => {
      (snapshot.resources.parts as any).data = [
        {
          id: 'req-1',
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          status: 'ready',
          fulfillmentMethod: 'delivery',
        },
      ];
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'valid-qr-token-xyz');

      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/đang giao/i);
    });

    it('denies if parts resource is unloaded or in error', async () => {
      snapshot.resources.parts = null as any;
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'valid-qr-token-xyz');

      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/chưa sẵn sàng/);
    });

    it('denies if target request is absent from current parts', async () => {
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'non-existent-id', 'valid-qr-token-xyz');

      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/Không tìm thấy yêu cầu linh kiện/);
    });

    it('denies if qrToken is invalid', async () => {
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', '');

      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/Mã QR/);
    });

    it('denies if request belongs to another technician', async () => {
      (snapshot.resources.parts as any).data = [
        { id: 'req-1', serviceOrderId: 'order-1', technicianId: 'other-tech', status: 'ready', fulfillmentMethod: 'pickup' },
      ];
      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'qr-token');

      expect(transport.receiveByQr).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/thuộc về kỹ thuật viên khác/);
    });

    it('transitions to unknown if readback is not received', async () => {
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'ready',
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.receiveByQr(key, 'req-1', 'qr-token');

      expect(controller.getState().phase).toBe('unknown');
    });
  });

  describe('updateItemUsage', () => {
    beforeEach(() => {
      ((snapshot.order as any).data).status = 'UNDER_REPAIR';
      snapshot.resources.parts = readyResource(
        [
          {
            id: 'req-1',
            serviceOrderId: 'order-1',
            technicianId: 'tech-1',
            status: 'received',
            items: [
              { id: 'item-1', partCatalogId: validUuid, partNameSnapshot: 'Linh kiện', quantity: 1, usageStatus: 'pending' },
            ],
          },
        ],
        1,
        1,
      );
    });

    it('updates item usage to used when order is UNDER_REPAIR and no completionRequestedAt', async () => {
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
        items: [{ id: 'item-1', usageStatus: 'used' }],
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'item-1', 'used');

      expect(transport.updateItemUsage).toHaveBeenCalledWith('req-1', 'item-1', 'used');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().actionSuccess).toMatch(/ĐÃ DÙNG/);
    });

    it('updates item usage to returned', async () => {
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
        items: [{ id: 'item-1', usageStatus: 'returned' }],
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'item-1', 'returned');

      expect(transport.updateItemUsage).toHaveBeenCalledWith('req-1', 'item-1', 'returned');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().actionSuccess).toMatch(/HOÀN TRẢ/);
    });

    it('denies if part request status is not received', async () => {
      (snapshot.resources.parts as any).data = [
        {
          id: 'req-1',
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          status: 'ready',
          items: [{ id: 'item-1', usageStatus: 'pending' }],
        },
      ];
      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'item-1', 'used');

      expect(transport.updateItemUsage).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/đã nhận|RECEIVED/);
    });

    it('denies if item is not found in part request', async () => {
      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'non-existent-item', 'used');

      expect(transport.updateItemUsage).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/hạng mục linh kiện/);
    });

    it('denies if status is invalid', async () => {
      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'item-1', 'broken');

      expect(transport.updateItemUsage).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
    });

    it('denies if order is not UNDER_REPAIR', async () => {
      ((snapshot.order as any).data).status = 'ACCEPTED';
      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'item-1', 'used');

      expect(transport.updateItemUsage).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/UNDER_REPAIR/);
    });

    it('denies if order already has completionRequestedAt', async () => {
      ((snapshot.order as any).data).completionRequestedAt = '2026-10-14T03:00:00Z';
      const controller = createTechnicianPartsController(deps);
      await controller.updateItemUsage(key, 'req-1', 'item-1', 'used');

      expect(transport.updateItemUsage).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/hoàn tất/);
    });
  });

  describe('cancelPartRequest', () => {
    beforeEach(() => {
      snapshot.resources.parts = readyResource(
        [
          {
            id: 'req-1',
            serviceOrderId: 'order-1',
            technicianId: 'tech-1',
            status: 'requested',
            items: [],
          },
        ],
        1,
        1,
      );
    });

    it('cancels part request when status is requested', async () => {
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'cancelled',
      } as any);

      const controller = createTechnicianPartsController(deps);
      await controller.cancelPartRequest(key, 'req-1', 'Không cần nữa');

      expect(transport.cancel).toHaveBeenCalledWith('req-1', 'Không cần nữa');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().actionSuccess).toMatch(/Đã hủy/);
    });

    it('denies cancel if request is not found in parts list', async () => {
      const controller = createTechnicianPartsController(deps);
      await controller.cancelPartRequest(key, 'non-existent-req');

      expect(transport.cancel).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/Không tìm thấy yêu cầu linh kiện/);
    });

    it('denies cancel if request is not in requested status', async () => {
      (snapshot.resources.parts as any).data = [
        { id: 'req-1', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'approved' },
      ];

      const controller = createTechnicianPartsController(deps);
      await controller.cancelPartRequest(key, 'req-1');

      expect(transport.cancel).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/REQUESTED/);
    });
  });

  describe('reset and verify', () => {
    it('resets controller state to idle', () => {
      const controller = createTechnicianPartsController(deps);
      controller.reset();
      expect(controller.getState()).toEqual({
        phase: 'idle',
        operation: null,
        targetId: null,
        error: null,
        actionSuccess: null,
        resolvedEntityId: null,
      });
    });

    it('verifies pending command markers through readback', async () => {
      const controller = createTechnicianPartsController(deps);
      await journal.begin(key, {
        intentId: 'intent-verify-1',
        operation: 'parts-cancel',
        entityId: 'req-1',
      });
      await journal.mark(key.userId, 'intent-verify-1', 'unknown');

      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'cancelled',
      } as any);

      await controller.verify(key, 'intent-verify-1');

      expect(controller.getState().phase).toBe('resolved');
      const marker = journal.list(key.userId).find((m) => m.intentId === 'intent-verify-1');
      expect(marker?.status).toBe('resolved');
    });

    it('verifies parts-usage with desired outcome encoded in stableKey', async () => {
      const controller = createTechnicianPartsController(deps);
      await journal.begin(key, {
        intentId: 'intent-usage-used',
        operation: 'parts-usage',
        entityId: 'req-1__item-1',
        stableKey: 'usage:used:item-1',
      });
      await journal.mark(key.userId, 'intent-usage-used', 'unknown');

      // Matching outcome: used
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
        items: [{ id: 'item-1', usageStatus: 'used' }],
      } as any);

      await controller.verify(key, 'intent-usage-used');
      expect(controller.getState().phase).toBe('resolved');

      // Non-matching outcome: expected used, but actual is returned
      await journal.begin(key, {
        intentId: 'intent-usage-conflict',
        operation: 'parts-usage',
        entityId: 'req-1__item-1',
        stableKey: 'usage:used:item-1',
      });
      await journal.mark(key.userId, 'intent-usage-conflict', 'unknown');

      transport.getPartRequest.mockResolvedValueOnce({
        id: 'req-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
        items: [{ id: 'item-1', usageStatus: 'returned' }],
      } as any);

      await controller.verify(key, 'intent-usage-conflict');
      expect(controller.getState().phase).toBe('unknown');
    });

    it('keeps usage intent unresolved when GET returns another request ID', async () => {
      const controller = createTechnicianPartsController(deps);
      await journal.begin(key, {
        intentId: 'intent-wrong-request', operation: 'parts-usage',
        entityId: 'req-1__item-1', stableKey: 'usage:used:item-1',
      });
      await journal.mark(key.userId, 'intent-wrong-request', 'unknown');
      transport.getPartRequest.mockResolvedValueOnce({
        id: 'different-request', serviceOrderId: 'order-1', technicianId: 'tech-1',
        status: 'received', items: [{ id: 'item-1', usageStatus: 'used' }],
      } as any);
      await controller.verify(key, 'intent-wrong-request');
      expect(controller.getState().phase).toBe('unknown');
      expect(journal.list(key.userId)[0].status).toBe('unknown');
    });

    it('fails verification if marker session does not match active session', async () => {
      const controller = createTechnicianPartsController(deps);
      const foreignKey: OrderSessionKey = {
        userId: 'tech-1',
        role: 'technician',
        sessionGeneration: 1,
        serviceOrderId: 'different-order',
      };
      await journal.begin(foreignKey, {
        intentId: 'intent-foreign',
        operation: 'parts-cancel',
        entityId: 'req-1',
      });
      await journal.mark(foreignKey.userId, 'intent-foreign', 'unknown');

      await controller.verify(key, 'intent-foreign');
      expect(controller.getState().phase).toBe('idle');
    });
  });
});
