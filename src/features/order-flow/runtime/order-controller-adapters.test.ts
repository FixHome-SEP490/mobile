import apiClient from '../../../api/client';
import { orderReadDependencies } from './order-controller-adapters';
import { createOrderReadCoordinator } from './order-read-coordinator';
jest.mock('../../../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
const api = apiClient as unknown as { get: jest.Mock };
it('malformed parts GET is a resource error rather than an invented empty list', async () => {
  api.get.mockImplementation(async (url: string) => ({ data: { data: url.endsWith('part-requests') ? {} : { id: 'o', status: 'under_repair', technician: { id: 'tech' } } } }));
  const c = createOrderReadCoordinator(orderReadDependencies);
  const key = { userId: 'tech', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'o' };
  c.activate(key); await c.refreshOrderSession(key, 'focus'); await c.loadResource(key, 'parts');
  expect(c.getSnapshot()?.resources.parts.status).toBe('error');
  expect(api.get).toHaveBeenCalledWith('/service-orders/o/part-requests');
});
