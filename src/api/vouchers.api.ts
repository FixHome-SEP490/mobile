// src/api/vouchers.api.ts
//
// The customer's voucher wallet (backend /vouchers, web #175): browse the general offers, read the wallet and save a
// code. Saving is a CLAIM only; nothing here reserves or applies a discount to an invoice.

import apiClient from './client';

export interface VoucherPolicy {
  discount: 'PERCENT' | 'FIXED';
  value: number;
  capVnd: number | null;
  minimumVnd: number;
}

export interface GeneralVoucher {
  id: string;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  policy: VoucherPolicy;
}

export interface VoucherClaim {
  id: string;
  campaignId: string;
  status: 'CLAIMED' | 'REDEEMED';
  redeemedAt: string | null;
  policy: VoucherPolicy;
  campaign: { code: string; name: string; kind: 'GENERAL' | 'PERSONAL'; startsAt: string; endsAt: string; active: boolean };
}

export const VOUCHER_INVALID = 'Thông tin ưu đãi chưa đầy đủ. Vui lòng thử lại.';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isInt = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= 2147483647;
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function parsePolicy(value: unknown): VoucherPolicy {
  if (!isRecord(value) || !['PERCENT', 'FIXED'].includes(String(value.discount)) || !isInt(value.value, 1)
    || (value.discount === 'PERCENT' && value.value > 100) || !(value.capVnd === null || isInt(value.capVnd, 1)) || !isInt(value.minimumVnd)) {
    throw new Error(VOUCHER_INVALID);
  }
  return { discount: value.discount as VoucherPolicy['discount'], value: value.value, capVnd: value.capVnd as number | null, minimumVnd: value.minimumVnd };
}

export function parseGeneralVoucher(value: unknown): GeneralVoucher {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.code !== 'string' || typeof value.name !== 'string'
    || !isDate(value.startsAt) || !isDate(value.endsAt)) throw new Error(VOUCHER_INVALID);
  return { id: value.id, code: value.code, name: value.name, startsAt: value.startsAt, endsAt: value.endsAt, policy: parsePolicy(value.policy) };
}

export function parseVoucherClaim(value: unknown): VoucherClaim {
  const campaign = isRecord(value) ? value.campaign : null;
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.campaignId !== 'string'
    || !['CLAIMED', 'REDEEMED'].includes(String(value.status))
    || !(value.status === 'CLAIMED' ? value.redeemedAt === null : isDate(value.redeemedAt))
    || !isRecord(campaign) || typeof campaign.code !== 'string' || typeof campaign.name !== 'string'
    || !['GENERAL', 'PERSONAL'].includes(String(campaign.kind)) || typeof campaign.active !== 'boolean'
    || !isDate(campaign.startsAt) || !isDate(campaign.endsAt)) throw new Error(VOUCHER_INVALID);
  return {
    id: value.id, campaignId: value.campaignId, status: value.status as VoucherClaim['status'], redeemedAt: value.redeemedAt as string | null,
    policy: parsePolicy(value.policySnapshot),
    campaign: { code: campaign.code, name: campaign.name, kind: campaign.kind as 'GENERAL' | 'PERSONAL', startsAt: campaign.startsAt, endsAt: campaign.endsAt, active: campaign.active },
  };
}

function data(payload: unknown): unknown {
  if (!isRecord(payload) || payload.success !== true) throw new Error(VOUCHER_INVALID);
  return payload.data;
}

function list<T>(payload: unknown, parse: (item: unknown) => T): T[] {
  const rows = data(payload);
  if (!Array.isArray(rows)) throw new Error(VOUCHER_INVALID);
  return rows.map(parse);
}

export const vouchersApi = {
  async general(): Promise<GeneralVoucher[]> {
    return list((await apiClient.get('/vouchers/general')).data, parseGeneralVoucher);
  },
  async wallet(): Promise<VoucherClaim[]> {
    return list((await apiClient.get('/vouchers/wallet')).data, parseVoucherClaim);
  },
  /** Saves the code in the wallet. It does not check that the voucher fits any invoice. */
  async claim(code: string): Promise<VoucherClaim> {
    return parseVoucherClaim(data((await apiClient.post('/vouchers/claim', { code: code.trim().toUpperCase() })).data));
  },
};
