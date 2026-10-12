import type { WalletSummary } from '../../types/wallet.types';

export type WalletSummaryDisplayRow = {
  key: 'availableBalance' | 'withdrawableBalance' | 'pendingWithdrawal' | 'processingWithdrawal';
  label: string;
  value: number | undefined;
};

export function getWalletSummaryDisplayRows(
  summary: Pick<
    WalletSummary,
    'availableBalance' | 'withdrawableBalance' | 'pendingWithdrawal' | 'processingWithdrawal'
  >,
): WalletSummaryDisplayRow[] {
  return [
    { key: 'availableBalance', label: 'Số dư khả dụng', value: summary.availableBalance },
    { key: 'withdrawableBalance', label: 'Có thể rút', value: summary.withdrawableBalance },
    { key: 'pendingWithdrawal', label: 'Chờ rút', value: summary.pendingWithdrawal },
    { key: 'processingWithdrawal', label: 'Đang chuyển', value: summary.processingWithdrawal },
  ];
}

export function maskAccountNumber(accountNumber: string | null | undefined): string {
  const value = accountNumber?.trim() ?? '';
  if (!value) return '—';
  return value.length > 4 ? `•••• ${value.slice(-4)}` : value;
}
