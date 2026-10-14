import { useMemo, useSyncExternalStore } from 'react';
import { useM6OrderRuntime, useM6PresentationLifecycle } from '../customer/useM6OrderRuntime';
import { createProductionTechnicianCashController } from './cash-production';
export function useTechnicianCashDeclaration() {
  const { runtime, active, snapshot } = useM6OrderRuntime();
  const controller = useMemo(() => createProductionTechnicianCashController(runtime), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useM6PresentationLifecycle(controller, active, snapshot);
  return { controller, state };
}
