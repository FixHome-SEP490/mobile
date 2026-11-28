import React from 'react';
import StatusStepScreen from './StatusStepScreen';

/** C06 — UNDER_REPAIR with no actionable extra. Read-only in this focused scope. */
export default function RepairStatusScreen() {
  return <StatusStepScreen title="Đang sửa chữa" stage={3} />;
}
