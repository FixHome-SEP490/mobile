import { useCallback, useEffect, useRef, useState } from 'react';
import { cashIntentsApi, type CashIntent, type CashIntentCapability, type CashIntentScopeKind } from '../../../api/cash-intents.api';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { pendingPaymentCashNotice } from '../../../utils/pending-payment-cash-notice';
import { newUuidV4 } from './voucher-checkout';

/**
 * Cash first (web #184): the customer asks to pay in cash, the server fixes the amount, and the technician
 * confirms receipt. Only the server's `cashFirstEnabled` and intent decide what is offered; with the flag off the
 * older declaration flow stays. A command id is kept until the server answers so a retry replays, not duplicates.
 */
export function useCashIntent(scopeKind: CashIntentScopeKind, scopeId: string | null) {
  // State is tagged with its scope, so an answer for another order or visit is never shown here.
  const scopeKey = `${scopeKind}:${scopeId ?? ''}`;
  const [read, setRead] = useState<{ key: string; capability: CashIntentCapability } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const createCommandId = useRef<string | null>(null);
  const cancelCommandId = useRef<string | null>(null);
  const receiveCommandId = useRef<string | null>(null);
  const capability = read?.key === scopeKey ? read.capability : null;
  const error = failure?.key === scopeKey ? failure.message : null;

  const refresh = useCallback(async () => {
    if (!scopeId) return;
    try {
      const next = await cashIntentsApi.get(scopeKind, scopeId);
      setRead({ key: `${scopeKind}:${scopeId}`, capability: next });
    } catch {
      // Keep the last server-attested state if the read is unavailable.
    }
  }, [scopeKind, scopeId]);

  useEffect(() => {
    createCommandId.current = null;
    cancelCommandId.current = null;
    receiveCommandId.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the read of the cash request is the effect
    void refresh();
  }, [refresh]);

  useLiveRefresh(['order:updated', 'booking:updated', 'notification:new', 'realtime:resync'], () => { void refresh(); });

  const intent: CashIntent | null = capability?.intent ?? null;
  const cashFirst = capability?.cashFirstEnabled === true;
  const active = cashFirst && (intent?.status === 'pending' || intent?.status === 'received');

  const create = useCallback(async (voucherReservationId?: string) => {
    if (!scopeId || !cashFirst || busy || active) return;
    createCommandId.current ??= newUuidV4();
    setBusy(true); setFailure(null);
    try {
      const created = await cashIntentsApi.create(scopeKind, scopeId, {
        commandId: createCommandId.current,
        ...(voucherReservationId ? { voucherReservationId } : {}),
      });
      setRead({ key: scopeKey, capability: { cashFirstEnabled: true, intent: created } });
      createCommandId.current = null;
    } catch (cause) {
      await refresh();
      setFailure({ key: scopeKey, message: pendingPaymentCashNotice(cause)
        ?? extractApiErrorMessage(cause, 'Chưa tạo được yêu cầu tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') });
    } finally {
      setBusy(false);
    }
  }, [scopeId, scopeKind, scopeKey, cashFirst, busy, active, refresh]);

  const cancel = useCallback(async () => {
    if (!scopeId || !cashFirst || busy || intent?.status !== 'pending') return;
    cancelCommandId.current ??= newUuidV4();
    setBusy(true); setFailure(null);
    try {
      const updated = await cashIntentsApi.cancel(scopeKind, scopeId, { intentId: intent.id, commandId: cancelCommandId.current });
      setRead({ key: scopeKey, capability: { cashFirstEnabled: true, intent: updated } });
      cancelCommandId.current = null;
    } catch (cause) {
      await refresh();
      setFailure({ key: scopeKey, message: extractApiErrorMessage(cause, 'Chưa hủy được yêu cầu tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') });
    } finally {
      setBusy(false);
    }
  }, [scopeId, scopeKind, scopeKey, cashFirst, busy, intent, refresh]);

  /** Technician: the server's own amount is what was received; true only when the server answers `received`. */
  const receive = useCallback(async (): Promise<boolean> => {
    if (!scopeId || !cashFirst || busy || intent?.status !== 'pending' || intent.scopeKind !== scopeKind || intent.scopeId !== scopeId) return false;
    receiveCommandId.current ??= newUuidV4();
    setBusy(true); setFailure(null);
    try {
      const updated = await cashIntentsApi.receive(scopeKind, scopeId, {
        intentId: intent.id, commandId: receiveCommandId.current, receivedAmountVnd: intent.customerDueVnd,
      });
      setRead({ key: scopeKey, capability: { cashFirstEnabled: true, intent: updated } });
      if (updated.status !== 'received') {
        await refresh();
        setFailure({ key: scopeKey, message: 'Hệ thống chưa xác nhận kỹ thuật viên đã nhận tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.' });
        return false;
      }
      receiveCommandId.current = null;
      return true;
    } catch (cause) {
      await refresh();
      setFailure({ key: scopeKey, message: extractApiErrorMessage(cause, 'Chưa xác nhận được tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') });
      return false;
    } finally {
      setBusy(false);
    }
  }, [scopeId, scopeKind, scopeKey, cashFirst, busy, intent, refresh]);

  return { capability, cashFirst, intent, active, busy, error, refresh, create, cancel, receive };
}
