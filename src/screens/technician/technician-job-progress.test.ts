import { currentStepIndex, jobProgress } from './technician-job-progress';

describe('currentStepIndex', () => {
  it('follows the lifecycle', () => {
    expect(currentStepIndex({ status: 'ACCEPTED' })).toBe(0);
    expect(currentStepIndex({ status: 'EN_ROUTE' })).toBe(1);
    expect(currentStepIndex({ status: 'EN_ROUTE', arrivalVerified: true })).toBe(2);
    expect(currentStepIndex({ status: 'under_repair' })).toBe(2);
    expect(currentStepIndex({ status: 'IN_PROGRESS' })).toBe(2);
    expect(currentStepIndex({ status: 'UNDER_REPAIR', completionRequestedAt: '2026-09-30T00:00:00Z' })).toBe(3);
    expect(currentStepIndex({ status: 'COMPLETED' })).toBe(5);
  });

  it('has no position for cancelled or unknown orders', () => {
    expect(currentStepIndex({ status: 'CANCELLED' })).toBeNull();
    expect(currentStepIndex({ status: 'PENDING_CONFIRMATION' })).toBeNull();
    expect(currentStepIndex({ status: undefined })).toBeNull();
  });
});

describe('jobProgress', () => {
  it('marks earlier steps done, one current, the rest todo', () => {
    expect(jobProgress({ status: 'EN_ROUTE' })!.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
  });

  it('marks everything done once completed and returns null when unknown', () => {
    expect(jobProgress({ status: 'COMPLETED' })!.every((s) => s.state === 'done')).toBe(true);
    expect(jobProgress({ status: 'CANCELLED' })).toBeNull();
  });
});
