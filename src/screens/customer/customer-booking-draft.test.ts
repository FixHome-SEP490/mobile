import type { BookingDraft } from '../../api/booking-drafts.api';
import { buildDraftSnapshot, draftTextProblem, draftToFormState, hasDraftInput, vnTodayKey } from './customer-booking-draft';
import type { VisitDeviceDraft } from './customer-visit-draft';

const dev = (over: Partial<VisitDeviceDraft> = {}): VisitDeviceDraft => ({ key: 'main', serviceId: 's1', serviceName: 'Máy lạnh', description: 'Không lạnh', photos: [], ...over });
const draft = (snapshot: BookingDraft['snapshot']): BookingDraft => ({ id: 'd1', version: 3, expiresAt: '2026-12-23T00:00:00Z', snapshot });
const context = { services: [{ id: 's1', name: 'Máy lạnh', code: 'AC-01' }, { id: 's2', name: 'Máy giặt', code: 'WM-01' }], addressIds: ['a1'], todayKey: '2026-11-23', deviceLimit: 5 };

describe('buildDraftSnapshot', () => {
  it('keeps one device as a booking with no saved devices and no photos', () => {
    const snap = buildDraftSnapshot({ devices: [dev({ photos: [{ uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg', uploadId: 'u1' }] })], addressId: 'a1', schedule: { mode: 'urgent' }, note: ' gọi trước ' });
    expect(snap).toEqual({ kind: 'booking', savedDeviceCount: 0, step: 1, items: [{ serviceId: 's1', description: 'Không lạnh' }], addressId: 'a1', mode: 'urgent', customerNote: 'gọi trước' });
    expect(JSON.stringify(snap)).not.toContain('p.jpg');
  });

  it('counts a visit as saved devices plus the one being edited, with the session split into date and slot', () => {
    const snap = buildDraftSnapshot({
      devices: [dev(), dev({ key: 'x-1', serviceId: 's2', description: 'Không vắt' }), dev({ key: 'x-2', serviceId: 's2', description: 'Kêu to' })],
      addressId: null, schedule: { mode: 'scheduled', date: '2026-11-25', slot: 'morning' }, note: '', step: 2,
    });
    expect(snap).toMatchObject({ kind: 'visit_group', savedDeviceCount: 2, step: 2, mode: 'scheduled', date: '2026-11-25', slot: 'morning' });
    expect(snap.items).toHaveLength(3);
    expect(snap).not.toHaveProperty('addressId');
    expect(snap).not.toHaveProperty('customerNote');
  });

  it('keeps device facts and only a variant code Backend accepts', () => {
    const items = buildDraftSnapshot({
      devices: [dev({ deviceAttributes: { brand: 'LG' }, selectedVariantCode: 'AC-01-02' }), dev({ key: 'x', deviceAttributes: {}, selectedVariantCode: 'bad code' })],
      addressId: null, schedule: null, note: '',
    }).items!;
    expect(items[0]).toMatchObject({ deviceAttributes: { brand: 'LG' }, selectedVariantCode: 'AC-01-02' });
    expect(items[1]).not.toHaveProperty('selectedVariantCode');
    expect(items[1]).not.toHaveProperty('deviceAttributes');
  });
});

describe('draft input rules', () => {
  it('needs something typed or a service picked', () => {
    expect(hasDraftInput([dev({ serviceId: '', description: '' })], '')).toBe(false);
    expect(hasDraftInput([dev({ serviceId: '', description: '' })], 'ghi chú')).toBe(true);
    expect(hasDraftInput([dev({ description: '' })], '')).toBe(true);
  });
  it('names links, which Backend refuses in a draft', () => {
    expect(draftTextProblem('xem https://x.vn/a')).toContain('đường dẫn');
    expect(draftTextProblem('vào www.x.vn')).toContain('đường dẫn');
    expect(draftTextProblem('Máy lạnh không lạnh')).toBeNull();
  });
  it('writes today as a Vietnam calendar date', () => {
    expect(vnTodayKey(new Date('2026-11-23T20:00:00Z'))).toBe('2026-11-24');
    expect(vnTodayKey(new Date('2026-11-23T05:00:00Z'))).toBe('2026-11-23');
  });
});

describe('draftToFormState', () => {
  it('restores the devices, address, session and note that still exist', () => {
    const form = draftToFormState(draft({
      items: [{ serviceId: 's1', description: 'Không lạnh', deviceAttributes: { brand: 'LG' }, selectedVariantCode: 'AC-01-02' }, { serviceId: 's2', description: 'Không vắt' }],
      addressId: 'a1', mode: 'scheduled', date: '2026-11-25', slot: 'afternoon', customerNote: 'gọi trước',
    }), context);
    expect(form.main).toEqual({ serviceId: 's1', description: 'Không lạnh', attrs: { brand: 'LG' }, variantCode: 'AC-01-02' });
    expect(form.extras).toMatchObject([{ serviceId: 's2', serviceName: 'Máy giặt', description: 'Không vắt', photos: [] }]);
    expect(form.addressId).toBe('a1');
    expect(form.schedule).toEqual({ mode: 'scheduled', date: '2026-11-25', slot: 'afternoon' });
    expect(form.note).toBe('gọi trước');
    expect(form.warnings).toEqual([]);
  });

  it('drops what is gone and says so: service, extra device, address and a past appointment', () => {
    const form = draftToFormState(draft({
      items: [{ serviceId: 'gone', description: 'a' }, { serviceId: 'gone-2', description: 'b' }],
      addressId: 'a9', mode: 'scheduled', date: '2026-11-20', slot: 'morning',
    }), context);
    expect(form.main).toBeNull();
    expect(form.extras).toEqual([]);
    expect(form.addressId).toBeNull();
    expect(form.schedule).toBeNull();
    expect(form.warnings).toHaveLength(4);
  });

  it('keeps an urgent request and cuts the devices to the visit limit', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ serviceId: 's1', description: `m${i}` }));
    const form = draftToFormState(draft({ items, mode: 'urgent' }), { ...context, deviceLimit: 3 });
    expect(form.schedule).toEqual({ mode: 'urgent' });
    expect(form.extras).toHaveLength(2);
  });
});
