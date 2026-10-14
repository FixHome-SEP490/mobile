import {
  createCustomerExtraCostDecisionController,
  type CustomerExtraCostDecisionControllerDeps,
  type CustomerExtraCostDecisionTransport,
} from './customer-extra-cost-controller';
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

describe('createCustomerExtraCostController', () => {
  let key: OrderSessionKey;
  let snapshot: OrderSessionSnapshot;
  let journal: ReturnType<typeof createOrderCommandJournal>;
  let transport: CustomerExtraCostDecisionTransport;
  let coordinator: any;
  let isCurrentMock: jest.Mock;
  let notifyMock: jest.Mock;
  let deps: CustomerExtraCostDecisionControllerDeps;

  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const unexpiredDate = new Date(Date.now() + 3600000).toISOString();

  beforeEach(async () => {
    key = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
    snapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.order = readyResource(
      {
        id: 'order-1',
        code: 'SO-01',
        status: 'UNDER_REPAIR',
        customer: { id: 'cust-1' },
      } as any,
      1,
      1,
    );
    snapshot.resources.extras = readyResource(
      [
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL',
          expiresAt: unexpiredDate,
          items: [
            {
              id: validUuid,
              type: 'parts',
              partSource: 'technician',
              partWarrantyOption: 'paid_warranty',
              warrantyFee: 50000,
              warrantyTermDays: 30,
              description: 'Tụ điện chính hãng',
            },
          ],
        } as any,
      ],
      1,
      1,
    );

    journal = createOrderCommandJournal(createMemoryStorage());
    await journal.restore();

    transport = {
      approveCost: jest.fn(async () => ({
        id: 'cost-1',
        status: 'APPROVED',
      })),
      rejectCost: jest.fn(async () => ({
        id: 'cost-1',
        status: 'REJECTED',
      })),
      getAdditionalCosts: jest.fn(async () => [
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'APPROVED',
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

  describe('prepareDecision and toggleWarranty', () => {
    it('prepares approve decision and allows toggling eligible paid warranty options', () => {
      const controller = createCustomerExtraCostDecisionController(deps);

      controller.prepareDecision(key, 'cost-1', 'approve');

      expect(controller.getState().phase).toBe('confirming');
      expect(controller.getState().action).toBe('approve');
      expect(controller.getState().eligibleWarrantyOptions).toHaveLength(1);
      expect(controller.getState().eligibleWarrantyOptions[0]?.itemId).toBe(validUuid);
      expect(controller.getState().selectedWarrantyIds).toEqual([]);

      // Toggle warranty on
      controller.toggleWarranty(validUuid);
      expect(controller.getState().selectedWarrantyIds).toEqual([validUuid]);

      // Toggle warranty off
      controller.toggleWarranty(validUuid);
      expect(controller.getState().selectedWarrantyIds).toEqual([]);
    });

    it('denies prepareDecision when proposal is missing from extras', () => {
      const controller = createCustomerExtraCostDecisionController(deps);

      controller.prepareDecision(key, 'non-existent', 'approve');

      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/Không tìm thấy thông tin/);
    });
  });

  describe('submitDecision approve', () => {
    it('approves cost proposal with selected warranty ids and resolves via exact readback', async () => {
      const controller = createCustomerExtraCostDecisionController(deps);
      controller.prepareDecision(key, 'cost-1', 'approve');
      controller.toggleWarranty(validUuid);

      await controller.submitDecision(key, 'cost-1', 'approve');

      expect(transport.approveCost).toHaveBeenCalledWith('cost-1', [validUuid]);
      expect(transport.getAdditionalCosts).toHaveBeenCalledWith('order-1');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().actionSuccess).toMatch(/Đã duyệt/);
      expect(notifyMock).toHaveBeenCalled();

      // Check journal record
      const markers = journal.list(key.userId);
      expect(markers).toHaveLength(1);
      expect(markers[0]?.stableKey).toBe('decision:approve:cost-1');
      expect(markers[0]?.status).toBe('resolved');
    });

    it('denies approval when proposal is expired', async () => {
      (snapshot.resources.extras as any).data = [
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL',
          expiresAt: '2020-01-01T00:00:00Z', // past
        },
      ];
      const controller = createCustomerExtraCostDecisionController(deps);

      await controller.submitDecision(key, 'cost-1', 'approve');

      expect(transport.approveCost).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/hết hạn/);
    });

    it('denies approval when order is not UNDER_REPAIR', async () => {
      ((snapshot.order as any).data).status = 'COMPLETED';
      const controller = createCustomerExtraCostDecisionController(deps);

      await controller.submitDecision(key, 'cost-1', 'approve');

      expect(transport.approveCost).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/sửa chữa/);
    });

    it('denies approval when proposal has been superseded', async () => {
      (snapshot.resources.extras as any).data = [
        { id: 'cost-1', serviceOrderId: 'order-1', status: 'PENDING_APPROVAL', expiresAt: unexpiredDate },
        { id: 'cost-2', serviceOrderId: 'order-1', supersedesId: 'cost-1', status: 'PENDING_APPROVAL', expiresAt: unexpiredDate },
      ];
      const controller = createCustomerExtraCostDecisionController(deps);

      await controller.submitDecision(key, 'cost-1', 'approve');

      expect(transport.approveCost).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe('denied');
      expect(controller.getState().error).toMatch(/thay thế/);
    });
  });

  describe('submitDecision reject', () => {
    it('rejects cost proposal without affecting overall service order status', async () => {
      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'REJECTED',
        } as any,
      ]);

      const controller = createCustomerExtraCostDecisionController(deps);
      await controller.submitDecision(key, 'cost-1', 'reject', 'Chi phí quá cao');

      expect(transport.rejectCost).toHaveBeenCalledWith('cost-1', 'Chi phí quá cao');
      expect(controller.getState().phase).toBe('resolved');
      expect(controller.getState().actionSuccess).toMatch(/Đã từ chối/);

      // Verify stable key encoded reject action
      const markers = journal.list(key.userId);
      expect(markers[0]?.stableKey).toBe('decision:reject:cost-1');
      expect(markers[0]?.status).toBe('resolved');
    });

    it('transitions to unknown when readback status does not match reject action', async () => {
      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'PENDING_APPROVAL', // Not REJECTED!
        } as any,
      ]);

      const controller = createCustomerExtraCostDecisionController(deps);
      await controller.submitDecision(key, 'cost-1', 'reject');

      expect(controller.getState().phase).toBe('unknown');
    });
  });

  describe('verify', () => {
    it('verifies pending approval decision matching desired outcome', async () => {
      const controller = createCustomerExtraCostDecisionController(deps);
      await journal.begin(key, {
        intentId: 'intent-verify-approve',
        operation: 'extra-decision',
        entityId: 'cost-1',
        stableKey: 'decision:approve:cost-1',
      });
      await journal.mark(key.userId, 'intent-verify-approve', 'unknown');

      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'APPROVED',
        } as any,
      ]);

      await controller.verify(key, 'intent-verify-approve');

      expect(controller.getState().phase).toBe('resolved');
      const marker = journal.list(key.userId).find((m) => m.intentId === 'intent-verify-approve');
      expect(marker?.status).toBe('resolved');
    });

    it('leaves marker unknown when readback status conflicts with desired decision outcome', async () => {
      const controller = createCustomerExtraCostDecisionController(deps);
      await journal.begin(key, {
        intentId: 'intent-verify-conflict',
        operation: 'extra-decision',
        entityId: 'cost-1',
        stableKey: 'decision:approve:cost-1',
      });
      await journal.mark(key.userId, 'intent-verify-conflict', 'unknown');

      (transport.getAdditionalCosts as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cost-1',
          serviceOrderId: 'order-1',
          status: 'REJECTED', // Conflict with approve!
        } as any,
      ]);

      await controller.verify(key, 'intent-verify-conflict');

      expect(controller.getState().phase).toBe('unknown');
    });

    it('ignores verification if marker role is not customer or session differs', async () => {
      const controller = createCustomerExtraCostDecisionController(deps);
      const techKey: OrderSessionKey = {
        userId: 'tech-1',
        role: 'technician',
        sessionGeneration: 1,
        serviceOrderId: 'order-1',
      };
      await journal.begin(techKey, {
        intentId: 'intent-tech-decision',
        operation: 'extra-decision',
        entityId: 'cost-1',
        stableKey: 'decision:approve:cost-1',
      });
      await journal.mark(techKey.userId, 'intent-tech-decision', 'unknown');

      await controller.verify(key, 'intent-tech-decision');
      expect(controller.getState().phase).toBe('idle');
    });
  });
});
