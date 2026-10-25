import { normalizeOrderResource, normalizeSessionOrder } from './order-view-models';
it('unknown evidence type fails closed and never escapes customer boundary', () => {
  expect(() => normalizeOrderResource('evidence', [{ id: 'e', serviceOrderId: 'o', type: 'face', mediaUrl: 'PRIVATE' }], 'o', 'customer')).toThrow();
});
it('wrong order rows and malformed arrays fail closed', () => {
  expect(() => normalizeOrderResource('extras', [{ id: 'e', serviceOrderId: 'other', status: 'pending_approval' }], 'o', 'customer')).toThrow();
  expect(() => normalizeOrderResource('parts', {}, 'o', 'technician')).toThrow();
  expect(() => normalizeSessionOrder({ id: 'other', status: 'accepted' }, 'o')).toThrow();
});
it('customer parts projection excludes QR, staff/internal holder data', () => {
  const result = normalizeOrderResource('parts', [{ id: 'p', serviceOrderId: 'o', status: 'received', qrToken: 'PRIVATE', preparedByUserId: 'PRIVATE', technicianId: 'PRIVATE', items: [] }], 'o', 'customer');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('history keeps exact server transitions and timestamp while omitting private actor fields', () => {
  expect(normalizeOrderResource('history', [{ id: 'h', serviceOrderId: 'o', fromStatus: 'accepted', toStatus: 'en_route', actorRole: 'technician', actorUserId: 'PRIVATE', reason: null, createdAt: '2026-10-13T00:00:00Z' }], 'o', 'customer')).toEqual([
    { id: 'h', serviceOrderId: 'o', fromStatus: 'ACCEPTED', toStatus: 'EN_ROUTE', actorRole: 'technician', reason: null, createdAt: '2026-10-13T00:00:00Z' },
  ]);
});
it('invoice line items use items and retain valid numeric strings without recalculating money', () => {
  const invoice = normalizeOrderResource('invoice', { id: 'i', serviceOrderId: 'o', paymentStatus: 'unpaid', grandTotal: '10000.00', items: [{ id: 'l', description: 'Fixture', quantity: 1, lineTotal: '10000.00', providerId: 'PRIVATE', commissionSnapshot: 'PRIVATE' }] }, 'o', 'customer');
  expect(invoice?.items).toEqual([{ id: 'l', description: 'Fixture', quantity: 1, lineTotal: '10000.00' }]);
  expect(JSON.stringify(invoice)).not.toContain('PRIVATE');
});
it.each([{}, null, 'no-array'])('malformed items %p are an error rather than empty lines', items => {
  expect(() => normalizeOrderResource('invoice', { id: 'i', serviceOrderId: 'o', paymentStatus: 'unpaid', grandTotal: 1, items }, 'o', 'customer')).toThrow();
});
it.each([null, NaN, Infinity, '', '10abc', -1])('invalid lineTotal %p is never paid/zero proof', lineTotal => {
  expect(() => normalizeOrderResource('invoice', { id: 'i', serviceOrderId: 'o', paymentStatus: 'unpaid', grandTotal: 1, items: [{ id: 'l', description: 'Fixture', quantity: 1, lineTotal }] }, 'o', 'customer')).toThrow();
});
it('malformed parts items cannot become an empty request or crash readiness', () => {
  expect(() => normalizeOrderResource('parts', [{ id: 'p', serviceOrderId: 'o', status: 'received', items: {} }], 'o', 'technician')).toThrow();
  expect(() => normalizeOrderResource('parts', [{ id: 'p', serviceOrderId: 'o', status: 'received', items: null }], 'o', 'customer')).toThrow();
});
it.each(['pending', 'unknown', '', 1])('unsupported extra status %p cannot become no pending costs', status => {
  expect(() => normalizeOrderResource('extras', [{ id: 'e', serviceOrderId: 'o', status }], 'o', 'technician')).toThrow();
});
it('quotations normalization preserves authoritative fields and valid string money without grandTotal', () => {
  const result = normalizeOrderResource('quotations', [{
    id: 'q-1', serviceOrderId: 'o', technicianId: 'tech-1', status: 'sent', version: 1,
    laborTotal: '150000', partsTotal: '200000', note: 'Ghi chú', sentAt: '2026-10-13T00:00:00Z',
    items: [{
      id: 'item-1', quotationId: 'q-1', type: 'labor', description: 'Công thợ', quantity: 1, unitPrice: '150000', lineTotal: '150000', warrantyDays: 365,
    }],
  }], 'o', 'customer');
  expect(result).toHaveLength(1);
  expect(result[0].status).toBe('SENT');
  expect(result[0].laborTotal).toBe('150000');
  expect((result[0] as any).grandTotal).toBeUndefined();
  expect(result[0].items[0].description).toBe('Công thợ');
  expect(result[0].items[0].unitPrice).toBe(150000);
});

it('malformed quotation items fail closed', () => {
  expect(() => normalizeOrderResource('quotations', [{
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 0, partsTotal: 0,
    items: [{ description: 'Không có giá', quantity: 1, unitPrice: -1, type: 'labor' }],
  }], 'o', 'technician')).toThrow();
  expect(() => normalizeOrderResource('quotations', [{
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 0, partsTotal: 0,
    items: [{ description: '', quantity: 1, unitPrice: 100, type: 'labor' }],
  }], 'o', 'technician')).toThrow();
});

it('strict quotations normalization rejects missing items, empty items, and items > 100', () => {
  // Missing items
  expect(() => normalizeOrderResource('quotations', [{
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 0, partsTotal: 0,
  }], 'o', 'customer')).toThrow('Invalid quotation items');

  // Empty items []
  expect(() => normalizeOrderResource('quotations', [{
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 0, partsTotal: 0,
    items: [],
  }], 'o', 'customer')).toThrow('Invalid quotation items');

  // Items > 100
  const manyItems = Array.from({ length: 101 }, (_, i) => ({
    description: `Item ${i}`, quantity: 1, unitPrice: 1000, type: 'labor',
  }));
  expect(() => normalizeOrderResource('quotations', [{
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 0, partsTotal: 0,
    items: manyItems,
  }], 'o', 'customer')).toThrow('Invalid quotation items');
});

it('strict quotations normalization rejects missing technicianId, invalid version, and invalid status', () => {
  const baseValid = {
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 0, partsTotal: 0,
    items: [{ description: 'Công thợ', quantity: 1, unitPrice: 1000, type: 'labor' }],
  };

  // Missing technicianId
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, technicianId: '' }], 'o', 'customer')).toThrow('Invalid quotation technicianId');

  // Missing/invalid version
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, version: 0 }], 'o', 'customer')).toThrow('Invalid quotation version');
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, version: -1 }], 'o', 'customer')).toThrow('Invalid quotation version');
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, version: 1.5 }], 'o', 'customer')).toThrow('Invalid quotation version');

  // Invalid status
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, status: 'INVALID_STATUS' }], 'o', 'customer')).toThrow('Invalid quotation status');
});

