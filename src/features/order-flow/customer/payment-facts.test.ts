import { normalizeOrderResource } from '../domain/order-view-models';
import { hasCompletionRequest } from './payment-facts';
const row = { id: 'cash', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: '120000', declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: 'Đã nhận tiền', confirmedAmount: null };
it('cash readmodel preserves only canonical declaration identity/time/notes without manufacturing missing facts', () => {
  expect(normalizeOrderResource('cash', { ...row, privateStaffField: 'PRIVATE' }, 'order', 'customer')).toEqual(row);
  const { declaredByTechnicianId: _actor, declaredAt: _time, technicianNotes: _notes, ...legacy } = row;
  expect(normalizeOrderResource('cash', legacy, 'order', 'customer')).toEqual(legacy);
});
it.each([{ declaredAt: 'invalid' }, { declaredByTechnicianId: null }, { technicianNotes: 12 }, { technicianNotes: 'x'.repeat(2001) }])('malformed canonical declaration field %p is unavailable, never invented', patch => {
  expect(() => normalizeOrderResource('cash', { ...row, ...patch }, 'order', 'customer')).toThrow();
});
it('handover timestamp must be a real server timestamp, not a truthy success flag', () => {
  expect(hasCompletionRequest({ completionRequestedAt: '2026-10-14T00:00:00Z' })).toBe(true);
  expect(hasCompletionRequest({ completionRequestedAt: 'success' })).toBe(false);
});
