import React from 'react';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import StatusStepScreen from './StatusStepScreen';

/** C04 — EN_ROUTE without an actionable quote. Read-only; never shows face evidence. */
export default function ArrivalStatusScreen() {
  const { snapshot } = useOrderSession();
  const value = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const verified = !!value && !isHistoricalOrder(value) && value.arrivalVerified === true;
  return verified
    ? <StatusStepScreen title="Kỹ thuật viên đã tới nơi" stage={2} message="Kỹ thuật viên đang kiểm tra tại nhà bạn." />
    : <StatusStepScreen title="Kỹ thuật viên đang đến" stage={1} />;
}