it('strict quotations normalization rejects missing/fractional/unsafe totals', () => {
  const baseValid = {
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 100000, partsTotal: 50000,
    items: [{ description: 'Công thợ', quantity: 1, unitPrice: 1000, type: 'labor' }],
  };

  // Missing laborTotal
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, laborTotal: undefined }], 'o', 'customer')).toThrow('Invalid quotation laborTotal');
  // Fractional laborTotal
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, laborTotal: 100.5 }], 'o', 'customer')).toThrow('Invalid quotation laborTotal');
  // Unsafe partsTotal
  expect(() => normalizeOrderResource('quotations', [{ ...baseValid, partsTotal: Number.MAX_SAFE_INTEGER + 10 }], 'o', 'customer')).toThrow('Invalid quotation partsTotal');
});

it('strict quotations normalization requires explicit item type and validates warranty boundaries', () => {
  const baseValid = {
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 100000, partsTotal: 50000,
  };

  // Missing item type
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
  }], 'o', 'customer')).toThrow('Invalid quotation item type');

  // Unknown item type
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'unknown_type' }],
  }], 'o', 'customer')).toThrow('Invalid quotation item type');

  // Fractional warrantyFee
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', warrantyFee: 50.5 }],
  }], 'o', 'customer')).toThrow('Invalid quotation item warrantyFee');

  // Genuine zero warrantyFee is valid
  const res = normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', warrantyFee: 0, warrantyTermDays: 30 }],
  }], 'o', 'customer');
  expect(res[0].items[0].warrantyFee).toBe(0);

  // WarrantyTermDays out of bounds for paid_warranty (1..3650)
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', partSource: 'technician', partWarrantyOption: 'paid_warranty', warrantyFee: 0, warrantyTermDays: 0 }],
  }], 'o', 'customer')).toThrow('Invalid quotation item warrantyTermDays');
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', warrantyTermDays: 4000 }],
  }], 'o', 'customer')).toThrow('Invalid quotation item warrantyTermDays');
});

