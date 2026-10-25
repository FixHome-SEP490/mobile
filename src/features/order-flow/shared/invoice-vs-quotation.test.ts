import { invoiceVsQuotation } from './order-detail-view-models';
import type { OrderInvoice, OrderQuotation } from '../domain/order-session.types';

const quote = { id: 'q1', serviceOrderId: 'o', status: 'APPROVED', items: [
  { id: 'qa', type: 'PARTS', description: 'Co đồng', quantity: 3, unitPrice: 100 },
  { id: 'qb', type: 'PARTS', description: 'Ron', quantity: 1, unitPrice: 50 },
] } as OrderQuotation;
const invoice = (items: OrderInvoice['items']) => ({ id: 'i', serviceOrderId: 'o', paymentStatus: 'PENDING', grandTotal: 200, items }) as OrderInvoice;

it('shows the quoted quantity where the invoice bills fewer and lists quoted lines that were not used', () => {
  const r = invoiceVsQuotation(invoice([{ id: 'l1', description: 'Co đồng', quantity: 2, lineTotal: 200, sourceType: 'QUOTATION', sourceItemId: 'qa' }]), [quote]);
  expect(r.quotedQty.get('l1')).toBe(3);
  expect(r.unused.map(i => i.id)).toEqual(['qb']);
  expect(r.differs).toBe(true);
});

it('says nothing when the invoice matches the quotation or no quotation is approved', () => {
  const same = invoiceVsQuotation(invoice([
    { id: 'l1', description: 'Co đồng', quantity: 3, lineTotal: 300, sourceType: 'QUOTATION', sourceItemId: 'qa' },
    { id: 'l2', description: 'Ron', quantity: 1, lineTotal: 50, sourceType: 'QUOTATION', sourceItemId: 'qb' },
  ]), [quote]);
  expect(same.differs).toBe(false);
  expect(invoiceVsQuotation(invoice([]), [{ ...quote, status: 'PENDING' }]).differs).toBe(false);
  expect(invoiceVsQuotation(invoice([]), null).differs).toBe(false);
});
