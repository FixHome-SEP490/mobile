// Technician "không thể tiếp tục" (web platform-continuation.api.ts + group-stop.api.ts): stops the work on one device,
// or on the whole visit when the customer is absent or unreachable. The server records one incident per command id, so
// the command is kept in memory per order: the same content replays the same id, anything else is refused until the
// first answer is known. Nothing here touches money or parts; the manager settles those.
import apiClient from './client';
import { newUuidV4 } from '../features/order-flow/customer/voucher-checkout';

export type StopReasonClass = 'technician_skill_gap' | 'non_technician_exception';
export type StopReasonCode =
  | 'skill_gap' | 'device_too_old' | 'severe_damage' | 'no_compatible_part'
  | 'manufacturer_warranty_or_workshop' | 'dispute_or_other' | 'customer_absent' | 'customer_unreachable';
export type ContactKind = 'CALL_ATTEMPT' | 'IN_APP_NOTIFICATION';

/** `order`: one device (or a solo order). `group`: every open device of a visit, chosen from `orderId`. */
export type StopScope = { kind: 'order'; orderId: string } | { kind: 'group'; groupId: string; orderId: string };

export interface StopInput {
  reasonClass: StopReasonClass;
  reasonCode: StopReasonCode;
  reason: string;
  photoEvidenceIds: string[];
}
export interface ContactReadiness {
  contactCount: number;
  notificationSent: boolean;
  callsSpaced: boolean;
  nextCallAt: string | null;
  nextEligibleAt: string | null;
  serverNow: string;
  ready: boolean;
}
export interface StopOutcome { stoppedCount: number; preservedCount: number }

/** Reasons that stop the whole visit (the customer is not there); the others stop one device. */
export const GROUP_STOP_CODES: readonly StopReasonCode[] = ['customer_absent', 'customer_unreachable'];
export const isCustomerNoShow = (code: StopReasonCode | null | undefined): boolean => !!code && GROUP_STOP_CODES.includes(code);

