import { technicianWorkflowStages } from './technician-workflow-stages';
import type { ServiceOrderItem } from '../../api/orders.api';

const order = (fields: Partial<ServiceOrderItem> = {}) => ({
  id: 'order', status: 'ACCEPTED', pricingMode: 'fixed_price', ...fields,
} as ServiceOrderItem);

describe('technician staged presentation', () => {
  it('keeps accepted travel as the current stage without inventing evidence', () => {
    const result = technicianWorkflowStages(order(), 'accepted');
    expect(result.current).toBe('accepted');
    expect(result.steps.filter(step => step.done)).toEqual([]);
  });
  it('does not make fixed price wait for an inspection quote', () => {
    expect(technicianWorkflowStages(order(), 'accepted').steps.map(step => step.id)).not.toContain('quotation');
  });
  it.each(['SENT', 'REJECTED', 'EXPIRED'])('does not treat %s quotation as approved', status => {
    const result = technicianWorkflowStages(order({ pricingMode: 'inspection_required', quotation: { status } as ServiceOrderItem['quotation'] }), 'quotation');
    expect(result.steps.find(step => step.id === 'scope')?.done).toBe(false);
  });
  it('uses verified GPS and recorded BEFORE count independently', () => {
    const result = technicianWorkflowStages(order({ status: 'EN_ROUTE', arrivalVerified: true, beforeEvidenceCount: 0 }), 'before-evidence');
    expect(result.steps.find(step => step.id === 'check-in')?.done).toBe(true);
    expect(result.steps.find(step => step.id === 'before-evidence')?.done).toBe(false);
  });
  it('opens a repair workspace before the optional handover view', () => {
    const value = order({ status: 'UNDER_REPAIR' });
    expect(technicianWorkflowStages(value, 'after-evidence').current).toBe('repair');
    expect(technicianWorkflowStages(value, 'after-evidence', true).current).toBe('after-evidence');
    expect(technicianWorkflowStages(value, 'extras-pending').current).toBe('extras-pending');
  });
  it('preserves ambiguous evidence recovery even before handover', () => {
    expect(technicianWorkflowStages(order({ status: 'UNDER_REPAIR' }), 'after-evidence', false, true).current).toBe('after-evidence');
  });
  it.each([{ customerConfirmed: false, paymentStatus: 'PAID' }, { customerConfirmed: true, paymentStatus: 'UNPAID' }])('does not show success with incomplete acceptance/payment %p', fields => {
    expect(technicianWorkflowStages(order({ status: 'COMPLETED', ...fields } as Partial<ServiceOrderItem>), 'completed-summary').current).toBe('waiting-acceptance');
  });
  it('shows completion only from server completion, acceptance and payment', () => {
    expect(technicianWorkflowStages(order({ status: 'COMPLETED', customerConfirmed: true, paymentStatus: 'PAID' }), 'completed-summary').current).toBe('completed-summary');
  });
  it('does not expose stages for an unverified scene or historical assignment', () => {
    expect(technicianWorkflowStages(order(), 'neutral').steps).toEqual([]);
    expect(technicianWorkflowStages(order({ historical: true }), 'accepted').steps).toEqual([]);
  });
});
