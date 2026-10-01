import type { MySupportCase } from '../../api/support-cases.api';
import {
  allowedCustomerComplaintTypes,
  canMarkComplaintUrgent,
  complaintTypeLabel,
  isComplaintWindowOpen,
  isOpenSupportCase,
  supportCaseStatusLabels,
  validateSupportCaseReason,
} from './customer-support-cases';

const supportCase = (status: MySupportCase['status']): MySupportCase => ({
  id: '11111111-1111-4111-8111-111111111111',
  caseType: 'quality',
  status,
  bookingId: null,
  serviceOrderId: '22222222-2222-4222-8222-222222222222',
  reason: 'Chất lượng sửa chữa chưa đạt yêu cầu.',
  description: null,
  resolutionReason: null,
  evidenceRefs: null,
  isUrgent: false,
  respondBy: null,
  resolvedAt: null,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
});

describe('customer support-case helpers', () => {
  it('mirrors allowed customer complaint categories by order status', () => {
    expect(allowedCustomerComplaintTypes('ACCEPTED')).toEqual([
      'arrival_abnormal',
      'cancellation_review',
      'conduct',
      'other',
    ]);
    expect(allowedCustomerComplaintTypes('UNDER_REPAIR')).toContain('quality');
    expect(allowedCustomerComplaintTypes('COMPLETED', '2026-09-29T00:00:00.000Z', new Date('2026-09-30T00:00:00.000Z')))
      .toContain('cash_mismatch');
    expect(allowedCustomerComplaintTypes('CANCELLED')).toEqual(['cancellation_review', 'other']);
  });

  it('never offers system/warranty escalation types as normal manual complaints', () => {
    for (const status of ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED']) {
      const types = allowedCustomerComplaintTypes(
        status,
        status === 'COMPLETED' ? '2026-09-29T00:00:00.000Z' : null,
        new Date('2026-09-30T00:00:00.000Z'),
      );
      expect(types).not.toContain('warranty_dispute');
      expect(types).not.toContain('matching_exhausted');
      expect(types).not.toContain('cash_non_response');
    }
  });

  it('closes the completed-order complaint UX after seven days but fails open when completion time is unknown', () => {
    const now = new Date('2026-09-30T12:00:00.000Z');
    expect(isComplaintWindowOpen('COMPLETED', '2026-09-23T12:00:00.000Z', now)).toBe(true);
    expect(isComplaintWindowOpen('COMPLETED', '2026-09-23T11:59:59.000Z', now)).toBe(false);
    expect(isComplaintWindowOpen('COMPLETED', null, now)).toBe(true);
    expect(isComplaintWindowOpen('COMPLETED', 'bad-date', now)).toBe(true);
  });

  it('only enables urgent UX for active service-order phases', () => {
    expect(canMarkComplaintUrgent('ACCEPTED')).toBe(true);
    expect(canMarkComplaintUrgent('EN_ROUTE')).toBe(true);
    expect(canMarkComplaintUrgent('UNDER_REPAIR')).toBe(true);
    expect(canMarkComplaintUrgent('COMPLETED')).toBe(false);
    expect(canMarkComplaintUrgent('CANCELLED')).toBe(false);
  });

  it('recognizes open and terminal support cases', () => {
    expect(isOpenSupportCase(supportCase('open'))).toBe(true);
    expect(isOpenSupportCase(supportCase('in_review'))).toBe(true);
    expect(isOpenSupportCase(supportCase('resolved'))).toBe(false);
    expect(isOpenSupportCase(supportCase('rejected'))).toBe(false);
  });

  it('keeps customer-facing labels readable', () => {
    expect(complaintTypeLabel('property_damage')).toBe('Hư hại hoặc mất tài sản');
    expect(supportCaseStatusLabels.in_review).toBe('Đang được xem xét');
  });

  it('requires a 10..2000 character reason in the Mobile UX', () => {
    expect(validateSupportCaseReason('ngắn')).toMatch(/10/);
    expect(validateSupportCaseReason('0123456789')).toBeNull();
    expect(validateSupportCaseReason('a'.repeat(2001))).toMatch(/2000/);
  });
});
