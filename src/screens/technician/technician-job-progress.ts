// Pure "where am I in this job" model for the detail stepper.
export const JOB_STEPS = ['Di chuyển', 'Đến nơi', 'Sửa chữa', 'Nghiệm thu', 'Hoàn thành'] as const;

export type StepState = 'done' | 'current' | 'todo';

export interface JobProgressInput {
  status: unknown;
  arrivalVerified?: boolean;
  completionRequestedAt?: string | null;
}

/**
 * Index of the step the technician is working on (`JOB_STEPS.length` = everything done),
 * or null when the order is cancelled / has an unknown status. Display only: what the
 * technician may actually do is still decided by the per-action controllers and Backend.
 */
export function currentStepIndex(order: JobProgressInput): number | null {
  switch (String(order.status ?? '').toUpperCase()) {
    case 'ACCEPTED': return 0;
    case 'EN_ROUTE': return order.arrivalVerified ? 2 : 1;
    case 'UNDER_REPAIR':
    case 'IN_PROGRESS': return order.completionRequestedAt ? 3 : 2;
    case 'COMPLETED': return JOB_STEPS.length;
    default: return null;
  }
}

export function jobProgress(order: JobProgressInput): { label: string; state: StepState }[] | null {
  const current = currentStepIndex(order);
  if (current === null) return null;
  return JOB_STEPS.map((label, index) => ({
    label,
    state: index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}
