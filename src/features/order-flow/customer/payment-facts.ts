import { wholeVnd } from '../../../api/customer-wallet.api';
import { isHistoricalOrder } from '../../../api/orders.api';
import { sameOrderSession, type OrderSessionKey, type OrderSessionSnapshot } from '../domain/order-session.types';
import type { OrderCommandMarker } from '../runtime/order-command-journal';

export type PaymentMethod = 'wallet' | 'vnpay' | 'cash' | 'no_charge';
export type FinancialResult = 'unverified' | 'unpaid' | 'refunded' | 'paid-awaiting-order' | 'completed' | 'cash-pending' | 'cash-disputed';
export type M6Phase = 'idle' | 'confirming' | 'submitting' | 'verifying' | 'pending' | 'unknown' | 'failed-known' | 'resolved' | 'denied';
export const FINANCIAL_UNKNOWN = 'Chưa xác nhận được kết quả. Vui lòng kiểm tra trạng thái hoặc liên hệ hỗ trợ.';
export function hasCompletionRequest(order: { completionRequestedAt?: unknown } | null) {
  return typeof order?.completionRequestedAt === 'string' && !!order.completionRequestedAt && Number.isFinite(Date.parse(order.completionRequestedAt));
}
export function m6Order(s: OrderSessionSnapshot | null, key: OrderSessionKey) {
  if (!s || !sameOrderSession(s.key, key) || s.access !== 'current' || s.order.status !== 'ready'
    || isHistoricalOrder(s.order.data) || s.order.data.id !== key.serviceOrderId
    || (key.role === 'technician' && s.order.data.technician?.id !== key.userId)) return null;
  return s.order.data;
}
export function invoiceFact(s: OrderSessionSnapshot | null, key: OrderSessionKey) {
  const resource = s?.resources.invoice;
  if (!m6Order(s, key) || resource?.status !== 'ready' || !resource.data) return null;
  const invoice = resource.data, amount = wholeVnd(invoice.grandTotal), status = invoice.paymentStatus.toLowerCase();
  if (!invoice.id || invoice.serviceOrderId !== key.serviceOrderId || amount === null || !['unpaid', 'paid', 'refunded'].includes(status)
    || [invoice.laborTotal, invoice.partsTotal].some(v => v !== undefined && wholeVnd(v) === null)
    || invoice.items?.some(i => wholeVnd(i.lineTotal) === null)) return null;
  return { ...invoice, amount, status };
}
export function cashFact(s: OrderSessionSnapshot | null, key: OrderSessionKey) {
  const resource = s?.resources.cash;
  if (!m6Order(s, key) || resource?.status !== 'ready') return undefined;
  if (resource.data === null) return null;
  const cash = resource.data, amount = wholeVnd(cash.declaredAmount);
  if (!cash.id || cash.serviceOrderId !== key.serviceOrderId || amount === null
    || !cash.declaredByTechnicianId || !cash.declaredAt || !Number.isFinite(Date.parse(cash.declaredAt))
    || !['pending_confirmation', 'confirmed', 'disputed'].includes(cash.status)
    || (cash.confirmedAmount != null && wholeVnd(cash.confirmedAmount) === null)) return undefined;
  return { ...cash, amount };
}
export function financialResult(s: OrderSessionSnapshot | null, key: OrderSessionKey): FinancialResult {
  const invoice = invoiceFact(s, key), order = m6Order(s, key);
  if (!invoice || !order) return 'unverified';
  if (invoice.status === 'paid') return order.status === 'COMPLETED' ? 'completed' : 'paid-awaiting-order';
  if (invoice.status === 'refunded') return 'refunded';
  const cash = cashFact(s, key);
  if (cash === undefined) return 'unverified';
  return cash?.status === 'disputed' ? 'cash-disputed' : cash?.status === 'pending_confirmation' ? 'cash-pending' : 'unpaid';
}
export function isUnresolvedMarker(m: OrderCommandMarker) { return !['resolved', 'failed-known'].includes(m.status); }
export interface CashConfirmationDto { agreed: boolean; confirmedAmount?: number; disputeReason?: string }
export interface CashDeclarationDto { declaredAmount: number; technicianNotes?: string; receiptEvidenceUrl?: string }
function boundedAmount(amount: unknown): amount is number { return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && amount <= 999999999999; }
export function validateCashConfirmation(input: CashConfirmationDto): CashConfirmationDto {
  if (typeof input.agreed !== 'boolean' || (input.confirmedAmount !== undefined && !boundedAmount(input.confirmedAmount))
    || (input.disputeReason !== undefined && (typeof input.disputeReason !== 'string' || input.disputeReason.trim().length > 2000))
    || (!input.agreed && !input.disputeReason?.trim())) throw Error('Hãy kiểm tra số tiền và lý do xác nhận tiền mặt.');
  return { agreed: input.agreed, ...(input.confirmedAmount === undefined ? {} : { confirmedAmount: input.confirmedAmount }),
    ...(input.disputeReason?.trim() ? { disputeReason: input.disputeReason.trim() } : {}) };
}
export function validateCashDeclaration(input: CashDeclarationDto): CashDeclarationDto {
  if (!boundedAmount(input.declaredAmount)
    || (input.technicianNotes !== undefined && (typeof input.technicianNotes !== 'string' || input.technicianNotes.trim().length > 2000))
    || (input.receiptEvidenceUrl !== undefined && (typeof input.receiptEvidenceUrl !== 'string' || !input.receiptEvidenceUrl.trim() || input.receiptEvidenceUrl.length > 2048))) throw Error('Hãy nhập số tiền thực nhận và ghi chú hợp lệ.');
  return { declaredAmount: input.declaredAmount, ...(input.technicianNotes?.trim() ? { technicianNotes: input.technicianNotes.trim() } : {}),
    ...(input.receiptEvidenceUrl ? { receiptEvidenceUrl: input.receiptEvidenceUrl } : {}) };
}
