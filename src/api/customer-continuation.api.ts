// "What can I do now" after the technician stopped or interrupted on site (web platform-continuation.api.ts, customer side).
// The server proves the continuation is for this very order and booking; paths it sends are checked, never opened.
import apiClient from './client';

export interface ContinuationSource { serviceOrderId: string; bookingId: string; incidentId: string; visitGroupId: string | null }
export interface CustomerContinuation {
  version: 1;
  incidentId: string | null;
  serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED' | null;
  serviceOrderStatus: string;
  workStopped?: boolean;
  assignmentReleased?: boolean;
  operationalDisposition?: 'STOPPED' | 'INTERRUPTION_RECORDED' | null;
  oldObligationsReviewRequired: boolean;
  customerContinuation: {
    eligible: boolean;
    independentNewBookingAllowed: boolean;
    prefilledRebookAvailable: boolean;
    sourceCount: number | null;
    source: ContinuationSource | null;
  };
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
export const CONTINUATION_INVALID = 'Chưa xác nhận được kết quả gián đoạn. Vui lòng kiểm tra lại trạng thái.';
const invalid = () => new Error(CONTINUATION_INVALID);

/** Throws for any shape or id that does not belong to this order and booking. Exported for tests. */
export function readContinuation(raw: unknown, orderId: string, bookingId: string, groupId: string | null): CustomerContinuation {
  const data = record(raw) && 'data' in raw ? raw.data : raw;
  if (!record(data) || data.version !== 1 || data.terminalTransitionApplied !== false
    || !['accepted', 'en_route', 'under_repair', 'completed', 'cancelled'].includes(String(data.serviceOrderStatus))
    || !record(data.oldObligations) || !record(data.customerContinuation)) throw invalid();
  const old = data.oldObligations;
  const next = data.customerContinuation;
  const hasStop = 'workStopped' in data || 'assignmentReleased' in data || 'operationalDisposition' in data;
  if (hasStop && (typeof data.workStopped !== 'boolean' || data.assignmentReleased !== data.workStopped
    || data.operationalDisposition !== (data.workStopped ? 'STOPPED' : data.incidentId ? 'INTERRUPTION_RECORDED' : null)
    || (data.workStopped && !next.eligible))) throw invalid();
  if (typeof old.reviewRequired !== 'boolean' || old.quotePreserved !== true || old.moneyPreserved !== true || old.partsPreserved !== true
    || old.physicalReturnAcceptance !== 'MANUAL_SERVICE_MANAGER_ONLY' || old.legacyPartReturnState !== 'NOT_VERIFIED'
    || typeof next.eligible !== 'boolean' || typeof next.independentNewBookingAllowed !== 'boolean'
    || typeof next.prefilledRebookAvailable !== 'boolean' || next.requiresNewSchedule !== true
    || next.requiresPricingRevalidation !== true || next.requiresCustomerConfirmation !== true) throw invalid();
  const hasPrefillMetadata = 'draftPath' in next || 'confirmationPath' in next || 'targetKind' in next || 'sourceCount' in next;
  if (next.eligible) {
    const source = next.source;
    if (!uuid(data.incidentId) || data.serviceOutcome !== 'VERIFIED_INTERRUPTION_RECORDED' || !['en_route', 'under_repair'].includes(String(data.serviceOrderStatus))
      || old.reviewRequired !== true || !record(source) || source.serviceOrderId !== orderId || source.bookingId !== bookingId
      || source.incidentId !== data.incidentId || (source.visitGroupId ?? null) !== groupId) throw invalid();
    if (next.prefilledRebookAvailable) {
      const count = next.sourceCount;
      if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 5
        || next.targetKind !== (count === 1 ? 'booking' : 'visit_group')
        || next.draftPath !== `/api/v1/bookings/${bookingId}/interruption-draft`
        || next.confirmationPath !== `/api/v1/bookings/${bookingId}/interruption-rebook`) throw invalid();
    } else if (hasPrefillMetadata) throw invalid();
  } else if (data.incidentId !== null || data.serviceOutcome !== null || next.source !== null || next.independentNewBookingAllowed
    || next.prefilledRebookAvailable || old.reviewRequired || hasPrefillMetadata) throw invalid();
  return {
    version: 1,
    incidentId: data.incidentId as string | null,
    serviceOutcome: data.serviceOutcome as CustomerContinuation['serviceOutcome'],
    serviceOrderStatus: String(data.serviceOrderStatus),
    ...(hasStop ? {
      workStopped: data.workStopped as boolean,
      assignmentReleased: data.assignmentReleased as boolean,
      operationalDisposition: data.operationalDisposition as CustomerContinuation['operationalDisposition'],
    } : {}),
    oldObligationsReviewRequired: old.reviewRequired,
    customerContinuation: {
      eligible: next.eligible,
      independentNewBookingAllowed: next.independentNewBookingAllowed,
      prefilledRebookAvailable: next.prefilledRebookAvailable,
      sourceCount: next.prefilledRebookAvailable ? (next.sourceCount as number) : null,
      source: next.eligible ? {
        serviceOrderId: orderId, bookingId, incidentId: data.incidentId as string, visitGroupId: groupId,
      } : null,
    },
  };
}

export const customerContinuationApi = {
  async get(orderId: string, bookingId: string, groupId: string | null): Promise<CustomerContinuation> {
    if (!orderId || !bookingId) throw invalid();
    const res = await apiClient.get(`/service-orders/${encodeURIComponent(orderId)}/customer-continuation`);
    return readContinuation(res.data, orderId, bookingId, groupId);
  },
};
