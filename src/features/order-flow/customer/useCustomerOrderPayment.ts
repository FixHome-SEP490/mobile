import { useMemo, useSyncExternalStore } from 'react';
import { createProductionOrderPaymentController } from './order-payment-production';
import { useM6OrderRuntime, useM6PresentationLifecycle } from './useM6OrderRuntime';
export function useCustomerOrderPayment() {
  const { runtime, active, snapshot } = useM6OrderRuntime();
  const controller = useMemo(() => createProductionOrderPaymentController(runtime), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useM6PresentationLifecycle(controller, active, snapshot);
  return { controller, state };
}
