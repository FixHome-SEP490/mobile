import apiClient from './client';

/** One completed order in the earnings list. */
export interface EarningsPayout {
  orderId: string;
  orderCode: string;
  date: string;
  completedAt: string | null;
  customer: string | null;
  serviceName: string | null;
  /** Labour before the platform fee. */
  gross: number;
  platformFee: number;
  /** Labour after the platform fee. */
  net: number;
  orderValue: number;
  paid: boolean;
  status: string;
}

/** `GET /technicians/me/earnings`: totals for the whole range, payouts for the requested page. */
export interface EarningsSummary {
  totalCompletedOrders: number;
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  paidOrders: number;
  pendingDueCount: number;
  pendingDueAmount: number;
  commissionRatePercent: number | null;
  payouts: EarningsPayout[];
  page: number;
  pageSize: number;
  total: number;
}

const money = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

function normalizePayout(row: Record<string, unknown>): EarningsPayout {
  return {
    orderId: String(row.orderId ?? ''),
    orderCode: String(row.orderCode ?? ''),
    date: String(row.date ?? ''),
    completedAt: text(row.completedAt),
    customer: text(row.customer),
    serviceName: text(row.serviceName),
    gross: money(row.gross),
    platformFee: money(row.platformFee),
    net: money(row.net),
    orderValue: money(row.orderValue),
    paid: row.paid === true,
    status: String(row.status ?? ''),
  };
}

export const technicianEarningsApi = {
  /** `from`/`to`: yyyy-MM-dd Vietnam days, inclusive. */
  async getMyEarnings(q: { from: string; to: string; page: number; pageSize: number }): Promise<EarningsSummary> {
    const res = await apiClient.get('/technicians/me/earnings', { params: q });
    const body = res.data as { data?: Record<string, unknown> } & Record<string, unknown>;
    const data = (body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
    const payouts = Array.isArray(data.payouts) ? (data.payouts as Record<string, unknown>[]).map(normalizePayout) : [];
    const totalCompletedOrders = money(data.totalCompletedOrders);
    const rate = Number(data.commissionRatePercent);
    return {
      totalCompletedOrders,
      totalGross: money(data.totalGross),
      totalCommission: money(data.totalCommission),
      totalNet: money(data.totalNet),
      paidOrders: money(data.paidOrders),
      pendingDueCount: money(data.pendingDueCount),
      pendingDueAmount: money(data.pendingDueAmount),
      commissionRatePercent: data.commissionRatePercent == null || !Number.isFinite(rate) ? null : rate,
      payouts,
      page: money(data.page) || q.page,
      pageSize: money(data.pageSize) || q.pageSize,
      total: data.total == null ? totalCompletedOrders : money(data.total),
    };
  },
};
