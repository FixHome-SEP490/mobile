import {
  buildRebookDto,
  DRAFT_NOT_READY,
  failedBookingIds,
  parseRebookResult,
  parseRepairFailureDraft,
  REBOOK_UNCLEAR,
 classifyCancelledBooking, INTERRUPTION_NOT_READY } from './failed-repair-rebook';


const ITEM = (n: number) => ({
  sourceBookingId: `b${n}`, sourceOrderId: `o${n}`, sourceIncidentId: `i${n}`, serviceId: `s${n}`, deviceLabel: `Máy ${n}`,
  selectedVariantCode: n === 1 ? 'AC-01-01' : null, description: `mô tả ${n}`, deviceAttributes: null, quantity: 1, photos: [],
});
const draftOf = (count: number, patch: Record<string, unknown> = {}) => ({
  sourceVisitGroupId: 'g1',
  targetKind: count === 1 ? 'booking' : 'visit_group',
  address: { id: 'addr1', text: '1 Lê Lợi' },
  customerNote: 'gọi trước',
  items: Array.from({ length: count }, (_, i) => ITEM(i + 1)),
  requiresNewSchedule: true,
  requiresPricingRevalidation: true,
  confirmation: { available: true, path: '/api/v1/bookings/b1/repair-failure-rebook' },
  ...patch,
});

describe('parseRepairFailureDraft', () => {
  it('reads a one-device and a two-device draft', () => {
    expect(parseRepairFailureDraft(draftOf(1), 'b1', ['b1']).targetKind).toBe('booking');
    const two = parseRepairFailureDraft(draftOf(2), 'b1', ['b1', 'b2']);
    expect(two.targetKind).toBe('visit_group');
    expect(two.items.map((i) => i.deviceLabel)).toEqual(['Máy 1', 'Máy 2']);
  });
  it.each([
    ['confirmation closed', draftOf(1, { confirmation: { available: false } })],
    ['wrong path', draftOf(1, { confirmation: { available: true, path: '/api/v1/bookings/x/repair-failure-rebook' } })],
    ['target kind mismatch', draftOf(2, { targetKind: 'booking' })],
    ['no new schedule flag', draftOf(1, { requiresNewSchedule: false })],
    ['four devices', draftOf(4)],
    ['not an object', null],
  ])('refuses %s', (_name, data) => {
    expect(() => parseRepairFailureDraft(data, 'b1', ['b1'])).toThrow(DRAFT_NOT_READY);
  });
  it('refuses a draft that lacks a requested device or repeats one', () => {
    expect(() => parseRepairFailureDraft(draftOf(1), 'b1', ['b1', 'b2'])).toThrow(DRAFT_NOT_READY);
    const repeated = draftOf(2);
    repeated.items[1] = { ...ITEM(1) };
    expect(() => parseRepairFailureDraft(repeated, 'b1', ['b1'])).toThrow(DRAFT_NOT_READY);
  });
});

describe('buildRebookDto and parseRebookResult', () => {
  const two = parseRepairFailureDraft(draftOf(2), 'b1', ['b1', 'b2']);
  it('sends the frozen items with the new schedule and the key', () => {
    expect(buildRebookDto(two, { date: '2026-11-02', slot: 'morning' }, 'rebook_key_12345')).toEqual({
      idempotencyKey: 'rebook_key_12345', addressId: 'addr1', date: '2026-11-02', slot: 'morning', customerNote: 'gọi trước',
      items: [
        { sourceBookingId: 'b1', sourceIncidentId: 'i1', selectedVariantCode: 'AC-01-01', description: 'mô tả 1' },
        { sourceBookingId: 'b2', sourceIncidentId: 'i2', description: 'mô tả 2' },
      ],
    });
  });
  it('lands on the new visit, or on the new booking for one device', () => {
    const result = { targetKind: 'visit_group', bookingId: null, visitGroupId: 'g2', items: [{ sourceBookingId: 'b1', sourceIncidentId: 'i1', bookingId: 'n1' }, { sourceBookingId: 'b2', sourceIncidentId: 'i2', bookingId: 'n2' }] };
    expect(parseRebookResult(result, two)).toEqual({ kind: 'visit', id: 'g2' });
    const one = parseRepairFailureDraft(draftOf(1), 'b1', ['b1']);
    expect(parseRebookResult({ targetKind: 'booking', bookingId: 'n1', visitGroupId: null, items: [{ sourceBookingId: 'b1', sourceIncidentId: 'i1', bookingId: 'n1' }] }, one)).toEqual({ kind: 'booking', id: 'n1' });
  });
  it('calls an answer that does not match the draft unclear', () => {
    expect(() => parseRebookResult({ targetKind: 'booking' }, two)).toThrow(REBOOK_UNCLEAR);
    expect(() => parseRebookResult(null, two)).toThrow(REBOOK_UNCLEAR);
  });
});

