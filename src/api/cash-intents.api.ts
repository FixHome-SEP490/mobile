import apiClient from './client';

export type CashIntentScopeKind = 'SOLO' | 'VISIT_GROUP';
export type CashIntentStatus = 'pending' | 'received' | 'cancelled';

export interface CashIntent {
  id: string;
  scopeKind: CashIntentScopeKind;
  scopeId: string;
  status: CashIntentStatus;
  grossVnd: number;
  customerDueVnd: number;
  technicianId: string;
  createdAt: string;
  receivedAt: string | null;
  receiptId: string | null;
}

export interface CashIntentCapability {
  cashFirstEnabled: boolean;
  intent: CashIntent | null;
}

export interface CreateCashIntentPayload {
  commandId: string;
  voucherReservationId?: string;
}

export interface CashIntentCommandPayload {
  intentId: string;
  commandId: string;
}

export interface ReceiveCashIntentPayload extends CashIntentCommandPayload {
  receivedAmountVnd: number;
  receiptEvidenceUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function unwrapEnvelope(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) fail(message);
  return value.data;
}

function assertScopeId(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('/')) fail('Invalid cash intent scope id.');
  return value.trim();
}

function assertUuid(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail(message);
  }
}

function normalizeIntent(value: unknown): CashIntent {
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id.trim()
    || (value.scopeKind !== 'SOLO' && value.scopeKind !== 'VISIT_GROUP')
    || typeof value.scopeId !== 'string' || !value.scopeId.trim()
    || !['pending', 'received', 'cancelled'].includes(String(value.status))
    || !Number.isSafeInteger(value.grossVnd) || (value.grossVnd as number) <= 0
    || !Number.isSafeInteger(value.customerDueVnd) || (value.customerDueVnd as number) <= 0
    || typeof value.technicianId !== 'string' || !value.technicianId.trim()
    || typeof value.createdAt !== 'string' || !value.createdAt.trim()
    || (value.receivedAt !== null && typeof value.receivedAt !== 'string')
    || (value.receiptId !== null && typeof value.receiptId !== 'string')) {
    fail('Backend returned an invalid cash payment intent.');
  }

  return {
    id: value.id.trim(),
    scopeKind: value.scopeKind,
    scopeId: value.scopeId.trim(),
    status: value.status as CashIntentStatus,
    grossVnd: value.grossVnd as number,
    customerDueVnd: value.customerDueVnd as number,
    technicianId: value.technicianId.trim(),
    createdAt: value.createdAt.trim(),
    receivedAt: value.receivedAt as string | null,
    receiptId: value.receiptId as string | null,
  };
}

function normalizeMutationResponse(value: unknown, message: string): CashIntent {
  // Nest TransformInterceptor unwraps the controller's { data: intent } once.
  // The wire response is { success, statusCode, message, data: intent }.
  return normalizeIntent(unwrapEnvelope(value, message));
}

function normalizeScope(scopeKind: CashIntentScopeKind, scopeId: string): string {
  if (scopeKind !== 'SOLO' && scopeKind !== 'VISIT_GROUP') fail('Invalid cash intent scope kind.');
  return `/finance/cash-intents/${scopeKind}/${encodeURIComponent(assertScopeId(scopeId))}`;
}

function assertEvidenceRefs(value: unknown): void {
  if (value !== undefined && (typeof value !== 'string' || value.length > 500)) {
    fail('Invalid cash receipt evidence reference.');
  }
}

export const cashIntentsApi = {
  async get(scopeKind: CashIntentScopeKind, scopeId: string): Promise<CashIntentCapability> {
    const response = await apiClient.get<unknown>(normalizeScope(scopeKind, scopeId));
    // GET returns { success, statusCode, message, data: intent|null,
    // meta: { cashFirstEnabled } }; unlike mutation responses, data may be null.
    const envelope = response.data;
    if (!isRecord(envelope) || envelope.success !== true || !('data' in envelope)
      || !isRecord(envelope.meta) || typeof envelope.meta.cashFirstEnabled !== 'boolean'
      || !(envelope.data === null || isRecord(envelope.data))) {
      fail('Backend returned an invalid cash intent capability response.');
    }
    const intent = envelope.data === null ? null : normalizeIntent(envelope.data);
    if (intent && (intent.scopeKind !== scopeKind || intent.scopeId !== scopeId)) {
      fail('Backend returned a cash intent for another scope.');
    }
    return { cashFirstEnabled: (envelope.meta as { cashFirstEnabled: boolean }).cashFirstEnabled, intent };
  },

  async create(scopeKind: CashIntentScopeKind, scopeId: string, payload: CreateCashIntentPayload): Promise<CashIntent> {
    assertUuid(payload?.commandId, 'Invalid cash intent command id.');
    if (payload.voucherReservationId !== undefined) {
      assertUuid(payload.voucherReservationId, 'Invalid cash intent voucher reservation id.');
    }
    const response = await apiClient.post<unknown>(normalizeScope(scopeKind, scopeId), payload);
    const intent = normalizeMutationResponse(response.data, 'Backend returned an invalid cash intent create response.');
    if (intent.scopeKind !== scopeKind || intent.scopeId !== scopeId) fail('Backend returned a cash intent for another scope.');
    return intent;
  },

  async cancel(scopeKind: CashIntentScopeKind, scopeId: string, payload: CashIntentCommandPayload): Promise<CashIntent> {
    assertUuid(payload?.intentId, 'Invalid cash intent id.');
    assertUuid(payload?.commandId, 'Invalid cash intent command id.');
    const response = await apiClient.post<unknown>(`${normalizeScope(scopeKind, scopeId)}/cancel`, payload);
    const intent = normalizeMutationResponse(response.data, 'Backend returned an invalid cash intent cancel response.');
    if (intent.scopeKind !== scopeKind || intent.scopeId !== scopeId) fail('Backend returned a cash intent for another scope.');
    return intent;
  },

  async receive(scopeKind: CashIntentScopeKind, scopeId: string, payload: ReceiveCashIntentPayload): Promise<CashIntent> {
    assertUuid(payload?.intentId, 'Invalid cash intent id.');
    assertUuid(payload?.commandId, 'Invalid cash intent command id.');
    assertEvidenceRefs(payload.receiptEvidenceUrl);
    if (!Number.isSafeInteger(payload.receivedAmountVnd) || payload.receivedAmountVnd <= 0) {
      fail('Invalid cash receipt amount.');
    }
    const response = await apiClient.post<unknown>(`${normalizeScope(scopeKind, scopeId)}/received`, payload);
    const intent = normalizeMutationResponse(response.data, 'Backend returned an invalid cash intent receipt response.');
    if (intent.scopeKind !== scopeKind || intent.scopeId !== scopeId) fail('Backend returned a cash intent for another scope.');
    return intent;
  },
};
