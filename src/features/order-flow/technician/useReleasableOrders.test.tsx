import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { forgetReleasableOrders, useReleasableOrders } from './useReleasableOrders';

const mockJobs = jest.fn();
const mockStatus = jest.fn();
jest.mock('../../../api/orders.api', () => ({
  ordersApi: {
    getTechnicianJobs: (...a: unknown[]) => mockJobs(...a),
    overrunReleaseStatus: (...a: unknown[]) => mockStatus(...a),
  },
  isHistoricalOrder: () => false,
}));

const job = (id: string) => ({ id, code: id.toUpperCase(), status: 'ACCEPTED' });
const seen: { last?: ReturnType<typeof useReleasableOrders> } = {};
function Probe({ owner, enabled = true }: { owner: string | undefined; enabled?: boolean }) {
  const value = useReleasableOrders(owner, enabled);
  useEffect(() => { seen.last = value; });
  return null;
}
const latest = () => seen.last!;
const mount = async (props: React.ComponentProps<typeof Probe>) => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<Probe {...props} />); }); return r; };

beforeEach(() => {
  forgetReleasableOrders();
  jest.clearAllMocks();
  mockJobs.mockResolvedValue([job('a'), job('b')]);
  mockStatus.mockImplementation(async (id: string) => ({ eligible: id === 'a', block: null, currentOrderCode: 'C', currentOrderId: 'cur', currentOrderStatus: 'UNDER_REPAIR', windowMinutes: 180, delayNotice: null }));
});

it('asks Backend only for the orders still waiting for the technician, outside visits', async () => {
  await mount({ owner: 'tech-1' });
  expect(mockJobs).toHaveBeenCalledWith({ excludeVisitGroups: true, statuses: ['accepted', 'en_route'] });
  expect(latest().items.map((i) => i.job.id)).toEqual(['a']);
  expect(latest().loading).toBe(false);
});

it('shares one read between the hub row and the page: the second reader opens with it and fetches nothing', async () => {
  await mount({ owner: 'tech-1' });
  const calls = mockJobs.mock.calls.length;
  await mount({ owner: 'tech-1' });
  expect(mockJobs.mock.calls.length).toBe(calls);
  expect(latest().items.map((i) => i.job.id)).toEqual(['a']);
  expect(latest().loading).toBe(false);
});

it('two readers mounting together still make one request', async () => {
  await act(async () => { create(<><Probe owner="tech-1" /><Probe owner="tech-1" /></>); });
  expect(mockJobs).toHaveBeenCalledTimes(1);
  expect(mockStatus).toHaveBeenCalledTimes(2);
});

it('reloading bypasses what was shared', async () => {
  await mount({ owner: 'tech-1' });
  await act(async () => latest().reload());
  expect(mockJobs).toHaveBeenCalledTimes(2);
});

it('never hands one technician the list of another, and reads nothing while disabled or signed out', async () => {
  await mount({ owner: 'tech-1' });
  mockJobs.mockClear();
  mockJobs.mockResolvedValue([job('b')]);
  await mount({ owner: 'tech-2' });
  expect(mockJobs).toHaveBeenCalledTimes(1);
  expect(latest().items).toEqual([]);
  mockJobs.mockClear();
  forgetReleasableOrders();
  await mount({ owner: 'tech-1', enabled: false });
  await mount({ owner: undefined });
  expect(mockJobs).not.toHaveBeenCalled();
});

it('a failed read leaves the list empty and stops loading', async () => {
  mockJobs.mockRejectedValue(new Error('offline'));
  await mount({ owner: 'tech-1' });
  expect(latest().items).toEqual([]);
  expect(latest().loading).toBe(false);
});
