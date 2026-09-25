import { customerUnderRepairTask } from './customer-under-repair-task';

describe('customerUnderRepairTask', () => {
  it('returns null outside an active UNDER_REPAIR order', () => {
    expect(customerUnderRepairTask(null, [])).toBeNull();
    expect(
      customerUnderRepairTask({ status: 'EN_ROUTE' }, []),
    ).toBeNull();
    expect(
      customerUnderRepairTask(
        { status: 'UNDER_REPAIR', historical: true },
        [],
      ),
    ).toBeNull();
  });

  it('prioritizes a technician completion request', () => {
    const task = customerUnderRepairTask(
      {
        status: 'UNDER_REPAIR',
        completionRequestedAt: '2030-01-01T00:00:00Z',
      },
      [{ status: 'PENDING_APPROVAL' }],
    );

    expect(task?.kind).toBe('completion_requested');
    expect(task?.detail).toMatch(/hai bước riêng/i);
    expect(task?.detail).toMatch(/COMPLETED/);
  });

  it('makes pending additional cost the next customer action', () => {
    const task = customerUnderRepairTask(
      { status: 'UNDER_REPAIR' },
      [{ status: 'PENDING_APPROVAL' }],
    );

    expect(task?.kind).toBe('additional_cost_pending');
    expect(task?.detail).toMatch(/không đồng nghĩa/i);
    expect(task?.detail).toMatch(/hủy ServiceOrder/i);
  });

  it('surfaces an inconsistent SENT quote without inventing a transition', () => {
    const task = customerUnderRepairTask(
      {
        status: 'UNDER_REPAIR',
        quotationStatus: 'SENT',
      },
      [],
    );

    expect(task?.kind).toBe('quote_inconsistent');
    expect(task?.detail).toMatch(/không tự suy diễn/i);
  });

  it('otherwise reports repair-in-progress truth only', () => {
    const task = customerUnderRepairTask(
      {
        status: 'UNDER_REPAIR',
        quotationStatus: 'APPROVED',
      },
      [{ status: 'REJECTED' }],
    );

    expect(task?.kind).toBe('repair_in_progress');
    expect(task?.detail).toMatch(/thanh toán/i);
  });
});
