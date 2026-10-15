import {
  createTechnicianExtraCostController,
  type TechnicianExtraCostControllerDeps,
  type TechnicianExtraCostTransport,
} from './technician-extra-cost-controller';
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

describe('createTechnicianExtraCostController', () => {
  let key: OrderSessionKey;
  let snapshot: OrderSessionSnapshot;
  let journal: ReturnType<typeof createOrderCommandJournal>;
  let transport: TechnicianExtraCostTransport;
  let coordinator: any;
  let isCurrentMock: jest.Mock;
  let notifyMock: jest.Mock;
  let deps: TechnicianExtraCostControllerDeps;

  const validPayload = {
    reason: 'Phát sinh ống đồng mục hỏng cần thay mới',
    items: [
      {
        description: 'Ống đồng phi 10',
        quantity: 1,
        unitPrice: 250000,
        type: 'parts_equipment' as const,
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
        status: 'UNDER_REPAIR',
        technician: { id: 'tech-1' },
      } as any,
      1,
      1,
    );
    snapshot.resources.extras = readyResource([], 1, 1);

    journal = createOrderCommandJournal(createMemoryStorage());
    await journal.restore();

    transport = {
      createProposal: jest.fn(async () => ({
        id: 'cost-1',
        serviceOrderId: 'order-1',
        status: 'PENDING_APPROVAL',
        items: [{ id: 'item-1', description: 'Ống đồng phi 10', amount: 250000 }],
      })),
      reviseProposal: jest.fn(async () => ({
        id: 'cost-1',
        serviceOrderId: 'order-1',
        status: 'PENDING_APPROVAL',
      })),
      getAdditionalCosts: jest.fn(async () => [
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL',
          items: [{ id: 'item-1', description: 'Ống đồng phi 10', amount: 250000 }],
        } as any,
      ]),
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

  describe('createProposal', () => {
    it('creates proposal successfully, records created ID in journal, and marks resolved via exact list readback', async () => {
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(transport.createProposal).toHaveBeenCalledWith('order-1', validPayload);
      expect(transport.getAdditionalCosts).toHaveBeenCalledWith('order-1');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().resolvedEntityId).toBe('cost-1');
      expect(notifyMock).toHaveBeenCalled();

      // Check journal entityId persistence before readback
      const markers = journal.list(key.userId);
      expect(markers).toHaveLength(1);
      expect(markers[0]?.resultEntityId).toBe('cost-1');
      expect(markers[0]?.status).toBe('resolved');
    });

    it('denies proposal creation when order is not UNDER_REPAIR', async () => {
      ((snapshot.order as any).data).status = 'ACCEPTED';
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(transport.createProposal).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/UNDER_REPAIR/);
    });

    it('denies proposal creation when completionRequestedAt is already present', async () => {
      ((snapshot.order as any).data).completionRequestedAt = '2026-10-14T03:00:00Z';
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(transport.createProposal).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/hoàn tất/);
    });

    it('denies proposal creation when order belongs to another technician', async () => {
      ((snapshot.order as any).data).technician = { id: 'other-tech' };
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(transport.createProposal).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/kỹ thuật viên phụ trách/);
    });

    it('allows another independent proposal while an existing proposal awaits approval', async () => {
      (snapshot.resources.extras as any).data = [
        { id: 'cost-existing', serviceOrderId: 'order-1', status: 'PENDING_APPROVAL' },
      ];
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(transport.createProposal).toHaveBeenCalledTimes(1);
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().resolvedEntityId).toBe('cost-1');
    });

    it('denies creation when the extras resource is unavailable', async () => {
      snapshot.resources.extras = { status: 'error', error: 'offline', requestSeq: 1 } as any;
      const controller = createTechnicianExtraCostController(deps);
      await controller.createProposal(key, validPayload);
      expect(transport.createProposal).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(journal.list(key.userId)).toHaveLength(0);
    });

    it('denies proposal creation via deferred guard when snapshot changes before wire call', async () => {
      const controller = createTechnicianExtraCostController(deps);
      let called = false;
      const originalGetSnapshot = coordinator.getSnapshot;
      coordinator.getSnapshot = () => {
        if (called) {
          return {
            ...snapshot,
            order: readyResource({ ...((snapshot.order as any).data), status: 'COMPLETED' }, 1, 1),
          };
        }
        called = true;
        return originalGetSnapshot();
      };

      await controller.createProposal(key, validPayload);

      expect(transport.createProposal).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/UNDER_REPAIR/);
    });

    it('transitions to unknown when 201 response does not return an ID (lost ID protection)', async () => {
      (transport.createProposal as jest.Mock).mockResolvedValueOnce({} as any);
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(controller.getState().phase).toBe('unknown');
      expect(controller.getState().error).toMatch(/Chưa xác nhận.*chi phí phát sinh/);
    });

    it('transitions to unknown when readback does not find the captured proposal in authorized list', async () => {
      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([]); // empty list returned
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);

      expect(controller.getState().phase).toBe('unknown');
    });

    it('ignores proposal call if role is customer or session is not current', async () => {
      isCurrentMock.mockReturnValue(false);
      const controller = createTechnicianExtraCostController(deps);

      await controller.createProposal(key, validPayload);
      expect(transport.createProposal).not.toHaveBeenCalled();

      isCurrentMock.mockReturnValue(true);
      const customerKey: OrderSessionKey = { ...key, role: 'customer' };
      await controller.createProposal(customerKey, validPayload);
      expect(transport.createProposal).not.toHaveBeenCalled();
    });
  });

  describe('reviseProposal', () => {
    it('revises existing proposal and marks resolved', async () => {
      (snapshot.resources.extras as any).data = [
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      ];
      const controller = createTechnicianExtraCostController(deps);

      await controller.reviseProposal(key, 'cost-1', validPayload);

      expect(transport.reviseProposal).toHaveBeenCalledWith('cost-1', validPayload);
      expect(transport.getAdditionalCosts).toHaveBeenCalledWith('order-1');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().resolvedEntityId).toBe('cost-1');
    });

    it('denies revise if costId is missing', async () => {
      const controller = createTechnicianExtraCostController(deps);

      await controller.reviseProposal(key, '', validPayload);

      expect(transport.reviseProposal).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/Không tìm thấy đề xuất cần sửa/);
    });
  });

  describe('verify', () => {
    it('verifies pending extra-create command through authorized readback list', async () => {
      const controller = createTechnicianExtraCostController(deps);
      await journal.begin(key, {
        intentId: 'intent-extra-verify',
        operation: 'extra-create',
        entityId: 'order-1',
        resultEntityId: 'cost-1',
      });
      await journal.mark(key.userId, 'intent-extra-verify', 'unknown');

      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL',
        } as any,
      ]);

      await controller.verify(key, 'intent-extra-verify');

      expect(controller.getState().phase).toBe('resolved');
      const marker = journal.list(key.userId).find((m) => m.intentId === 'intent-extra-verify');
      expect(marker?.status).toBe('resolved');
    });

    it('leaves marker unknown if resultEntityId is missing (lost ID cannot prove newest match)', async () => {
      const controller = createTechnicianExtraCostController(deps);
      await journal.begin(key, {
        intentId: 'intent-extra-lost',
        operation: 'extra-create',
        entityId: 'order-1',
        // resultEntityId is intentionally undefined
      });
      await journal.mark(key.userId, 'intent-extra-lost', 'unknown');

      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cost-newest',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL',
        } as any,
      ]);

      await controller.verify(key, 'intent-extra-lost');

      expect(controller.getState().phase).toBe('unknown');
      const marker = journal.list(key.userId).find((m) => m.intentId === 'intent-extra-lost');
      expect(marker?.status).toBe('unknown');
    });

    it('ignores verification if marker does not belong to active session', async () => {
      const controller = createTechnicianExtraCostController(deps);
      const foreignKey: OrderSessionKey = {
        userId: 'tech-1',
        role: 'technician',
        sessionGeneration: 1,
        serviceOrderId: 'other-order',
      };
      await journal.begin(foreignKey, {
        intentId: 'intent-foreign',
        operation: 'extra-create',
        entityId: 'other-order',
        resultEntityId: 'cost-9',
      });
      await journal.mark(foreignKey.userId, 'intent-foreign', 'unknown');

      await controller.verify(key, 'intent-foreign');
      expect(controller.getState().phase).toBe('idle');
    });
  });
});
