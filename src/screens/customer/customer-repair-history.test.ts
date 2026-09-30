import type { RepairHistoryItem } from '../../api/orders.api';
import {
  filterCompletedRepairHistory,
  repairHistoryDate,
  repairHistoryTotal,
} from './customer-repair-history';

const row = (overrides: Partial<RepairHistoryItem> = {}): RepairHistoryItem => ({
  orderId: 'order-1',
  bookingId: 'booking-1',
  code: 'FH-001',
  status: 'completed',
  serviceName: 'Vệ sinh máy lạnh',
  technicianName: 'Nguyễn Văn A',
  addressSummary: 'Thủ Đức, TP.HCM',
  laborTotal: 100000,
  partsTotal: 50000,
  grandTotal: 150000,
  completedAt: '2026-09-29T02:30:00.000Z',
  ...overrides,
});

describe('customer repair history presentation', () => {
  it('keeps only completed repairs even if a mixed response is received', () => {
    expect(filterCompletedRepairHistory([
      row(),
      row({ orderId: 'order-2', status: 'cancelled' }),
    ], '')).toHaveLength(1);
  });

  it('searches code, service, technician and address without inventing fields', () => {
    const rows = [row()];
    expect(filterCompletedRepairHistory(rows, 'fh-001')).toHaveLength(1);
    expect(filterCompletedRepairHistory(rows, 'máy lạnh')).toHaveLength(1);
    expect(filterCompletedRepairHistory(rows, 'nguyễn văn')).toHaveLength(1);
    expect(filterCompletedRepairHistory(rows, 'thủ đức')).toHaveLength(1);
    expect(filterCompletedRepairHistory(rows, 'không có')).toHaveLength(0);
  });

  it('formats real totals and refuses invalid totals', () => {
    expect(repairHistoryTotal(row())).toBe('150.000 ₫');
    expect(repairHistoryTotal(row({ grandTotal: Number.NaN }))).toBeNull();
  });

  it('formats completedAt in the Vietnam calendar timezone', () => {
    expect(repairHistoryDate(row())).toBe('29/09/2026');
    expect(repairHistoryDate(row({ completedAt: 'bad-date' }))).toBe('Chưa xác định');
  });
});
