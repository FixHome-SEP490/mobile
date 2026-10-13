import type { StatusView } from './technician-status';

export type WorkOrderNextActionKind =
  | 'begin-travel'
  | 'check-in'
  | 'capture-before-evidence'
  | 'reconcile-before-evidence'
  | 'upload-before-evidence'
  | 'await-quotation'
  | 'start-repair'
  | 'start-repair-blocked'
  | 'await-customer-acceptance'
  | 'await-additional-cost-decision'
  | 'reconcile-after-evidence'
  | 'capture-after-evidence'
  | 'upload-after-evidence'
  | 'request-completion'
  | 'completion-blocked';

/**
 * UI-only priority for additional evidence. The Backend gate decides whether
 * enough images exist; the number currently visible must never hide Upload
 * for a newly selected photo.
 */
export type EvidenceDisplayPriority = 'reconcile' | 'upload' | 'capture' | null;

export function selectEvidenceDisplayPriority(input: {
  needsVerify: boolean;
  hasPendingPhoto: boolean;
  recordedCount: unknown;
}): EvidenceDisplayPriority {
  if (input.needsVerify) return 'reconcile';
  if (input.hasPendingPhoto) return 'upload';
  if (
    typeof input.recordedCount !== 'number' ||
    !Number.isFinite(input.recordedCount) ||
    input.recordedCount < 1
  ) return 'capture';
  return null;
}

/**
 * A pending cost must not hide GET-only evidence reconciliation or a photo
 * already selected for upload. Pending costs still block completion through
 * the existing controller gate.
 */
export type AfterEvidenceDisplayPriority = EvidenceDisplayPriority | 'await-cost';

export function selectAfterEvidenceDisplayPriority(input: {
  needsVerify: boolean;
  hasPendingPhoto: boolean;
  recordedCount: unknown;
  hasPendingCosts: boolean;
}): AfterEvidenceDisplayPriority {
  const step = selectEvidenceDisplayPriority(input);
  if (step === 'reconcile' || step === 'upload') return step;
  if (input.hasPendingCosts) return 'await-cost';
  return step;
}

export interface WorkOrderNextAction {
  kind: WorkOrderNextActionKind;
  heading: string;
  description?: string;
  buttonLabel?: string;
  waitingMessage?: string;
  disabled?: boolean;
  busy?: boolean;
  confirming?: boolean;
  confirmationCopy?: string;
  confirmationDetail?: string;
}

export interface WorkOrderReadinessChecklist {
  title: string;
  items: readonly string[];
  emptyMessage: string;
}

export type WorkOrderSecondaryAction = 'contact' | 'chat';

export interface WorkOrderHierarchyInput {
  currentState: StatusView;
  primaryAction: WorkOrderNextAction | null;
  readiness: WorkOrderReadinessChecklist | null;
  secondaryActions: readonly WorkOrderSecondaryAction[];
}

export type WorkOrderHierarchySection =
  | { kind: 'current-state'; value: StatusView }
  | { kind: 'primary-action'; value: WorkOrderNextAction }
  | { kind: 'readiness'; value: WorkOrderReadinessChecklist }
  | { kind: 'secondary-actions'; value: readonly WorkOrderSecondaryAction[] };

/**
 * Orders already-resolved display data for the Work Order screen.
 * It does not inspect order fields, evaluate gates, or invoke actions.
 */
export function selectTechnicianWorkOrderHierarchy(
  input: WorkOrderHierarchyInput,
): WorkOrderHierarchySection[] {
  const sections: WorkOrderHierarchySection[] = [
    { kind: 'current-state', value: input.currentState },
  ];

  if (input.primaryAction) {
    sections.push({ kind: 'primary-action', value: input.primaryAction });
  }

  if (input.readiness) {
    sections.push({ kind: 'readiness', value: input.readiness });
  }

  if (input.secondaryActions.length > 0) {
    sections.push({ kind: 'secondary-actions', value: input.secondaryActions });
  }

  return sections;
}
