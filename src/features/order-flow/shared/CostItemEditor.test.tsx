import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  CostItemEditor,
  costItemRowToPayloadItem,
  createCostItemRow,
  switchCostItemKind,
  switchCostItemSource,
  type CostItemRow,
} from './CostItemEditor';

function row(overrides: Partial<CostItemRow> = {}): CostItemRow {
  return { ...createCostItemRow('parts_equipment'), ...overrides };
}

function uniq(root: any, re: RegExp): string[] {
  const nodes: any[] = root.findAll((node: any) => re.test(String(node.props?.testID ?? '')));
  const ids: string[] = nodes.map(node => String(node.props.testID));
  return [...new Set(ids)];
}

const noop = () => {};

it('source switches clear forbidden fields instead of carrying them', () => {
  const paid = row({ partSource: 'technician', partWarrantyOption: 'paid_warranty', warrantyTermDays: '90', warrantyFee: '30000' });
  const external = switchCostItemSource(paid, 'external');
  expect(external.partWarrantyOption).toBe('no_warranty');
  expect(external.warrantyTermDays).toBe('');
  expect(external.warrantyFee).toBe('');

  const fixhome = switchCostItemSource(
    row({ partSource: 'technician', partCatalogId: 'catalog-1', partNameSnapshot: 'Bo mạch' }),
    'fixhome',
  );
  expect(fixhome.partCatalogId).toBe('');
  expect(fixhome.partNameSnapshot).toBe('');

  const labor = switchCostItemKind(paid, 'labor');
  expect(labor.partWarrantyOption).toBe('no_warranty');
  expect(labor.warrantyTermDays).toBe('');
  expect(labor.warrantyFee).toBe('');
});

it('payload shaping passes raw strings through for the controller validator', () => {
  const shaped = costItemRowToPayloadItem(row({ description: 'Tụ', quantity: 'abc', unitPrice: '10.5' }));
  expect(shaped).toMatchObject({ type: 'parts_equipment', quantity: 'abc', unitPrice: '10.5' });
  const labor = costItemRowToPayloadItem({ ...createCostItemRow('labor'), laborWarrantyDays: '180' });
  expect(labor).toMatchObject({ type: 'labor', warrantyDays: '180' });
});

it('labor rows hide parts warranty and external rows stay no-warranty', async () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CostItemEditor row={createCostItemRow('labor')} expanded canRemove={false} onToggle={noop} onChange={onChange} onRemove={noop} />,
    );
  });
  expect(uniq(renderer.root, /labor-warranty$/).filter(id => !id.includes('error-'))).toHaveLength(1);
  expect(uniq(renderer.root, /warranty-paid$/)).toHaveLength(0);
  await act(async () => renderer.unmount());

  const externalRow = row({ partSource: 'external' });
  await act(async () => {
    renderer = create(
      <CostItemEditor row={externalRow} expanded canRemove onToggle={noop} onChange={onChange} onRemove={noop} />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/không bảo hành/);
  expect(uniq(renderer.root, /warranty-term$/)).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('catalog error vs empty both offer explicit retry, never placeholder options', async () => {
  const onLoadCatalog = jest.fn();
  const fixhomeRow = row({ partSource: 'fixhome' });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CostItemEditor
        row={fixhomeRow}
        expanded
        canRemove={false}
        onToggle={noop}
        onChange={noop}
        onRemove={noop}
        catalog={{ status: 'error', parts: [], error: 'Không tải được danh mục. Hãy thử tải lại.' }}
        onLoadCatalog={onLoadCatalog}
      />,
    );
  });
  expect(uniq(renderer.root, /catalog-error$/)).toHaveLength(1);
  expect(renderer.root.findAll(node => String(node.props?.testID ?? '').includes('catalog-option-'))).toHaveLength(0);
  await act(async () => {
    renderer.root.findAll(node => /catalog-retry$/.test(String(node.props?.testID ?? '')))[0].props.onPress();
  });
  expect(onLoadCatalog).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());

  await act(async () => {
    renderer = create(
      <CostItemEditor
        row={fixhomeRow}
        expanded
        canRemove={false}
        onToggle={noop}
        onChange={noop}
        onRemove={noop}
        catalog={{ status: 'empty', parts: [], error: null }}
        onLoadCatalog={onLoadCatalog}
      />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/đang trống/);
  expect(renderer.root.findAll(node => String(node.props?.testID ?? '').includes('catalog-option-'))).toHaveLength(0);
  await act(async () => renderer.unmount());

  const readyRow = row({ partSource: 'fixhome' });
  await act(async () => {
    renderer = create(
      <CostItemEditor
        row={readyRow}
        expanded
        canRemove={false}
        onToggle={noop}
        onChange={noop}
        onRemove={noop}
        catalog={{ status: 'ready', parts: [{ id: 'part-1', name: 'Bo mạch', sellingPrice: 500000, warrantyDays: 365, warrantyPolicy: null, sku: null }], error: null }}
        onLoadCatalog={onLoadCatalog}
        onSelectCatalogPart={jest.fn()}
      />,
    );
  });
  const optionIds = uniq(renderer.root, /catalog-option-/);
  expect(optionIds).toHaveLength(1);
  await act(async () => renderer.unmount());
});

it('collapsed rows mount no full form and remove respects the single-row floor', async () => {
  const onRemove = jest.fn();
  const onToggle = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CostItemEditor row={row()} expanded={false} canRemove={false} onToggle={onToggle} onChange={noop} onRemove={onRemove} />,
    );
  });
  expect(uniq(renderer.root, /-description$/)).toHaveLength(0);
  await act(async () => {
    renderer.root.findAll(node => /header$/.test(String(node.props?.testID ?? '')))[0].props.onPress();
  });
  expect(onToggle).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});
