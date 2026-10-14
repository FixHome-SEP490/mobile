import { useMemo, useSyncExternalStore } from 'react';
import { useM6OrderRuntime, useM6PresentationLifecycle } from '../customer/useM6OrderRuntime';
import { captureAndUploadAfter, createProductionTechnicianCompletionController } from './completion-production';
export function useTechnicianCompletion() {
  const { runtime, active, snapshot } = useM6OrderRuntime();
  const controller = useMemo(() => createProductionTechnicianCompletionController(runtime), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useM6PresentationLifecycle(controller, active, snapshot);
  return { controller, state, captureAfter: () => captureAndUploadAfter(runtime, controller) };
}
