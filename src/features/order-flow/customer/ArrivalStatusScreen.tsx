import React from 'react';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import StatusStepScreen from './StatusStepScreen';

/** C04 — EN_ROUTE without an actionable quote. Read-only; never shows face evidence. */
export default function ArrivalStatusScreen() {
  const { snapshot } = useOrderSession();
  const value = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const verified = !!value && !isHistoricalOrder(value) && value.arrivalVerified === true;
  return <StatusStepScreen title="Kỹ thuật viên đang đến" stage={verified ? 2 : 1}
    message="Kỹ thuật viên đang di chuyển tới điểm hẹn. Bạn sẽ thấy cập nhật khi kỹ thuật viên tới nơi." />;
}
