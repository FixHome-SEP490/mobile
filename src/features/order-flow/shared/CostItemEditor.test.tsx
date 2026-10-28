import {
  costItemRowToPayloadItem,
  createCostItemRow,
  switchCostItemKind,
  validateCostItemRows,
  type CostItemRow,
} from './CostItemEditor';

function row(overrides: Partial<CostItemRow> = {}): CostItemRow {
  return { ...createCostItemRow('parts_equipment'), ...overrides };
}

it('a new part row is a FixHome catalog part and needs a catalog pick', () => {
  const part = row({ description: 'Tụ', quantity: '1', unitPrice: '10000' });
  expect(part.partSource).toBe('fixhome');
  expect(validateCostItemRows([part])[part.key]).toEqual({ partCatalogId: 'Chọn một linh kiện trong danh mục FixHome.' });
  expect(validateCostItemRows([{ ...part, partCatalogId: 'catalog-1' }])).toEqual({});
});

it('switching a row to labor drops part fields instead of carrying them', () => {
  const labor = switchCostItemKind(row({ partCatalogId: 'catalog-1', partNameSnapshot: 'Bo mạch', warrantyTermDays: '90', warrantyFee: '30000' }), 'labor');
  expect(labor.partCatalogId).toBe('');
  expect(labor.partNameSnapshot).toBe('');
  expect(labor.warrantyTermDays).toBe('');
  expect(labor.warrantyFee).toBe('');
});

it('payload shaping passes raw strings through for the controller validator and only ever sends FixHome parts', () => {
  const shaped = costItemRowToPayloadItem(row({ description: 'Tụ', quantity: 'abc', unitPrice: '10.5', partCatalogId: 'catalog-1' }));
  expect(shaped).toMatchObject({ type: 'parts_equipment', partSource: 'fixhome', partCatalogId: 'catalog-1', quantity: 'abc', unitPrice: '10.5' });
  const labor = costItemRowToPayloadItem({ ...createCostItemRow('labor'), laborWarrantyDays: '180' });
  expect(labor).toMatchObject({ type: 'labor', warrantyDays: '180' });
});
