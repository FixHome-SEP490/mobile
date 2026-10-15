import type { CostRequest, EvidenceResponse } from '../../../api/orders.api';
import type { OrderInvoice, OrderSessionSnapshot, Resource } from '../domain/order-session.types';

const NBSP = ' ';

function formatCostVnd(value: number | string | null | undefined): string | null {
  let integer: string;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    integer = String(value);
  } else if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    integer = value;
  } else {
    return null;
  }

  const negative = integer.startsWith('-');
  const digits = (negative ? integer.slice(1) : integer).replace(/^0+(?=\d)/, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative && digits !== '0' ? '-' : ''}${grouped}${NBSP}₫`;
}

export function costLineDisplay(item: Pick<CostRequest['items'][number], 'quantity'> & {
  unitPrice?: number | string | null;
  lineTotal?: number | string | null;
}): string {
  const unitPrice = item.unitPrice === undefined ? 'Chưa có đơn giá' : formatCostVnd(item.unitPrice) ?? 'Chưa có dữ liệu';
  const lineTotal = item.lineTotal === undefined ? 'Chưa có dữ liệu' : formatCostVnd(item.lineTotal) ?? 'Chưa có dữ liệu';
  return `${item.quantity} × ${unitPrice} · Thành tiền: ${lineTotal}`;
}

export type ProposalReadItem = {
  id: string;
  kind: 'quotation' | 'extra';
  status: string;
  version?: number;
  reason?: string;
  items: { id: string; description: string; quantity: number; unitPrice?: number; lineTotal?: number; warrantyFee?: number | string; warrantyTermDays?: number; partWarrantyOption?: string }[];
};
export type ProposalReadResult = { kind: 'loading' | 'unavailable' | 'not-found' } | { kind: 'found'; items: ProposalReadItem[] };

export function resolveProposalReadModel(snapshot: OrderSessionSnapshot, proposalId?: string): ProposalReadResult {
  const quotes = snapshot.resources.quotations;
  const extras = snapshot.resources.extras;
  if (quotes.status === 'error' || extras.status === 'error') return { kind: 'unavailable' };
  if (quotes.status !== 'ready' || extras.status !== 'ready') return { kind: 'loading' };

  const orderId = snapshot.key.serviceOrderId;
  const ownsQuote = (quote: { serviceOrderId: string; technicianId?: string }) => quote.serviceOrderId === orderId
    && (snapshot.key.role !== 'technician' || quote.technicianId === snapshot.key.userId);
  const quoteRows: ProposalReadItem[] = quotes.data.filter(ownsQuote)
    .filter(quote => proposalId ? quote.id === proposalId : quote.status.toUpperCase() === 'SENT')
    .map(quote => ({ id: quote.id, kind: 'quotation', status: quote.status, version: quote.version,
      items: quote.items.map((item, index) => ({ id: item.id ?? `${quote.id}-${index}`, description: item.description,
        quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal,
        warrantyFee: item.warrantyFee ?? undefined, warrantyTermDays: item.warrantyTermDays ?? undefined, partWarrantyOption: item.partWarrantyOption })) }));
  const extraRows: ProposalReadItem[] = extras.data.filter(extra => extra.serviceOrderId === orderId)
    .filter(extra => proposalId ? extra.id === proposalId : extra.status.toUpperCase() === 'PENDING_APPROVAL')
    .map(extra => ({ id: extra.id, kind: 'extra', status: extra.status, reason: extra.reason,
      items: extra.items.map(item => ({ id: item.id, description: item.description, quantity: item.quantity,
        unitPrice: item.unitPrice, lineTotal: item.lineTotal })) }));
  const items = [...quoteRows, ...extraRows];
  if (proposalId) return items.length ? { kind: 'found', items } : { kind: 'not-found' };
  return { kind: 'found', items };
}

export function visibleEvidence(role: 'customer' | 'technician', evidence: readonly EvidenceResponse[]): EvidenceResponse[] {
  return evidence.filter(item => role === 'technician' || item.type !== 'CHECKIN_FACE');
}

export function resolveEvidenceViewerItem(role: 'customer' | 'technician', evidence: readonly EvidenceResponse[], evidenceId: string): EvidenceResponse | null {
  return visibleEvidence(role, evidence).find(item => item.id === evidenceId) ?? null;
}

export type InvoiceDisplayState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'absent' }
  | { kind: 'invoice'; paymentStatus: string; total: number | string; invoice: OrderInvoice };

export function invoiceDisplayState(resource: Resource<OrderInvoice | null>): InvoiceDisplayState {
  if (resource.status === 'loading') return { kind: 'loading' };
  if (resource.status !== 'ready') return { kind: 'unavailable' };
  if (resource.data === null) return { kind: 'absent' };
  return { kind: 'invoice', paymentStatus: resource.data.paymentStatus, total: resource.data.grandTotal, invoice: resource.data };
}
