import { useMemo, useSyncExternalStore } from 'react';
import { createProductionOrderException } from './m7-production';
import { authenticatedM6Key } from '../customer/order-payment-production';
import { orderExceptionView } from './order-exception-controller';
import { useM6OrderRuntime, useM6PresentationLifecycle } from '../customer/useM6OrderRuntime';
export function useOrderException() {
  const { runtime, active, snapshot } = useM6OrderRuntime();
  const controller = useMemo(() => createProductionOrderException(runtime), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useM6PresentationLifecycle(controller, active, snapshot);
  return { controller, state, view: orderExceptionView(authenticatedM6Key(runtime, 'technician') ? snapshot : null) };
}
