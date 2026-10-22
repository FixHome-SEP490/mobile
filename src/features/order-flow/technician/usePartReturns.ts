import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  partRequestsApi,
  partReturnsApi,
  type PartCustodyReturnRecord,
} from '../../../api/part-requests.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';

export interface PartReturnsMessage { tone: 'error' | 'success'; text: string }

/**
 * Custody ledger of this order's FixHome part lines (BE 19-20/10/2026): exact used quantity and the
 * return declaration. Each write carries its own idempotency key and the ledger version, so a stale
 * version (409) just re-reads the numbers. With the feature off the GET fails 403/404/501/503 and
 * `records` stays empty, which keeps the whole-line buttons.
 */
export function usePartReturns(enabled: boolean, refreshKey: unknown) {
  const { key, refresh } = useOrderSession();
  const orderId = key?.serviceOrderId;
  const [records, setRecords] = useState<Record<string, PartCustodyReturnRecord>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<PartReturnsMessage | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const read = useCallback(async (): Promise<{ list?: PartCustodyReturnRecord[]; error?: unknown } | null> => {
    if (!orderId) return null;
    try { return { list: await partReturnsApi.getByOrderId(orderId) }; } catch (error) { return { error }; }
  }, [orderId]);
  const apply = useCallback((result: Awaited<ReturnType<typeof read>>) => {
    if (!alive.current || !result) return;
    if (result.list) { setRecords(Object.fromEntries(result.list.map(r => [r.partRequestItemId, r]))); return; }
    setRecords({});
    if (!isPartReturnsUnavailableError(result.error)) setMessage({ tone: 'error', text: 'Chưa tải được số liệu hoàn trả linh kiện.' });
  }, []);
  const load = async () => apply(await read());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void read().then(result => { if (!cancelled) apply(result); });
    return () => { cancelled = true; };
  }, [enabled, read, apply, refreshKey]);

  const run = async (write: () => Promise<unknown>, success: string, failure: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setMessage(null);
    try {
      await write();
      if (alive.current) setMessage({ tone: 'success', text: success });
      await Promise.all([refresh('command-readback'), load()]);
      return true;
    } catch (err) {
      if (alive.current) setMessage({ tone: 'error', text: failure });
      // Stale version or a quantity decided elsewhere: read the numbers again before retrying.
      if ((err as { response?: { status?: number } } | null)?.response?.status === 409) await load();
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return {
    records,
    busy,
    message,
    clearMessage: () => setMessage(null),
    saveUsedQty: (requestId: string, record: PartCustodyReturnRecord, quantity: number) => run(
      () => partRequestsApi.updateItemUsage(requestId, record.partRequestItemId, {
        usageStatus: quantity > 0 ? 'used' : 'returned',
        usedQty: quantity,
        expectedVersion: record.version,
        idempotencyKey: createIdempotencyKey('parts-used'),
      }),
      `Đã ghi nhận dùng ${quantity}, cần trả ${record.issuedQty - quantity} linh kiện.`,
      'Không ghi nhận được số lượng đã dùng. Vui lòng thử lại.',
    ),
    declareReturn: (requestId: string, record: PartCustodyReturnRecord, quantity: number) => run(
      () => partReturnsApi.declare(requestId, record.partRequestItemId, {
        quantity, expectedVersion: record.version, idempotencyKey: createIdempotencyKey('declare'),
      }),
      'Đã gửi khai trả. Quản lý dịch vụ sẽ nhận và xác nhận số lượng thực tế.',
      'Không gửi được khai trả linh kiện. Vui lòng thử lại.',
    ),
  };
}
