import type { RepairHistoryItem } from '../../api/orders.api';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const moneyFormatter = new Intl.NumberFormat('vi-VN');

export function filterCompletedRepairHistory(
  rows: RepairHistoryItem[],
  query: string,
): RepairHistoryItem[] {
  const q = query.trim().toLocaleLowerCase('vi');
  return (rows ?? []).filter((row) => {
    if (String(row.status).toLowerCase() !== 'completed') return false;
    if (!q) return true;
    return [
      row.code,
      row.serviceName,
      row.technicianName,
      row.addressSummary,
    ].some((value) => value?.toLocaleLowerCase('vi').includes(q));
  });
}

export function repairHistoryDate(row: RepairHistoryItem): string {
  if (!row.completedAt) return 'Chưa xác định';
  const parsed = new Date(row.completedAt);
  if (!Number.isFinite(parsed.getTime())) return 'Chưa xác định';
  return dateFormatter.format(parsed);
}

export function repairHistoryTotal(row: RepairHistoryItem): string | null {
  const total = Number(row.grandTotal);
  if (!Number.isFinite(total) || total < 0) return null;
  return `${moneyFormatter.format(total)} ₫`;
}
