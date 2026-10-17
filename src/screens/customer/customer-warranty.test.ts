import type { WarrantyClaimView, WarrantyCoverageItem } from '../../api/orders.api';
import {
  busyWarrantyCoverageIds,
  formatWarrantyDate,
  isOpenWarrantyClaim,
  isWarrantyCoverageClaimable,
  validateWarrantyText,
  warrantyClaimDisplayMeta,
  warrantyCoverageLabel,
  warrantyCoverageTerm,
  warrantyCoverageUiStatus,
  warrantyCustomerPromptCopy,
} from './customer-warranty';

const coverage = (overrides: Partial<WarrantyCoverageItem> = {}): WarrantyCoverageItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  warrantyDaysSnapshot: 30,
  note: 'Công sửa chữa',
  startsAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-30T00:00:00.000Z',
  status: 'ACTIVE',
  ...overrides,
});

const claim = (overrides: Partial<WarrantyClaimView> = {}): WarrantyClaimView => ({
  id: '22222222-2222-4222-8222-222222222222',
  serviceOrderId: '33333333-3333-4333-8333-333333333333',
  warrantyCoverageId: coverage().id,
  status: 'submitted',
  description: 'Thiết bị bị lỗi trở lại.',
  evidenceRefs: null,
  submittedAfterExpiry: false,
  customerResponse: null,
  awaitingPrompt: null,
  resolutionNotes: null,
  submittedAt: '2026-09-29T03:00:00.000Z',
  resolvedAt: null,
  technician: null,
  ...overrides,
});

describe('customer warranty helpers', () => {
  it.each(['submitted', 'accepted', 'inspected', 'in_progress', 'awaiting_customer', 'disputed'])(
    'treats %s as an open claim',
    (status) => expect(isOpenWarrantyClaim(status)).toBe(true),
  );

  it.each(['resolved', 'rejected'])(
    'treats %s as closed',
    (status) => expect(isOpenWarrantyClaim(status)).toBe(false),
  );

  it('prevents duplicate unresolved claims per coverage', () => {
    expect(busyWarrantyCoverageIds([claim(), claim({ id: 'c2', status: 'resolved' })])).toEqual([coverage().id]);
    expect(isWarrantyCoverageClaimable(coverage(), [claim()])).toBe(false);
    expect(isWarrantyCoverageClaimable(coverage(), [claim({ status: 'resolved' })])).toBe(true);
  });

  it('allows expired coverage submission but fails closed for voided/unknown coverage', () => {
    const now = new Date('2026-11-01T00:00:00.000Z').getTime();
    expect(warrantyCoverageUiStatus(coverage(), now)).toBe('EXPIRED');
    expect(isWarrantyCoverageClaimable(coverage({ status: 'EXPIRED' }), [])).toBe(true);
    expect(isWarrantyCoverageClaimable(coverage({ status: 'VOIDED' }), [])).toBe(false);
    expect(isWarrantyCoverageClaimable(coverage({ status: 'SOMETHING' }), [])).toBe(false);
  });

  it('never exposes a raw inspection result in the customer status label', () => {
    expect(warrantyClaimDisplayMeta(claim({ status: 'inspected' })).label).toBe('Chờ quản lý dịch vụ duyệt');
  });

  it('uses completion-specific customer response copy', () => {
    expect(warrantyCustomerPromptCopy(claim({ status: 'awaiting_customer', awaitingPrompt: 'completion' }))).toMatchObject({
      agree: 'Đã khắc phục',
      dispute: 'Vẫn còn lỗi',
    });
  });

  it('requires 10..2000 chars for claim/dispute text', () => {
    expect(validateWarrantyText('short')).toMatch(/ít nhất 10/);
    expect(validateWarrantyText('0123456789')).toBeNull();
    expect(validateWarrantyText('a'.repeat(2001))).toMatch(/2000/);
  });

  it('formats dates in Vietnam timezone', () => {
    expect(formatWarrantyDate('2026-09-29T18:00:00.000Z')).toBe('30/09/2026');
  });

  it('names what a coverage covers, falling back to the note', () => {
    expect(warrantyCoverageLabel(coverage({ itemType: 'labor', itemDescription: 'Thay tụ' }))).toBe('Công sửa · Thay tụ');
    expect(warrantyCoverageLabel(coverage({ itemType: 'parts_equipment', itemDescription: 'Block' }))).toBe('Linh kiện · Block');
    expect(warrantyCoverageLabel(coverage({ itemType: null, itemDescription: null }))).toBe('Công sửa chữa');
  });

  it('shows days left while active and the end date once over', () => {
    const now = Date.parse('2026-10-01T00:00:00.000Z');
    expect(warrantyCoverageTerm(coverage(), now)).toBe('Bảo hành 30 ngày · đến 30/10/2026 · còn 29 ngày');
    expect(warrantyCoverageTerm(coverage({ status: 'EXPIRED' }), now)).toBe('Hết hạn 30/10/2026');
  });
});
