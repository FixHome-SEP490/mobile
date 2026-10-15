import { orderFlowPreviewRoute } from './order-flow-preview-policy';

describe('order-flow development preview policy', () => {
  it('only returns the preview route in development for an authenticated supported role', () => {
    expect(orderFlowPreviewRoute(true, 'customer', 'order-1')).toEqual({ name: 'OrderFlowDevPreview', params: { serviceOrderId: 'order-1' } });
    expect(orderFlowPreviewRoute(true, 'technician', 'order-2')).toEqual({ name: 'OrderFlowDevPreview', params: { serviceOrderId: 'order-2' } });
    expect(orderFlowPreviewRoute(false, 'customer', 'order-1')).toBeNull();
    expect(orderFlowPreviewRoute(true, null, 'order-1')).toBeNull();
    expect(orderFlowPreviewRoute(true, 'guest', 'order-1')).toBeNull();
  });
});