it('non-paid warrantyTermDays 0 is authoritative (EXTERNAL fee0/term0, FixHome catalog days 0); malformed still rejected', () => {
  const baseValid = {
    id: 'q-1', serviceOrderId: 'o', status: 'sent', technicianId: 't-1', version: 1, laborTotal: 100000, partsTotal: 50000,
  };

  const ext = normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Ống ngoài', quantity: 1, unitPrice: 1000, type: 'parts_equipment', partSource: 'external', partWarrantyOption: 'no_warranty', warrantyFee: 0, warrantyTermDays: 0 }],
  }], 'o', 'customer');
  expect(ext[0].items[0].warrantyTermDays).toBe(0);
  expect(ext[0].items[0].warrantyFee).toBe(0);

  const fixhome = normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Bo mạch', quantity: 1, unitPrice: 1000, type: 'parts_equipment', partSource: 'fixhome', warrantyTermDays: 0, warrantyDaysSnapshot: 0 }],
  }], 'o', 'customer');
  expect(fixhome[0].items[0].warrantyTermDays).toBe(0);

  const techNoWarranty = normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Băng keo thợ', quantity: 1, unitPrice: 1000, type: 'parts_equipment', partSource: 'technician', partWarrantyOption: 'no_warranty', warrantyTermDays: 0 }],
  }], 'o', 'customer');
  expect(techNoWarranty[0].items[0].warrantyTermDays).toBe(0);

  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', warrantyTermDays: -1 }],
  }], 'o', 'customer')).toThrow('Invalid quotation item warrantyTermDays');
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', warrantyTermDays: 1.5 }],
  }], 'o', 'customer')).toThrow('Invalid quotation item warrantyTermDays');
  expect(() => normalizeOrderResource('quotations', [{
    ...baseValid,
    items: [{ description: 'Item', quantity: 1, unitPrice: 1000, type: 'parts_equipment', warrantyTermDays: '30' }],
  }], 'o', 'customer')).toThrow('Invalid quotation item warrantyTermDays');
});
it('additional-cost money arrives as digit strings and is read as numbers', () => {
  const [cost] = normalizeOrderResource('extras', [{
    id: 'e', serviceOrderId: 'o', status: 'pending_approval', totalLaborDelta: '100000', totalPartsDelta: '480000', shippingFee: '0',
    items: [{ id: 'i', type: 'parts_equipment', quantity: 1, unitPrice: '450000', lineTotal: '450000', warrantyFee: '20000' }],
  }], 'o', 'customer') as any[];
  expect(cost).toMatchObject({ totalLaborDelta: 100000, totalPartsDelta: 480000, shippingFee: 0 });
  expect(cost.items[0]).toMatchObject({ unitPrice: 450000, lineTotal: 450000, warrantyFee: 20000 });
});
