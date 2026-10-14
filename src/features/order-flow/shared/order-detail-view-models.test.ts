import type { EvidenceResponse } from '../../../api/orders.api';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import { costLineDisplay, invoiceDisplayState, resolveEvidenceViewerItem, resolveProposalReadModel, visibleEvidence } from './order-detail-view-models';

const evidence: EvidenceResponse[] = [
  { id: 'public-1', serviceOrderId: 'order-1', type: 'BEFORE', mediaUrl: 'https://example.test/before.jpg', createdAt: '2026-10-13T00:00:00Z' },
  { id: 'private-face', serviceOrderId: 'order-1', type: 'CHECKIN_FACE', mediaUrl: 'https://example.test/face.jpg', createdAt: '2026-10-13T00:00:00Z' },
];

describe('order detail read models', () => {
  it('shows extras quantity with unit price and server line total without multiplying the total again', () => {
    expect(costLineDisplay({ quantity: 3, unitPrice: 400, lineTotal: 1200 })).toBe('3 × 400 ₫ · Thành tiền: 1.200 ₫');
    expect(costLineDisplay({ quantity: 3, unitPrice: '400', lineTotal: '1200' })).toBe('3 × 400 ₫ · Thành tiền: 1.200 ₫');
    expect(costLineDisplay({ quantity: 0, unitPrice: 0, lineTotal: '0' })).toBe('0 × 0 ₫ · Thành tiền: 0 ₫');
    expect(costLineDisplay({ quantity: 1, unitPrice: '9007199254740993', lineTotal: '9007199254740993' }))
      .toBe('1 × 9.007.199.254.740.993 ₫ · Thành tiền: 9.007.199.254.740.993 ₫');
    expect(costLineDisplay({ quantity: 1, unitPrice: Number.MAX_SAFE_INTEGER + 1, lineTotal: Number.MAX_SAFE_INTEGER + 1 }))
      .toBe('1 × Chưa có dữ liệu · Thành tiền: Chưa có dữ liệu');
    expect(costLineDisplay({ quantity: 1, unitPrice: '1e3', lineTotal: '12.5' }))
      .toBe('1 × Chưa có dữ liệu · Thành tiền: Chưa có dữ liệu');
    expect(costLineDisplay({ quantity: 3 })).toBe('3 × Chưa có đơn giá · Thành tiền: Chưa có dữ liệu');
  });

  it('removes technician face-check evidence from customer gallery and viewer lookup', () => {
    expect(visibleEvidence('customer', evidence).map(item => item.id)).toEqual(['public-1']);
    expect(resolveEvidenceViewerItem('customer', evidence, 'private-face')).toBeNull();
  });

  it('keeps authorized technician face evidence visible', () => {
    expect(resolveEvidenceViewerItem('technician', evidence, 'private-face')?.id).toBe('private-face');
  });

  it('distinguishes invoice not loaded, failed, explicit absence, and a returned invoice', () => {
    expect(invoiceDisplayState({ status: 'unloaded', requestSeq: 0 })).toEqual({ kind: 'unavailable' });
    expect(invoiceDisplayState({ status: 'loading', requestSeq: 1 })).toEqual({ kind: 'loading' });
    expect(invoiceDisplayState({ status: 'error', requestSeq: 1, error: 'unavailable' })).toEqual({ kind: 'unavailable' });
    expect(invoiceDisplayState({ status: 'ready', requestSeq: 1, fetchedAt: 10, data: null })).toEqual({ kind: 'absent' });
    expect(invoiceDisplayState({ status: 'ready', requestSeq: 1, fetchedAt: 10,
      data: { id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'PAID', grandTotal: '125000' } }))
      .toMatchObject({ kind: 'invoice', paymentStatus: 'PAID', total: '125000' });
  });

  it('looks up exact proposal IDs across authorized quote/extra history and preserves status/version', () => {
    const snapshot = createOrderSessionSnapshot({ userId: 'customer-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' });
    snapshot.resources.quotations = readyResource([
      { id: 'q-approved', serviceOrderId: 'order-1', status: 'APPROVED', version: 4, items: [] },
      { id: 'q-old', serviceOrderId: 'order-1', status: 'SUPERSEDED', version: 2, items: [] },
      { id: 'q-rejected', serviceOrderId: 'order-1', status: 'REJECTED', version: 5, items: [] },
    ], 1, 1);
    snapshot.resources.extras = readyResource([
      { id: 'x-approved', serviceOrderId: 'order-1', status: 'APPROVED', reason: 'approved', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] },
    ], 1, 1);
    for (const [proposalId, status, version] of [['q-approved', 'APPROVED', 4], ['q-old', 'SUPERSEDED', 2], ['q-rejected', 'REJECTED', 5]] as const) {
      expect(resolveProposalReadModel(snapshot, proposalId)).toMatchObject({ kind: 'found', items: [{ id: proposalId, status, version }] });
    }
    expect(resolveProposalReadModel(snapshot, 'x-approved')).toMatchObject({ kind: 'found', items: [{ id: 'x-approved', status: 'APPROVED' }] });
    const extra = resolveProposalReadModel(snapshot, 'x-approved');
    expect(extra.kind === 'found' && extra.items[0]).not.toHaveProperty('version');
  });

  it('does not say a proposal ID is missing until both authorized history reads are ready', () => {
    const snapshot = createOrderSessionSnapshot({ userId: 'customer-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' });
    expect(resolveProposalReadModel(snapshot, 'missing')).toEqual({ kind: 'loading' });
    snapshot.resources.quotations = { status: 'error', requestSeq: 1, error: 'unavailable' };
    expect(resolveProposalReadModel(snapshot, 'missing')).toEqual({ kind: 'unavailable' });
    snapshot.resources.quotations = readyResource([], 2, 2);
    snapshot.resources.extras = readyResource([], 2, 2);
    expect(resolveProposalReadModel(snapshot, 'missing')).toEqual({ kind: 'not-found' });
  });

  it('keeps the pending list restricted to sent quotes and pending extras with technician ownership', () => {
    const snapshot = createOrderSessionSnapshot({ userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' });
    snapshot.resources.quotations = readyResource([
      { id: 'q-pending-self', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'SENT', version: 1, items: [] },
      { id: 'q-pending-other', serviceOrderId: 'order-1', technicianId: 'tech-2', status: 'SENT', version: 1, items: [] },
      { id: 'q-approved', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'APPROVED', version: 2, items: [] },
    ], 1, 1);
    snapshot.resources.extras = readyResource([
      { id: 'x-pending', serviceOrderId: 'order-1', status: 'PENDING_APPROVAL', reason: 'pending', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] },
      { id: 'x-approved', serviceOrderId: 'order-1', status: 'APPROVED', reason: 'approved', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] },
    ], 1, 1);
    expect(resolveProposalReadModel(snapshot)).toMatchObject({ kind: 'found', items: [{ id: 'q-pending-self', status: 'SENT' }, { id: 'x-pending', status: 'PENDING_APPROVAL' }] });
    expect(resolveProposalReadModel(snapshot, 'q-pending-other')).toEqual({ kind: 'not-found' });
    expect(resolveProposalReadModel(snapshot, 'q-approved')).toMatchObject({ kind: 'found', items: [{ id: 'q-approved', status: 'APPROVED', version: 2 }] });
  });
});
