import React from 'react';
import { act, create } from 'react-test-renderer';
import { technicianEarningsApi, type EarningsSummary } from '../../api/technician-earnings.api';
import EarningsPeriodPanel from './EarningsPeriodPanel';

jest.mock('lucide-react-native', () => ({ ChevronLeft: () => null, ChevronRight: () => null }));
jest.mock('../../api/technician-earnings.api', () => ({ technicianEarningsApi: { getMyEarnings: jest.fn() } }));
const api = technicianEarningsApi as jest.Mocked<typeof technicianEarningsApi>;
const NOW = Date.parse('2026-10-14T22:00:00Z'); // Thu 15/10/2026 VN

const payout = (n: number) => ({ orderId: `o${n}`, orderCode: `C${n}`, date: '15/10/2026', completedAt: null, customer: null, serviceName: 'Sửa điện', gross: 100, platformFee: 10, net: 90, orderValue: 100, paid: true, status: 'COMPLETED' });
const summary = (over: Partial<EarningsSummary> = {}): EarningsSummary => ({
  totalCompletedOrders: 12, totalGross: 1000, totalCommission: 100, totalNet: 900, paidOrders: 12, pendingDueCount: 0, pendingDueAmount: 0,
  commissionRatePercent: 10, payouts: [payout(1)], page: 1, pageSize: 10, total: 12, ...over,
});
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const byId = (r: ReturnType<typeof create>, id: string) => r.root.findAllByProps({ testID: id });

async function mount() {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<EarningsPeriodPanel nowMs={NOW} />); });
  await flush();
  return r;
}
beforeEach(() => { jest.clearAllMocks(); api.getMyEarnings.mockResolvedValue(summary()); });

describe('EarningsPeriodPanel', () => {
  it('asks the server for the current week, then the previous one', async () => {
    const r = await mount();
    expect(api.getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-12', to: '2026-10-18', page: 1, pageSize: 10 });
    await act(async () => { byId(r, 'earnings-prev')[0].props.onPress(); });
    await flush();
    expect(api.getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-05', to: '2026-10-11', page: 1, pageSize: 10 });
    act(() => r.unmount());
  });

  it('switches to a single day', async () => {
    const r = await mount();
    await act(async () => { byId(r, 'earnings-period-day')[0].props.onPress(); });
    await flush();
    expect(api.getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-15', to: '2026-10-15', page: 1, pageSize: 10 });
    act(() => r.unmount());
  });

  it('loads the next page and appends it', async () => {
    const r = await mount();
    api.getMyEarnings.mockResolvedValueOnce(summary({ payouts: [payout(2)], page: 2 }));
    await act(async () => { byId(r, 'earnings-more')[0].props.onPress(); });
    await flush();
    expect(api.getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-12', to: '2026-10-18', page: 2, pageSize: 10 });
    const out = JSON.stringify(r.toJSON());
    expect(out).toContain('C1');
    expect(out).toContain('C2');
    act(() => r.unmount());
  });
});
