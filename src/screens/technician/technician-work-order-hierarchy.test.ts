import { selectAfterEvidenceDisplayPriority, selectEvidenceDisplayPriority, selectTechnicianWorkOrderHierarchy } from './technician-work-order-hierarchy';

describe('evidence primary-action display priority (presentation only)', () => {
  it('allows additional BEFORE uploads even when at least one photo is recorded', () => {
    expect(selectEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: true, recordedCount: 1,
    })).toBe('upload');
    expect(selectEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: true, recordedCount: 5,
    })).toBe('upload');
  });

  it('preserves GET-only reconcile priority over pending uploads and count', () => {
    expect(selectEvidenceDisplayPriority({
      needsVerify: true, hasPendingPhoto: true, recordedCount: 2,
    })).toBe('reconcile');
  });

  it('requires a first photo only when no usable count exists and no photo is pending', () => {
    expect(selectEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: false, recordedCount: null,
    })).toBe('capture');
    expect(selectEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: false, recordedCount: 0,
    })).toBe('capture');
    expect(selectEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: false, recordedCount: 1,
    })).toBeNull();
  });

  it('never hides after-evidence reconciliation behind pending additional costs', () => {
    expect(selectAfterEvidenceDisplayPriority({
      needsVerify: true, hasPendingPhoto: true, recordedCount: 2, hasPendingCosts: true,
    })).toBe('reconcile');
  });

  it('still uploads newly selected AFTER evidence with recorded count >=1 and pending costs', () => {
    expect(selectAfterEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: true, recordedCount: 1, hasPendingCosts: true,
    })).toBe('upload');
  });

  it('otherwise waits for pending costs without changing the completion gate', () => {
    expect(selectAfterEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: false, recordedCount: 1, hasPendingCosts: true,
    })).toBe('await-cost');
    expect(selectAfterEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: false, recordedCount: 0, hasPendingCosts: true,
    })).toBe('await-cost');
    expect(selectAfterEvidenceDisplayPriority({
      needsVerify: false, hasPendingPhoto: false, recordedCount: 1, hasPendingCosts: false,
    })).toBeNull();
  });
});

describe('selectTechnicianWorkOrderHierarchy', () => {
  it('places the current state, one primary action, its readiness checklist, then quick actions', () => {
    const blockers = ['Cần ảnh sau sửa chữa, số lượng yêu cầu do hệ thống kiểm tra.'];
    const secondaryActions = ['contact', 'chat'] as const;
    const primaryAction = {
      kind: 'request-completion' as const,
      heading: 'Yêu cầu nghiệm thu',
      buttonLabel: 'Gửi yêu cầu nghiệm thu',
    };
    const readiness = {
      title: 'Điều kiện yêu cầu nghiệm thu',
      items: blockers,
      emptyMessage: 'Các điều kiện hiển thị đã sẵn sàng; hệ thống vẫn kiểm tra lại khi gửi yêu cầu.',
    };

    const sections = selectTechnicianWorkOrderHierarchy({
      currentState: { label: 'Đang sửa chữa', tone: 'repair', icon: 'Wrench' },
      primaryAction,
      readiness,
      secondaryActions,
    });

    expect(sections.map(({ kind }) => kind)).toEqual([
      'current-state',
      'primary-action',
      'readiness',
      'secondary-actions',
    ]);
    expect(sections.filter(({ kind }) => kind === 'primary-action')).toHaveLength(1);
    expect(sections[0]).toEqual({
      kind: 'current-state',
      value: { label: 'Đang sửa chữa', tone: 'repair', icon: 'Wrench' },
    });
    expect(sections[1]).toEqual({ kind: 'primary-action', value: primaryAction });
    expect(sections[2]).toEqual({ kind: 'readiness', value: readiness });
    expect(sections[3]).toEqual({ kind: 'secondary-actions', value: secondaryActions });
    expect(blockers).toEqual(['Cần ảnh sau sửa chữa, số lượng yêu cầu do hệ thống kiểm tra.']);
  });

  it('does not invent an action or checklist when they are absent', () => {
    const sections = selectTechnicianWorkOrderHierarchy({
      currentState: { label: 'Trạng thái chưa xác định', tone: 'neutral', icon: 'HelpCircle' },
      primaryAction: null,
      readiness: null,
      secondaryActions: [],
    });

    expect(sections).toEqual([
      {
        kind: 'current-state',
        value: { label: 'Trạng thái chưa xác định', tone: 'neutral', icon: 'HelpCircle' },
      },
    ]);
  });
});
