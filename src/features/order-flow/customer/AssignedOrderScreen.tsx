import React from 'react';
import StatusStepScreen from './StatusStepScreen';

/** C03 — ACCEPTED. Read-only; no quote or payment action in this focused scope. */
export default function AssignedOrderScreen() {
  return <StatusStepScreen title="Kỹ thuật viên đã nhận đơn" stage={1} />;
}
