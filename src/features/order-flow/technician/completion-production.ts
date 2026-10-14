import { ordersApi } from '../../../api/orders.api';
import { sameOrderSession } from '../domain/order-session.types';
import { newEntryIntentId } from '../runtime/entry-attempt-production';
import { authenticatedM6Key, type M6OrderRuntime } from '../customer/order-payment-production';
import { createTechnicianCompletionController, type TechnicianCompletionController } from './technician-completion-controller';
import { captureCameraPhoto, confirmCameraPermission } from './camera-capture';
export function createProductionTechnicianCompletionController(runtime: M6OrderRuntime) {
  return createTechnicianCompletionController({ ...runtime, getKey: () => authenticatedM6Key(runtime, 'technician'), newIntentId: newEntryIntentId,
    transport: { uploadAfter: ordersApi.uploadEvidenceAfter, deleteEvidence: ordersApi.deleteEvidence, requestCompletion: ordersApi.requestCompletion } });
}
/** Reuses the installed M3 camera adapter; UI attaches only confirmedUpload, never a local URI. */
export async function captureAndUploadAfter(runtime: M6OrderRuntime, controller: TechnicianCompletionController) {
  const key = authenticatedM6Key(runtime, 'technician');
  const current = () => !!key && sameOrderSession(authenticatedM6Key(runtime, 'technician'), key);
  if (!key) return { ok: false as const, message: 'Phiên hiện tại chưa cho phép chụp ảnh.' };
  const captured = await captureCameraPhoto(); if (!captured.ok) return captured;
  if (!current() || !await confirmCameraPermission() || !current()) return { ok: false as const, message: 'Hãy kiểm tra phiên đăng nhập và quyền camera rồi chụp lại.' };
  await controller.uploadAfter(captured.asset);
  const evidence = current() ? controller.getState().confirmedUpload : null;
  return evidence ? { ok: true as const, evidence } : { ok: false as const, message: 'Ảnh chưa được xác minh. Vui lòng kiểm tra trạng thái.' };
}
