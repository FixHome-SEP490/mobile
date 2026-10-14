export function orderFlowPreviewRoute(isDev: boolean, role: string | null | undefined, serviceOrderId: string) {
  if (!isDev || !serviceOrderId.trim() || (role !== 'customer' && role !== 'technician')) return null;
  return { name: 'OrderFlowDevPreview' as const, params: { serviceOrderId } };
}
