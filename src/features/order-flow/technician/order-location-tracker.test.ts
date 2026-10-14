import { createOrderLocationTracker } from './order-location-tracker';
import { createOrderReadCoordinator } from '../runtime/order-read-coordinator';
import type { FreshOrderPosition } from './arrival-proof-controller';
const key = { userId: 'tech', role: 'technician' as const, serviceOrderId: 'order', sessionGeneration: 1 };
function fixture() {
  let status = 'EN_ROUTE', clock = 1000, listener: ((p: FreshOrderPosition) => void) | undefined;
  const coordinator = createOrderReadCoordinator({ readOrder: async () => ({ id: 'order', status, technician: { id: 'tech' } }), readResource: async () => [] }); coordinator.activate(key);
  const remove = jest.fn(), patch = jest.fn<Promise<void>, [string, unknown]>(async () => undefined), watch = jest.fn<Promise<() => void>, [(p: FreshOrderPosition) => void]>(async fn => { listener = fn; return remove; });
  const deps = { coordinator, getKey: () => key, watch, patch, now: () => clock };
  return { deps, coordinator, patch, watch, remove, advance: () => { clock += 15000; }, changeStatus: () => { status = 'UNDER_REPAIR'; }, emit: (lat: number) => listener?.({ source: 'os', permission: 'granted', lat, lng: 106, accuracyMeters: 10, timestamp: clock }) };
}
it('one focused foreground owner coalesces latest PATCH and removes watch on blur', async () => {
  const f = fixture(); await f.coordinator.refreshOrderSession(key, 'test');
  let release!: () => void; f.patch.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
  const tracker = createOrderLocationTracker(f.deps), duplicate = createOrderLocationTracker(f.deps);
  await tracker.start(); await duplicate.start(); expect(f.watch).toHaveBeenCalledTimes(1);
  f.emit(10); f.emit(11); f.emit(12); expect(f.patch).toHaveBeenCalledTimes(1);
  f.advance(); release(); await Promise.resolve(); await Promise.resolve();
  expect(f.patch).toHaveBeenCalledTimes(2); expect(f.patch.mock.calls[1][1]).toMatchObject({ lat: 12 });
  tracker.stop(); expect(f.remove).toHaveBeenCalledTimes(1); f.emit(13); expect(f.patch).toHaveBeenCalledTimes(2);
});
it('rapid native events cannot PATCH faster than foreground 15-second cadence', async () => {
  const f = fixture(); await f.coordinator.refreshOrderSession(key, 'test'); const tracker = createOrderLocationTracker(f.deps); await tracker.start();
  f.emit(10); await Promise.resolve(); await Promise.resolve(); f.emit(11); await Promise.resolve();
  expect(f.patch).toHaveBeenCalledTimes(1);
  f.advance(); f.emit(12); await Promise.resolve(); expect(f.patch).toHaveBeenCalledTimes(2); tracker.stop();
});
it('repair/reassignment stops watcher, no queued PATCH crosses changed order phase', async () => {
  const f = fixture(); await f.coordinator.refreshOrderSession(key, 'test'); const tracker = createOrderLocationTracker(f.deps); await tracker.start();
  f.changeStatus(); await f.coordinator.refreshOrderSession(key, 'test'); f.emit(10); expect(f.patch).not.toHaveBeenCalled(); expect(f.remove).toHaveBeenCalledTimes(1);
});
it('late native watch start is removed after unmount and cannot PATCH', async () => {
  const f = fixture(); await f.coordinator.refreshOrderSession(key, 'test');
  let release!: (remove: () => void) => void; f.watch.mockImplementationOnce(() => new Promise(r => { release = r; }));
  const tracker = createOrderLocationTracker(f.deps); const starting = tracker.start(); tracker.stop(); release(f.remove); await starting;
  expect(f.remove).toHaveBeenCalledTimes(1); expect(f.patch).not.toHaveBeenCalled();
});
