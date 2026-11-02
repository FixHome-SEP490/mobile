import React from 'react';
import { act, create } from 'react-test-renderer';
import { useRebookAction } from './useRebookAction';

const mockNavigate = jest.fn();
const mockDraft = jest.fn();
const mockCases = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }) }));
jest.mock('../api/bookings.api', () => ({ bookingsApi: { getRepairFailureDraft: (...a: unknown[]) => mockDraft(...a) } }));
jest.mock('../api/support-cases.api', () => ({ supportCasesApi: { listMine: (...a: unknown[]) => mockCases(...a) } }));

type Hook = ReturnType<typeof useRebookAction>;
async function mount(status: string) {
  const openSheet = jest.fn();
  const out: { current: Hook | null } = { current: null };
  function Harness() { out.current = useRebookAction({ bookingId: 'b1', orderId: 'o1', status, openSheet }); return null; }
  await act(async () => { create(<Harness />); });
  await act(async () => { await Promise.resolve(); });
  return { hook: () => out.current!, openSheet };
}
const interrupted = { bookingId: 'b1', caseType: 'mid_job_interruption', status: 'resolved', serviceOrderId: 'o1', resolutionCode: 'interrupted_for_rebook' };
const failureDraft = {
  targetKind: 'booking', address: { id: 'a1', text: 'x' }, customerNote: null, requiresNewSchedule: true,
  confirmation: { available: true, path: '/api/v1/bookings/b1/repair-failure-rebook' },
  items: [{ sourceBookingId: 'b1', sourceIncidentId: 'i1', serviceId: 's1', deviceLabel: null, selectedVariantCode: null, description: 'd', quantity: 1 }],
};

beforeEach(() => { jest.resetAllMocks(); mockDraft.mockRejectedValue({ response: { status: 404 } }); mockCases.mockResolvedValue({ data: [] }); });

it('opens the ordinary sheet for a finished order without asking the server', async () => {
  const { hook, openSheet } = await mount('COMPLETED');
  expect(mockDraft).not.toHaveBeenCalled();
  expect(hook().label).toBe('Đặt lại thợ');
  act(() => hook().press());
  expect(openSheet).toHaveBeenCalled();
});

it('opens the ordinary sheet for an ordinary cancellation', async () => {
  const { hook, openSheet } = await mount('CANCELLED');
  expect(hook().label).toBe('Đặt lại thợ');
  act(() => hook().press());
  expect(openSheet).toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('goes to the failed-repair rebook when the server has a verified draft', async () => {
  mockDraft.mockResolvedValue(failureDraft);
  const { hook } = await mount('CANCELLED');
  expect(hook().label).toBe('Đặt lại');
  act(() => hook().press());
  expect(mockNavigate).toHaveBeenCalledWith('CustomerFailedRepairRebook', { sourceBookingIds: ['b1'] });
});

it('goes to the interruption rebook when a manager closed the job, never to the sheet', async () => {
  mockCases.mockResolvedValue({ data: [interrupted] });
  const { hook, openSheet } = await mount('CANCELLED');
  expect(hook().label).toBe('Đặt lịch mới');
  act(() => hook().press());
  expect(mockNavigate).toHaveBeenCalledWith('CustomerInterruptionRebook', { bookingId: 'b1' });
  expect(openSheet).not.toHaveBeenCalled();
});

it('offers a retry instead of guessing when the answer cannot be read', async () => {
  mockDraft.mockRejectedValue({ response: { status: 500 } });
  const { hook, openSheet } = await mount('CANCELLED');
  expect(hook().label).toMatch(/Thử lại/);
  mockDraft.mockRejectedValue({ response: { status: 404 } });
  await act(async () => { hook().press(); });
  await act(async () => { await Promise.resolve(); });
  expect(openSheet).not.toHaveBeenCalled();
  expect(hook().label).toBe('Đặt lại thợ');
});
