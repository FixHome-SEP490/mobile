import { addDevice, buildVisitDto, deviceComplete, deviceProblem, devicePrice, duplicatePhoto, visitProblem, type VisitDeviceDraft } from './customer-visit-draft';

const dev = (key: string, over: Partial<VisitDeviceDraft> = {}): VisitDeviceDraft => ({ key, serviceId: 's', serviceName: 'A', description: 'hỏng', photos: [], ...over });
const photo = (uri: string, uploadId?: string) => ({ uri, name: 'p.jpg', type: 'image/jpeg' as const, uploadId });
const schedule = { mode: 'scheduled', date: '2026-10-27', slot: 'morning' } as const;

it('locks the list at three devices', () => {
  const three = ['1', '2', '3'].reduce<VisitDeviceDraft[]>((list, k) => addDevice(list, dev(k)), []);
  expect(addDevice(three, dev('4'))).toHaveLength(3);
});
it('needs a service and a description for each device', () => {
  expect(deviceProblem({ serviceId: '', description: 'x' })).toMatch(/dịch vụ/);
  expect(deviceProblem({ serviceId: 's', description: '  ' })).toMatch(/Mô tả/);
  expect(deviceProblem({ serviceId: 's', description: 'x'.repeat(5001) })).toMatch(/5000/);
  expect(deviceProblem({ serviceId: 's', description: 'x' })).toBeNull();
});
it('rejects the same photo on two devices', () => {
  expect(duplicatePhoto([{ photos: [photo('a')] }, { photos: [photo('a')] }])).toBe(true);
  expect(duplicatePhoto([{ photos: [photo('a')] }, { photos: [photo('b')] }])).toBe(false);
});
it('treats the same library photo picked twice (new uri each time) as one photo', () => {
  expect(duplicatePhoto([{ photos: [{ ...photo('file:///cache/1.jpg'), assetId: 'A1' }] }, { photos: [{ ...photo('file:///cache/2.jpg'), assetId: 'A1' }] }])).toBe(true);
  expect(duplicatePhoto([{ photos: [{ ...photo('file:///cache/1.jpg'), name: 'IMG_1.JPG', sizeBytes: 900 }] }, { photos: [{ ...photo('file:///cache/2.jpg'), name: 'IMG_1.JPG', sizeBytes: 900 }] }])).toBe(true);
  expect(duplicatePhoto([{ photos: [{ ...photo('file:///cache/1.jpg'), name: 'IMG_1.JPG', sizeBytes: 900 }] }, { photos: [{ ...photo('file:///cache/2.jpg'), name: 'IMG_2.JPG', sizeBytes: 900 }] }])).toBe(false);
});
it('sends only a complete visit of 2-3 devices', () => {
  expect(visitProblem([dev('1')], true, schedule)).toMatch(/2 đến 3/);
  expect(visitProblem([dev('1'), dev('2')], false, schedule)).toMatch(/địa chỉ/);
  expect(visitProblem([dev('1'), dev('2')], true, null)).toMatch(/thời gian/);
  expect(visitProblem([dev('1'), dev('2', { description: '' })], true, schedule)).toMatch(/Mô tả/);
  expect(visitProblem([dev('1'), dev('2')], true, schedule)).toBeNull();
});
it('keeps an assistant suggestion out of the visit until the customer confirms it', () => {
  expect(deviceComplete(dev('1'))).toBe(true);
  expect(deviceComplete(dev('1', { unconfirmed: true }))).toBe(false);
  expect(deviceComplete(dev('1', { description: '' }))).toBe(false);
  expect(visitProblem([dev('1'), dev('2', { unconfirmed: true })], true, schedule)).toMatch(/Máy 2.*xác nhận/);
  expect(visitProblem([dev('1'), dev('2', { unconfirmed: false })], true, schedule)).toBeNull();
});
it('sends the device facts and price variant of a device with its item', () => {
  const dto = buildVisitDto({
    devices: [dev('1', { deviceAttributes: { type: 'split' } as never, selectedVariantCode: 'V1' }), dev('2', { deviceAttributes: {}, selectedVariantCode: null })],
    addressId: 'addr', schedule, note: '', idempotencyKey: 'k',
  });
  expect(dto.items[0]).toMatchObject({ deviceAttributes: { type: 'split' }, selectedVariantCode: 'V1' });
  expect(dto.items[1]).not.toHaveProperty('deviceAttributes');
  expect(dto.items[1]).not.toHaveProperty('selectedVariantCode');
});
it('never counts a survey-only service as zero', () => {
  expect(devicePrice(null)).toEqual({ kind: 'none' });
  expect(devicePrice({ kind: 'fixed_range', minLaborVnd: 100, maxLaborVnd: 100 })).toEqual({ kind: 'firm', amount: 100 });
  expect(devicePrice({ kind: 'fixed_range', minLaborVnd: 100, maxLaborVnd: 200 })).toEqual({ kind: 'range', min: 100, max: 200 });
  expect(devicePrice({ kind: 'inspection_only', minLaborVnd: null, maxLaborVnd: null })).toEqual({ kind: 'survey', from: null, to: null });
});
it('builds the request with uploaded photo ids, labels and the idempotency key', () => {
  const dto = buildVisitDto({
    devices: [dev('1', { photos: [photo('a', 'up1'), photo('b')] }), dev('2')],
    addressId: 'addr', schedule, note: ' cẩn thận ', idempotencyKey: 'k', aiSessionId: 'ai',
  });
  expect(dto).toMatchObject({ addressId: 'addr', mode: 'scheduled', date: '2026-10-27', slot: 'morning', customerNote: 'cẩn thận', urgency: 'NORMAL', idempotencyKey: 'k', aiSessionId: 'ai' });
  expect(dto.items.map((i) => [i.deviceLabel, i.photoUploadIds])).toEqual([['Máy 1', ['up1']], ['Máy 2', []]]);
});
