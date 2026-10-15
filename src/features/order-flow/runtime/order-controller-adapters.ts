import { ordersApi } from '../../../api/orders.api';
import apiClient from '../../../api/client';
import type { OrderSessionKey } from '../domain/order-session.types';
import type { OrderCommandIntent, OrderCommandJournal } from './order-command-journal';
import type { OrderReadDependencies } from './order-read-coordinator';

/** GET-only dependency bridge. Existing controllers keep their explicit DTOs and preliminary guards. */
export const orderReadDependencies: OrderReadDependencies = {
  readOrder: key => key.role === 'technician' ? ordersApi.getTechnicianOrder(key.serviceOrderId) : ordersApi.getOrder(key.serviceOrderId),
  readResource: (key, kind) => {
    const id = key.serviceOrderId;
    switch (kind) {
      case 'evidence': return ordersApi.getEvidence(id);
      case 'quotations': return ordersApi.getQuotations(id);
      case 'extras': return ordersApi.getAdditionalCosts(id);
      // The legacy parts helper coerces malformed payloads to []; retain the exact
      // shared transport here so the session boundary can distinguish invalid from empty.
      case 'parts': return apiClient.get(`/service-orders/${id}/part-requests`).then(res => {
        const body: unknown = res.data;
        return body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
      });
      case 'invoice': return ordersApi.getInvoice(id);
      case 'cash': return ordersApi.getCashSettlement(id);
      case 'history': return ordersApi.getStatusHistory(id);
    }
  },
};
export type CommandReadbackVerdict = 'resolved' | 'failed-known' | 'unresolved';
/** Small safety adapter, not a workflow engine: callers supply an existing command and exact readback proof. */
export function createOrderCommandAdapter(journal: OrderCommandJournal, deps: {
  isCurrent: (key: OrderSessionKey) => boolean;
  refresh: (key: OrderSessionKey) => Promise<void>;
}) {
  return {
    async dispatch(key: OrderSessionKey, intent: OrderCommandIntent, command: () => Promise<unknown>, readback: () => CommandReadbackVerdict | Promise<CommandReadbackVerdict>): Promise<void> {
      if (!deps.isCurrent(key) || !await journal.begin(key, intent)) return;
      // Storage can take time. If session changed before dispatch, no command was sent.
      if (!deps.isCurrent(key)) { await journal.mark(key.userId, intent.intentId, 'failed-known'); return; }
      try {
        try { await command(); } catch { /* POST errors alone do not prove no effect (cash409, auth401). */ }
        await journal.mark(key.userId, intent.intentId, 'verifying');
        if (!deps.isCurrent(key)) { await journal.mark(key.userId, intent.intentId, 'unknown'); return; }
        await deps.refresh(key);
        if (!deps.isCurrent(key)) { await journal.mark(key.userId, intent.intentId, 'unknown'); return; }
        const verdict = await readback();
        if (!deps.isCurrent(key)) { await journal.mark(key.userId, intent.intentId, 'unknown'); return; }
        await journal.mark(key.userId, intent.intentId, verdict === 'unresolved' ? 'unknown' : verdict);
      } catch {
        // A successful POST followed by a failed GET is still an unresolved intent.
        await journal.mark(key.userId, intent.intentId, 'unknown');
      }
    },
    async verify(key: OrderSessionKey, intentId: string, readback: () => CommandReadbackVerdict | Promise<CommandReadbackVerdict>): Promise<void> {
      if (!deps.isCurrent(key)) return;
      await deps.refresh(key);
      if (!deps.isCurrent(key)) return;
      const verdict = await readback();
      if (!deps.isCurrent(key)) return;
      if (verdict !== 'unresolved') await journal.mark(key.userId, intentId, verdict);
    },
  };
}
