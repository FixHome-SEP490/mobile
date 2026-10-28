// What the voucher screens say and show (web `voucher-model.ts`), kept apart from the screen so it is tested on its own.

import type { GeneralVoucher, VoucherClaim, VoucherPolicy } from '../../api/vouchers.api';
import { formatVnd } from '../../utils/format';

export type VoucherTab = 'mine' | 'general' | 'history';

export const VOUCHER_TABS: { key: VoucherTab; label: string }[] = [
  { key: 'mine', label: 'Ưu đãi của tôi' },
  { key: 'general', label: 'Ưu đãi chung' },
  { key: 'history', label: 'Đã sử dụng' },
];

export const VOUCHER_EMPTY: Record<VoucherTab, { title: string; message: string }> = {
  mine: { title: 'Ví ưu đãi của bạn đang trống', message: 'Ưu đãi được lưu hoặc cấp riêng sẽ xuất hiện tại đây.' },
  general: { title: 'Chưa có ưu đãi chung', message: 'Ưu đãi đang hoạt động sẽ hiển thị khi máy chủ xác nhận.' },
  history: { title: 'Chưa có ưu đãi đã dùng', message: 'Ưu đãi đã sử dụng được xác nhận sẽ xuất hiện tại đây.' },
};

export const VOUCHER_SAVED_NOTE = 'Đã lưu vào ví. Lưu vào ví chưa có nghĩa là đã áp dụng giảm giá.';

export function discountLabel(policy: VoucherPolicy): string {
  return policy.discount === 'PERCENT' ? `Giảm ${policy.value}%` : `Giảm ${formatVnd(policy.value)}`;
}

export function conditionLabel(policy: VoucherPolicy): string {
  return [
    policy.minimumVnd > 0 ? `Đơn từ ${formatVnd(policy.minimumVnd)}` : '',
    policy.discount === 'PERCENT' && policy.capVnd ? `Giảm tối đa ${formatVnd(policy.capVnd)}` : '',
    'Tiền công và linh kiện',
  ].filter(Boolean).join(' · ');
}

export function voucherDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

/** Saved and still open; an ended or paused campaign is shown as such, not as ready to use. */
export function claimState(claim: VoucherClaim, now = Date.now()): { label: string; ended: boolean } {
  if (claim.status === 'REDEEMED') return { label: 'Đã sử dụng', ended: true };
  if (Date.parse(claim.campaign.endsAt) < now) return { label: 'Đã hết hạn', ended: true };
  if (!claim.campaign.active) return { label: 'Tạm dừng', ended: false };
  if (Date.parse(claim.campaign.startsAt) > now) return { label: 'Sắp diễn ra', ended: false };
  // Whether it fits an invoice is the server's to say when a discount is applied.
  return { label: 'Đã lưu trong ví', ended: false };
}

/** The wallet split in two lists: still open, and used or ended. */
export function splitWallet(claims: VoucherClaim[], now = Date.now()): { mine: VoucherClaim[]; history: VoucherClaim[] } {
  const mine: VoucherClaim[] = [];
  const history: VoucherClaim[] = [];
  for (const claim of claims) (claimState(claim, now).ended ? history : mine).push(claim);
  return { mine, history };
}

/** General offers the customer has not saved yet (the server already hides ended ones). */
export function unsavedGeneral(general: GeneralVoucher[], wallet: VoucherClaim[]): GeneralVoucher[] {
  const saved = new Set(wallet.map((claim) => claim.campaign.code));
  return general.filter((voucher) => !saved.has(voucher.code));
}

export const normalizeVoucherCode = (code: string): string => code.trim().toUpperCase();
export const isVoucherCode = (code: string): boolean => /^[A-Z0-9_-]{3,40}$/.test(normalizeVoucherCode(code));