export class CannotContinueError extends Error {
  constructor(readonly locked: boolean, readonly uncertain: boolean, message?: string) {
    super(message ?? (uncertain
      ? 'Chưa xác nhận được kết quả. Thử lại cùng nội dung để kiểm tra, không gửi yêu cầu khác.'
      : locked ? 'Quyền hoặc trạng thái đơn đã thay đổi. Vui lòng tải lại công việc để kiểm tra.'
        : 'Chưa gửi được yêu cầu. Kiểm tra lý do và ảnh chứng cứ rồi thử lại.'));
    this.name = 'CannotContinueError';
  }
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isUuidV4 = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const invalid = () => new Error('Chưa xác minh được dữ liệu lượt sửa. Vui lòng tải lại để đối chiếu.');
const unwrap = (body: unknown): unknown => (record(body) && 'data' in body ? body.data : body);
const statusOf = (error: unknown): number | undefined => (error as { response?: { status?: number } } | null)?.response?.status;

const orderPath = (id: string) => `/service-orders/${encodeURIComponent(id)}`;
const groupPath = (id: string) => `/visit-groups/${encodeURIComponent(id)}`;

export function readReadiness(value: unknown): ContactReadiness {
  const v = unwrap(value);
  if (!record(v) || !Number.isSafeInteger(v.contactCount) || Number(v.contactCount) < 0
    || typeof v.notificationSent !== 'boolean' || typeof v.callsSpaced !== 'boolean' || typeof v.ready !== 'boolean'
    || !isDate(v.serverNow) || !(v.nextCallAt === null || isDate(v.nextCallAt)) || !(v.nextEligibleAt === null || isDate(v.nextEligibleAt))
    || (v.ready && (Number(v.contactCount) < 2 || !v.notificationSent || !v.callsSpaced || !isDate(v.nextEligibleAt)
      || Date.parse(v.nextEligibleAt) > Date.parse(v.serverNow)))) throw invalid();
  return {
    contactCount: Number(v.contactCount), notificationSent: v.notificationSent, callsSpaced: v.callsSpaced,
    nextCallAt: v.nextCallAt as string | null, nextEligibleAt: v.nextEligibleAt as string | null, serverNow: v.serverNow, ready: v.ready,
  };
}

/** Trim, bound and order the input so an identical retry compares equal. Throws a plain (editable) error when it is not valid. */
export function normalizeStop(scope: StopScope, input: StopInput): StopInput {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const photos = input.photoEvidenceIds;
  const classOk = input.reasonClass === 'technician_skill_gap'
    ? input.reasonCode === 'skill_gap'
    : input.reasonClass === 'non_technician_exception' && input.reasonCode !== 'skill_gap';
  const groupOk = scope.kind === 'group' ? isCustomerNoShow(input.reasonCode) : true;
  if (!classOk || !groupOk || reason.length < 10 || reason.length > 2000 || !Array.isArray(photos) || photos.length > 3
    || photos.some((id) => !isUuidV4(id)) || new Set(photos.map((id) => id.toLowerCase())).size !== photos.length) throw new CannotContinueError(false, false);
  return { reasonClass: input.reasonClass, reasonCode: input.reasonCode, reason, photoEvidenceIds: photos.map((id) => id.toLowerCase()).sort() };
}

function readOrderStop(value: unknown): StopOutcome {
  const v = unwrap(value);
  if (!record(v) || v.serviceOutcome !== 'VERIFIED_INTERRUPTION_RECORDED' || !isUuidV4(v.incidentId)) {
    throw new Error('Chưa xác nhận được kết quả gián đoạn. Vui lòng kiểm tra lại trạng thái.');
  }
  return { stoppedCount: 1, preservedCount: 0 };
}

function readGroupStop(value: unknown, groupId: string, commandId: string, orderId: string): StopOutcome {
  const v = unwrap(value);
  if (!record(v) || v.version !== 1 || v.groupId !== groupId || v.commandId !== commandId
    || !Array.isArray(v.stopped) || v.stopped.length < 1 || !Array.isArray(v.preserved)
    || !v.stopped.some((row) => record(row) && row.orderId === orderId && row.workStopped === true)) throw invalid();
  return { stoppedCount: v.stopped.length, preservedCount: v.preserved.length };
}

const scopeKey = (scope: StopScope) => (scope.kind === 'group' ? `g:${scope.groupId}` : `o:${scope.orderId}`);

interface Entry { command: StopInput & { commandId: string }; locked: boolean; retry: boolean; result?: StopOutcome }

/** Page-owned command memory (never localStorage): an exact replay reads the stored receipt even after the assignment is released. */
export function createCannotContinuePort() {
  const entries = new Map<string, Entry>();
  const contacts = new Map<string, { commandId: string; kind: ContactKind }>();
  const running = new Set<string>();
  let epoch = 0;
  return {
    reset() { ++epoch; entries.clear(); contacts.clear(); running.clear(); },
    /** True while a command is waiting for a known answer: only the same content may be sent again. */
    isLocked(scope: StopScope): boolean { return entries.get(scopeKey(scope))?.locked ?? false; },
    retryAllowed(scope: StopScope): boolean { return entries.get(scopeKey(scope))?.retry ?? true; },
    pendingContact(scope: StopScope): ContactKind | null { return contacts.get(scopeKey(scope))?.kind ?? null; },

    async readiness(scope: StopScope): Promise<ContactReadiness> {
      const res = scope.kind === 'group'
        ? await apiClient.get(`${groupPath(scope.groupId)}/contact-readiness`, { params: { selectedOrderId: scope.orderId } })
        : await apiClient.get(`${orderPath(scope.orderId)}/contact-readiness`);
      return readReadiness(res.data);
    },

    /** A contact attempt keeps its command id until the server answers, so a lost reply is replayed, not doubled. */
    async contact(scope: StopScope, kind: ContactKind): Promise<ContactReadiness> {
      const key = scopeKey(scope);
      const prior = contacts.get(key);
      if (prior && prior.kind !== kind) throw new Error('Cần đối chiếu lần liên hệ trước bằng cùng thao tác.');
      const command = prior ?? { commandId: newUuidV4(), kind };
      contacts.set(key, command);
      const requestEpoch = epoch;
      const res = scope.kind === 'group'
        ? await apiClient.post(`${groupPath(scope.groupId)}/contact-attempt`, { selectedOrderId: scope.orderId, commandId: command.commandId, kind })
        : await apiClient.post(`${orderPath(scope.orderId)}/contact-attempt`, { commandId: command.commandId, kind });
      if (requestEpoch !== epoch) throw invalid();
      const readiness = readReadiness(res.data);
      contacts.delete(key);
      return readiness;
    },

    async stop(scope: StopScope, input: StopInput): Promise<StopOutcome> {
      const key = scopeKey(scope);
      const normalized = normalizeStop(scope, input);
      const prior = entries.get(key);
      const same = !!prior && JSON.stringify(normalizeStop(scope, prior.command)) === JSON.stringify(normalized);
      if (running.has(key) || (prior && !same && prior.locked)) throw new CannotContinueError(true, true);
      if (same && prior?.result) return prior.result;
      if (prior && !prior.retry) throw new CannotContinueError(true, false);
      const entry: Entry = same && prior ? prior : { command: { ...normalized, commandId: newUuidV4() }, locked: true, retry: true };
      entries.set(key, entry);
      running.add(key);
      const requestEpoch = epoch;
      try {
        const res = scope.kind === 'group'
          ? await apiClient.post(`${groupPath(scope.groupId)}/cannot-continue`, { selectedOrderId: scope.orderId, ...entry.command })
          : await apiClient.post(`${orderPath(scope.orderId)}/cannot-continue`, entry.command);
        const result = scope.kind === 'group'
          ? readGroupStop(res.data, scope.groupId, entry.command.commandId, scope.orderId)
          : readOrderStop(res.data);
        if (requestEpoch !== epoch) throw invalid();
        entry.result = result;
        return result;
      } catch (error) {
        const status = statusOf(error);
        const editable = status === 400 || status === 422;
        const uncertain = status === undefined || status === 408 || status >= 500;
        if (requestEpoch === epoch) { entry.locked = !editable; entry.retry = editable || uncertain; }
        const message = uncertain ? undefined : stopErrorMessage(scope, status);
        throw new CannotContinueError(!editable, uncertain, uncertain && scope.kind === 'group'
          ? 'Chưa xác nhận được kết quả cả lượt. Kiểm tra lại bằng cùng lệnh và nội dung; không tạo báo cáo khác.' : message);
      } finally { if (requestEpoch === epoch) running.delete(key); }
    },
  };
}
export type CannotContinuePort = ReturnType<typeof createCannotContinuePort>;

function stopErrorMessage(scope: StopScope, status: number | undefined): string | undefined {
  if (status === 409) {
    return scope.kind === 'group'
      ? 'Điều kiện liên hệ, trạng thái máy hoặc tài chính đã thay đổi. Tải lại công việc và kiểm tra; cần quản lý đối soát nếu vẫn bị chặn.'
      : 'Trạng thái máy hoặc phân công đã thay đổi. Đóng màn này và tải lại công việc để kiểm tra gián đoạn, check-in và người đang được giao.';
  }
  if (status === 404) return 'Không còn tìm thấy công việc này. Đóng màn này và tải lại danh sách công việc.';
  if (status === 429) return 'Bạn gửi yêu cầu quá nhanh. Đóng màn này và kiểm tra trạng thái công việc trước khi thử lại.';
  return undefined;
}

/** One port for the app session; `reset()` on sign-out. */
export const cannotContinuePort = createCannotContinuePort();
