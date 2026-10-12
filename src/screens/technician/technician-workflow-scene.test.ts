import {
  selectTechnicianWorkflowScene,
  type TechnicianWorkflowSceneInput,
} from './technician-workflow-scene';
import type { WorkOrderNextActionKind } from './technician-work-order-hierarchy';

function validBase(overrides: Partial<TechnicianWorkflowSceneInput> = {}): TechnicianWorkflowSceneInput {
  const actionKind = overrides.actionKind ?? 'begin-travel';
  const flags =
    actionKind === null || actionKind === undefined
      ? { arrivalVerified: false, completionRequested: false }
      : flagsForKind(actionKind as WorkOrderNextActionKind);
  return {
    actionKind: actionKind as WorkOrderNextActionKind | null,
    orderStatus: 'ACCEPTED',
    historical: false,
    assignedToViewer: true,
    hasError: false,
    offline: false,
    denied: false,
    actionDisabled: false,
    actionBusy: false,
    actionConfirming: false,
    ...flags,
    ...overrides,
  };
}

const ALL_KINDS: WorkOrderNextActionKind[] = [
  'begin-travel',
  'check-in',
  'capture-before-evidence',
  'reconcile-before-evidence',
  'upload-before-evidence',
  'await-quotation',
  'start-repair',
  'start-repair-blocked',
  'await-customer-acceptance',
  'await-additional-cost-decision',
  'reconcile-after-evidence',
  'capture-after-evidence',
  'upload-after-evidence',
  'request-completion',
  'completion-blocked',
];

function statusForKind(kind: WorkOrderNextActionKind): string {
  if (kind === 'begin-travel') return 'ACCEPTED';
  if (
    kind === 'check-in' ||
    kind === 'capture-before-evidence' ||
    kind === 'reconcile-before-evidence' ||
    kind === 'upload-before-evidence' ||
    kind === 'await-quotation' ||
    kind === 'start-repair' ||
    kind === 'start-repair-blocked'
  ) return 'EN_ROUTE';
  return 'UNDER_REPAIR';
}

function flagsForKind(kind: WorkOrderNextActionKind): {
  arrivalVerified: boolean;
  completionRequested: boolean;
} {
  if (
    kind === 'capture-before-evidence' ||
    kind === 'reconcile-before-evidence' ||
    kind === 'upload-before-evidence'
  ) return { arrivalVerified: true, completionRequested: false };
  if (kind === 'await-customer-acceptance') return { arrivalVerified: true, completionRequested: true };
  if (statusForKind(kind) === 'UNDER_REPAIR') return { arrivalVerified: true, completionRequested: false };
  return { arrivalVerified: false, completionRequested: false };
}

