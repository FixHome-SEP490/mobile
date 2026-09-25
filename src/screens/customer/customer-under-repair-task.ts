export interface CustomerUnderRepairOrder {
  status: unknown;
  completionRequestedAt?: unknown;
  historical?: unknown;
  quotationStatus?: unknown;
}

export interface CustomerUnderRepairCost {
  status: unknown;
}

export type CustomerUnderRepairTaskKind =
  | 'additional_cost_pending'
  | 'quote_inconsistent'
  | 'completion_requested'
  | 'repair_in_progress';

export interface CustomerUnderRepairTask {
  kind: CustomerUnderRepairTaskKind;
  title: string;
  detail: string;
}

export function customerUnderRepairTask(
  order: CustomerUnderRepairOrder | null | undefined,
  costs: readonly CustomerUnderRepairCost[],
): CustomerUnderRepairTask | null {
  if (
    !order ||
    order.historical === true ||
    String(order.status).toUpperCase() !== 'UNDER_REPAIR'
  ) {
    return null;
  }

  if (order.completionRequestedAt) {
    return {
      kind: 'completion_requested',
      title: 'Kỹ thuật viên đã yêu cầu hoàn thành',
      detail:
        'Bạn đang chờ bước nghiệm thu. Xác nhận công việc và thanh toán là hai bước riêng; trạng thái COMPLETED chỉ đến từ Backend.',
    };
  }

  if (
    costs.some(
      (request) =>
        String(request.status).toUpperCase() === 'PENDING_APPROVAL',
    )
  ) {
    return {
      kind: 'additional_cost_pending',
      title: 'Cần phản hồi chi phí phát sinh',
      detail:
        'Duyệt chỉ cộng khoản đề xuất vào đơn; từ chối khoản phát sinh không đồng nghĩa từ chối báo giá ban đầu hoặc hủy ServiceOrder.',
    };
  }

  if (String(order.quotationStatus ?? '').toUpperCase() === 'SENT') {
    return {
      kind: 'quote_inconsistent',
      title: 'Báo giá vẫn đang chờ quyết định',
      detail:
        'Đơn đang sửa nhưng báo giá vẫn ở trạng thái SENT. Hãy làm mới dữ liệu; ứng dụng không tự suy diễn hoặc đổi trạng thái.',
    };
  }

  return {
    kind: 'repair_in_progress',
    title: 'Công việc đang được sửa chữa',
    detail:
      'Theo dõi chi phí phát sinh và bằng chứng sau sửa chữa tại đây. Chưa có bước nào trong trạng thái này tự động đồng nghĩa với thanh toán hoặc hoàn tất.',
  };
}