describe('failedBookingIds', () => {
  it('lists the failed devices in the visit order', () => {
    const items = [{ booking: { id: 'b1' } }, { booking: { id: 'b2' } }, { booking: null }, { booking: { id: 'b3' } }];
    const devices = [{ bookingId: 'b3', state: 'failed' }, { bookingId: 'b1', state: 'failed' }, { bookingId: 'b2', state: 'succeeded' }];
    expect(failedBookingIds(items, devices)).toEqual(['b1', 'b3']);
    expect(failedBookingIds(undefined, undefined)).toEqual([]);
  });
});

describe('interruption drafts', () => {
  const interruptionItem = (n: number) => ({ ...ITEM(n), sourceCaseId: `case${n}`, sourceIncidentId: undefined, photos: [], previousTechnicianId: `tech${n}` });
  const draft = (count: number) => ({
    ...draftOf(count, { confirmation: { available: true, path: '/api/v1/bookings/b1/interruption-rebook' } }),
    items: Array.from({ length: count }, (_, i) => interruptionItem(i + 1)),
  });
  it('reads the case that closed each device and sends it as sourceCaseId', () => {
    const parsed = parseRepairFailureDraft(draft(2), 'b1', ['b1', 'b2'], 'interruption');
    expect(parsed.kind).toBe('interruption');
    expect(parsed.items.map((i) => i.sourceIncidentId)).toEqual(['case1', 'case2']);
    expect(buildRebookDto(parsed, { date: '2026-11-02', slot: 'evening' }, 'rebook_key_12345').items).toEqual([
      { sourceBookingId: 'b1', sourceCaseId: 'case1', selectedVariantCode: 'AC-01-01', description: 'mô tả 1' },
      { sourceBookingId: 'b2', sourceCaseId: 'case2', description: 'mô tả 2' },
    ]);
  });
  it('refuses a failed-repair draft where an interruption is expected, and the other way round', () => {
    expect(() => parseRepairFailureDraft(draftOf(1), 'b1', ['b1'], 'interruption')).toThrow(INTERRUPTION_NOT_READY);
    expect(() => parseRepairFailureDraft(draft(1), 'b1', ['b1'], 'failure')).toThrow(DRAFT_NOT_READY);
  });
  it('matches the answer to the cases it was sent for', () => {
    const parsed = parseRepairFailureDraft(draft(1), 'b1', ['b1'], 'interruption');
    const ok = { targetKind: 'booking', bookingId: 'n1', visitGroupId: null, items: [{ sourceBookingId: 'b1', sourceCaseId: 'case1', bookingId: 'n1' }] };
    expect(parseRebookResult(ok, parsed)).toEqual({ kind: 'booking', id: 'n1' });
    expect(() => parseRebookResult({ ...ok, items: [{ sourceBookingId: 'b1', sourceIncidentId: 'case1', bookingId: 'n1' }] }, parsed)).toThrow(REBOOK_UNCLEAR);
  });
});

describe('classifyCancelledBooking', () => {
  const failureDraft = draftOf(2);
  const noCases = async () => [];
  const interrupted = (over: Record<string, unknown> = {}) => ({ bookingId: 'b1', caseType: 'mid_job_interruption', status: 'resolved', serviceOrderId: 'o1', resolutionCode: 'interrupted_for_rebook', ...over });
  const none = async () => { throw { response: { status: 404 } }; };

  it('calls a verified failed-repair draft a repair failure and keeps all its devices', async () => {
    expect(await classifyCancelledBooking('b1', 'o1', noCases, async () => failureDraft)).toEqual({ kind: 'repair-failure', sourceBookingIds: ['b1', 'b2'] });
  });
  it('calls a job a manager closed an interruption', async () => {
    expect(await classifyCancelledBooking('b1', 'o1', async () => [interrupted()], none)).toEqual({ kind: 'interrupted', sourceBookingIds: ['b1'] });
    expect((await classifyCancelledBooking('b1', 'o1', async () => [interrupted({ bookingId: null, caseType: 'technician_replacement' })], none)).kind).toBe('interrupted');
  });
  it('leaves an ordinary cancellation to the ordinary rebook', async () => {
    expect((await classifyCancelledBooking('b1', 'o1', noCases, none)).kind).toBe('ordinary');
    expect((await classifyCancelledBooking('b1', null, noCases, none)).kind).toBe('ordinary');
    expect((await classifyCancelledBooking('b1', 'o1', async () => [{ ...interrupted(), resolutionCode: 'other' }], none)).kind).toBe('ordinary');
  });
  it('guesses nothing when an answer is unreadable or does not describe this booking', async () => {
    await expect(classifyCancelledBooking('b1', 'o1', noCases, async () => { throw { response: { status: 500 } }; })).rejects.toBeDefined();
    await expect(classifyCancelledBooking('b1', 'o1', async () => { throw new Error('offline'); }, none)).rejects.toThrow('offline');
    await expect(classifyCancelledBooking('b1', 'o1', async () => [interrupted({ bookingId: 'other' })], none)).rejects.toThrow(INTERRUPTION_NOT_READY);
    await expect(classifyCancelledBooking('b9', 'o1', noCases, async () => failureDraft)).rejects.toThrow(DRAFT_NOT_READY);
  });
});