describe('technician-workflow-scene P0 read-only selector (RED first)', () => {
  it('covers all 15 WorkOrderNextActionKinds without throwing', () => {
    expect(ALL_KINDS).toHaveLength(15);
    for (const kind of ALL_KINDS) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: kind, orderStatus: statusForKind(kind) }),
      );
      expect(scene.sceneId).not.toBe('neutral');
      expect(typeof scene.title).toBe('string');
      expect(scene.title.length).toBeGreaterThan(0);
    }
  });

  it('maps begin-travel to the accepted scene with an active CTA', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'begin-travel', orderStatus: 'ACCEPTED' }),
    );
    expect(scene.sceneId).toBe('accepted');
    expect(scene.hasPrimaryCta).toBe(true);
    expect(scene.allowOrderDetails).toBe(true);
  });

  it('maps check-in to the arrival scene with an active CTA', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'check-in', orderStatus: 'EN_ROUTE' }),
    );
    expect(scene.sceneId).toBe('check-in');
    expect(scene.hasPrimaryCta).toBe(true);
  });

  it('maps all BEFORE evidence kinds to the before-evidence scene', () => {
    for (const kind of [
      'capture-before-evidence',
      'reconcile-before-evidence',
      'upload-before-evidence',
    ] as const) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: kind, orderStatus: 'EN_ROUTE' }),
      );
      expect(scene.sceneId).toBe('before-evidence');
      expect(scene.hasPrimaryCta).toBe(true);
    }
  });

  it('maps await-quotation to the quotation scene without an active CTA', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'await-quotation', orderStatus: 'EN_ROUTE' }),
    );
    expect(scene.sceneId).toBe('quotation');
    expect(scene.hasPrimaryCta).toBe(false);
  });

  it('maps start-repair to ready scene with CTA and blocked variant without CTA', () => {
    const active = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'start-repair', orderStatus: 'EN_ROUTE' }),
    );
    expect(active.sceneId).toBe('ready-repair');
    expect(active.hasPrimaryCta).toBe(true);
    const blocked = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'start-repair-blocked', orderStatus: 'EN_ROUTE' }),
    );
    expect(blocked.sceneId).toBe('ready-repair');
    expect(blocked.hasPrimaryCta).toBe(false);
  });

  it('maps await-additional-cost-decision to extras scene without CTA', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'await-additional-cost-decision', orderStatus: 'UNDER_REPAIR' }),
    );
    expect(scene.sceneId).toBe('extras-pending');
    expect(scene.hasPrimaryCta).toBe(false);
  });

  it('maps all AFTER evidence kinds to the after-evidence scene', () => {
    for (const kind of [
      'capture-after-evidence',
      'reconcile-after-evidence',
      'upload-after-evidence',
    ] as const) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: kind, orderStatus: 'UNDER_REPAIR' }),
      );
      expect(scene.sceneId).toBe('after-evidence');
      expect(scene.hasPrimaryCta).toBe(true);
    }
  });

  it('maps completion-blocked without CTA and request-completion with CTA', () => {
    const blocked = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'completion-blocked', orderStatus: 'UNDER_REPAIR' }),
    );
    expect(blocked.sceneId).toBe('completion-readiness');
    expect(blocked.hasPrimaryCta).toBe(false);
    const ready = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'request-completion', orderStatus: 'UNDER_REPAIR' }),
    );
    expect(ready.sceneId).toBe('request-completion');
    expect(ready.hasPrimaryCta).toBe(true);
  });

  it('maps await-customer-acceptance to the waiting scene without CTA', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'await-customer-acceptance', orderStatus: 'UNDER_REPAIR' }),
    );
    expect(scene.sceneId).toBe('waiting-acceptance');
    expect(scene.hasPrimaryCta).toBe(false);
  });

  it('returns a read-only completed summary for COMPLETED with no action', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: null, orderStatus: 'COMPLETED' }),
    );
    expect(scene.sceneId).toBe('completed-summary');
    expect(scene.hasPrimaryCta).toBe(false);
    expect(scene.allowContactActions).toBe(false);
  });

  it('returns neutral with no CTA for historical orders', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'request-completion', orderStatus: 'COMPLETED', historical: true }),
    );
    expect(scene.sceneId).toBe('neutral');
    expect(scene.hasPrimaryCta).toBe(false);
    expect(scene.allowOrderDetails).toBe(false);
    expect(scene.allowContactActions).toBe(false);
  });

  it('returns neutral with no CTA when not assigned to the viewer', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ assignedToViewer: false }),
    );
    expect(scene.sceneId).toBe('neutral');
    expect(scene.hasPrimaryCta).toBe(false);
    expect(scene.allowContactActions).toBe(false);
  });

  it('returns neutral with no CTA when viewer assignment is missing', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ assignedToViewer: undefined }),
    );
    expect(scene.sceneId).toBe('neutral');
    expect(scene.hasPrimaryCta).toBe(false);
  });

  it('returns neutral with no CTA on load error, offline, or denied access', () => {
    for (const overrides of [
      { hasError: true },
      { offline: true },
      { denied: true },
    ] as const) {
      const scene = selectTechnicianWorkflowScene(validBase(overrides));
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
      expect(scene.allowOrderDetails).toBe(false);
    }
  });

  it('returns neutral with no CTA for unknown, legacy, and cancelled statuses', () => {
    for (const orderStatus of ['UNKNOWN_THING', 'PENDING_CONFIRMATION', 'CANCELLED', '', null]) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: 'begin-travel', orderStatus }),
      );
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
    }
  });

  it('returns neutral with no CTA for an unknown action kind', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'not-a-real-kind' as unknown as WorkOrderNextActionKind }),
    );
    expect(scene.sceneId).toBe('neutral');
    expect(scene.hasPrimaryCta).toBe(false);
  });

  it('returns neutral with no CTA when a valid kind has no verified status', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'check-in', orderStatus: null }),
    );
    expect(scene.sceneId).toBe('neutral');
    expect(scene.hasPrimaryCta).toBe(false);
  });

  it('never exposes PII, monetary amounts, or raw status codes in labels', () => {
    const scenes = [
      ...ALL_KINDS.map((actionKind) =>
        selectTechnicianWorkflowScene(
          validBase({ actionKind, orderStatus: statusForKind(actionKind) }),
        ),
      ),
      selectTechnicianWorkflowScene(validBase({ actionKind: null, orderStatus: 'COMPLETED' })),
      selectTechnicianWorkflowScene(validBase({ historical: true })),
    ];
    const forbidden = ['090', '091', 'Nguyen Van', '@', '₫', 'VND', 'EN_ROUTE', 'ACCEPTED', 'UNDER_REPAIR'];
    for (const scene of scenes) {
      const text = `${scene.title} ${scene.description}`;
      for (const token of forbidden) {
        expect(text).not.toContain(token);
      }
    }
  });

  it('keeps every output a static safe string without functions or raw input echo', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'request-completion', orderStatus: 'UNDER_REPAIR' }),
    );
    expect(typeof scene.title).toBe('string');
    expect(typeof scene.description).toBe('string');
    expect(typeof scene.hasPrimaryCta).toBe('boolean');
    expect(typeof scene.allowOrderDetails).toBe('boolean');
    expect(typeof scene.allowContactActions).toBe('boolean');
    expect(JSON.stringify(scene)).not.toContain('0901234567');
  });
});

describe('technician-workflow-scene status/action correlation gate (fail-closed)', () => {
  it('rejects every mismatched valid status vs action with neutral and no CTA', () => {
    const mismatches: [WorkOrderNextActionKind, string][] = [
      ['begin-travel', 'EN_ROUTE'],
      ['begin-travel', 'UNDER_REPAIR'],
      ['check-in', 'ACCEPTED'],
      ['check-in', 'UNDER_REPAIR'],
      ['capture-before-evidence', 'ACCEPTED'],
      ['capture-before-evidence', 'UNDER_REPAIR'],
      ['await-quotation', 'ACCEPTED'],
      ['await-quotation', 'UNDER_REPAIR'],
      ['start-repair', 'ACCEPTED'],
      ['start-repair', 'UNDER_REPAIR'],
      ['start-repair-blocked', 'UNDER_REPAIR'],
      ['await-additional-cost-decision', 'EN_ROUTE'],
      ['await-additional-cost-decision', 'ACCEPTED'],
      ['capture-after-evidence', 'EN_ROUTE'],
      ['reconcile-after-evidence', 'ACCEPTED'],
      ['upload-after-evidence', 'EN_ROUTE'],
      ['request-completion', 'EN_ROUTE'],
      ['request-completion', 'ACCEPTED'],
      ['completion-blocked', 'EN_ROUTE'],
      ['completion-blocked', 'ACCEPTED'],
      ['await-customer-acceptance', 'EN_ROUTE'],
      ['await-customer-acceptance', 'ACCEPTED'],
    ];
    for (const [actionKind, orderStatus] of mismatches) {
      const scene = selectTechnicianWorkflowScene(validBase({ actionKind, orderStatus }));
      expect(`${actionKind}+${orderStatus}`).toBe(`${actionKind}+${orderStatus}`);
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
      expect(scene.allowOrderDetails).toBe(false);
    }
  });

  it('returns neutral with no CTA for COMPLETED with any non-null action', () => {
    for (const actionKind of [
      'begin-travel',
      'check-in',
      'capture-before-evidence',
      'request-completion',
      'await-customer-acceptance',
    ] as const) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind, orderStatus: 'COMPLETED' }),
      );
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
      expect(scene.allowOrderDetails).toBe(false);
      expect(scene.allowContactActions).toBe(false);
    }
  });

  it('requires verified arrival for BEFORE evidence scenes', () => {
    for (const actionKind of [
      'capture-before-evidence',
      'reconcile-before-evidence',
      'upload-before-evidence',
    ] as const) {
      for (const arrivalVerified of [false, undefined, null]) {
        const scene = selectTechnicianWorkflowScene(
          validBase({ actionKind, orderStatus: 'EN_ROUTE', arrivalVerified }),
        );
        expect(scene.sceneId).toBe('neutral');
        expect(scene.hasPrimaryCta).toBe(false);
      }
    }
  });

  it('rejects check-in once arrival is verified or arrival state is unknown', () => {
    for (const arrivalVerified of [true, undefined, null]) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: 'check-in', orderStatus: 'EN_ROUTE', arrivalVerified }),
      );
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
    }
  });

  it('requires no completion request for AFTER evidence and completion scenes', () => {
    for (const actionKind of [
      'capture-after-evidence',
      'reconcile-after-evidence',
      'upload-after-evidence',
      'completion-blocked',
      'request-completion',
      'await-additional-cost-decision',
    ] as const) {
      for (const completionRequested of [true, undefined, null]) {
        const scene = selectTechnicianWorkflowScene(
          validBase({ actionKind, orderStatus: 'UNDER_REPAIR', completionRequested }),
        );
        expect(scene.sceneId).toBe('neutral');
        expect(scene.hasPrimaryCta).toBe(false);
      }
    }
  });

  it('requires a completion request for the waiting-acceptance scene', () => {
    for (const completionRequested of [false, undefined, null]) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: 'await-customer-acceptance', orderStatus: 'UNDER_REPAIR', completionRequested }),
      );
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
    }
  });

  it('rejects early-stage actions once completion is already requested', () => {
    for (const actionKind of ['begin-travel', 'check-in', 'start-repair'] as const) {
      const scene = selectTechnicianWorkflowScene(
        validBase({
          actionKind,
          orderStatus: actionKind === 'begin-travel' ? 'ACCEPTED' : 'EN_ROUTE',
          completionRequested: true,
        }),
      );
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
    }
  });

  it('accepts IN_PROGRESS as the UNDER_REPAIR alias for repair scenes', () => {
    const scene = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'capture-after-evidence', orderStatus: 'IN_PROGRESS' }),
    );
    expect(scene.sceneId).toBe('after-evidence');
    expect(scene.hasPrimaryCta).toBe(true);
  });

  it('returns neutral when safety flags are unknown or missing', () => {
    const cases: Partial<TechnicianWorkflowSceneInput>[] = [
      { historical: undefined },
      { historical: null },
      { historical: 'false' },
      { hasError: undefined },
      { offline: undefined },
      { denied: undefined },
    ];
    for (const overrides of cases) {
      const scene = selectTechnicianWorkflowScene(validBase(overrides));
      expect(scene.sceneId).toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(false);
      expect(scene.allowOrderDetails).toBe(false);
    }
  });

  it('suppresses the CTA unless the existing action is explicitly enabled', () => {
    const enabled = selectTechnicianWorkflowScene(
      validBase({ actionKind: 'begin-travel', orderStatus: 'ACCEPTED' }),
    );
    expect(enabled.sceneId).toBe('accepted');
    expect(enabled.hasPrimaryCta).toBe(true);
    for (const overrides of [
      { actionDisabled: true },
      { actionDisabled: undefined },
      { actionBusy: true },
      { actionBusy: undefined },
      { actionConfirming: true },
      { actionConfirming: undefined },
    ] as const) {
      const scene = selectTechnicianWorkflowScene(
        validBase({ actionKind: 'begin-travel', orderStatus: 'ACCEPTED', ...overrides }),
      );
      expect(scene.sceneId).toBe('accepted');
      expect(scene.hasPrimaryCta).toBe(false);
      expect(scene.allowOrderDetails).toBe(true);
    }
  });

  it('keeps the waiting/blocked CTA matrix with explicit action flags', () => {
    const expected: [WorkOrderNextActionKind, string, boolean][] = [
      ['begin-travel', 'ACCEPTED', true],
      ['check-in', 'EN_ROUTE', true],
      ['capture-before-evidence', 'EN_ROUTE', true],
      ['await-quotation', 'EN_ROUTE', false],
      ['start-repair', 'EN_ROUTE', true],
      ['start-repair-blocked', 'EN_ROUTE', false],
      ['await-additional-cost-decision', 'UNDER_REPAIR', false],
      ['capture-after-evidence', 'UNDER_REPAIR', true],
      ['completion-blocked', 'UNDER_REPAIR', false],
      ['request-completion', 'UNDER_REPAIR', true],
      ['await-customer-acceptance', 'UNDER_REPAIR', false],
    ];
    for (const [actionKind, orderStatus, hasPrimaryCta] of expected) {
      const scene = selectTechnicianWorkflowScene(validBase({ actionKind, orderStatus }));
      expect(scene.sceneId).not.toBe('neutral');
      expect(scene.hasPrimaryCta).toBe(hasPrimaryCta);
    }
  });
});
