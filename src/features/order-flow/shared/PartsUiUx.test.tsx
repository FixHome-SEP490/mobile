import React from 'react';
import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { CatalogPicker } from './CatalogPicker';
import { ConfirmSummary } from './ConfirmSummary';
import { costItemRowSubtotal, createCostItemRow, validateCostItemRows } from './CostItemEditor';
import { FulfillmentMethodPicker } from './FulfillmentMethodPicker';
import { PartPickerRow } from './PartPickerRow';
import { ReadOnlyNotice } from './TaskScreenShell';

jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

const noop = () => {};
const text = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());

it('row subtotal is null (never 0) until quantity and price are whole numbers', () => {
  expect(costItemRowSubtotal({ quantity: '2', unitPrice: '150000' })).toBe(300000);
  expect(costItemRowSubtotal({ quantity: '', unitPrice: '150000' })).toBeNull();
  expect(costItemRowSubtotal({ quantity: '1', unitPrice: '1.5' })).toBeNull();
});

it('required-field hints flag blank description, quantity, price and a FixHome row without a catalog part', () => {
  const labor = createCostItemRow('labor');
  const part = { ...createCostItemRow('parts_equipment'), partSource: 'fixhome' as const, description: 'Van', quantity: '1', unitPrice: '10' };
  const errors = validateCostItemRows([labor, part]);
  expect(Object.keys(errors[labor.key]).sort()).toEqual(['description', 'quantity', 'unitPrice']);
  expect(Object.keys(errors[part.key])).toEqual(['partCatalogId']);
  expect(validateCostItemRows([{ ...part, partCatalogId: 'id' }])).toEqual({});
});

it('error notices are announced as alerts, info stays a passive summary', async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<><ReadOnlyNotice tone="error">Lỗi</ReadOnlyNotice><ReadOnlyNotice>Thông tin</ReadOnlyNotice></>); });
  const roles = r.root.findAllByType(View).map(n => n.props.accessibilityRole);
  expect(roles).toEqual(['alert', 'summary']);
});

it('fulfillment picker shows the selected method and its hint', async () => {
  const onChange = jest.fn();
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<FulfillmentMethodPicker testIDPrefix="m" value="delivery" onChange={onChange} />); });
  expect(r.root.findByProps({ testID: 'm-delivery' }).props.accessibilityState.selected).toBe(true);
  expect(r.root.findByProps({ testID: 'm-pickup' }).props.accessibilityState.selected).toBe(false);
  expect(text(r)).toContain('nhân viên giao hàng');
  await act(async () => { r.root.findByProps({ testID: 'm-pickup' }).props.onPress(); });
  expect(onChange).toHaveBeenCalledWith('pickup');
});

it('confirm summary lists every line and the total', async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(<ConfirmSummary testID="c" title="T" items={[{ title: 'Van', detail: '2 × 10', amount: '20' }, { title: 'Tụ' }]} lines={[{ label: 'Lý do', value: 'Hỏng' }]} total={{ label: 'Tổng', value: '20' }} />);
  });
  const out = text(r);
  expect(out).toContain('Van');
  expect(out).toContain('Tụ');
  expect(out).toContain('Hỏng');
  expect(out).toContain('Tổng');
});

it('part picker row offers only catalog, quantity stepper and note, and clamps quantity', async () => {
  const onChange = jest.fn();
  const row = { ...createCostItemRow('parts_equipment'), partSource: 'fixhome' as const, quantity: '1' };
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(<PartPickerRow row={row} expanded canRemove={false} maxQuantity={3} onToggle={noop} onChange={onChange} onRemove={noop} catalog={{ status: 'ready', parts: [], error: null }} />);
  });
  const out = text(r);
  expect(out).not.toMatch(/Tiền công|Mua ngoài|Đơn giá|Bảo hành/);
  expect(r.root.findByProps({ testID: `cost-item-${row.key}-qty-minus` }).props.disabled).toBe(true);
  await act(async () => { r.root.findByProps({ testID: `cost-item-${row.key}-qty-plus` }).props.onPress(); });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: '2' }));
  await act(async () => { r.root.findByProps({ accessibilityLabel: 'Số lượng' }).props.onChangeText('a7'); });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: '7' }));
});

it('catalog picker loads once when idle, pages long results and marks the chosen part', async () => {
  const onLoad = jest.fn();
  const parts = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Linh kiện ${i}`, sellingPrice: 1000, sku: null }));
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<CatalogPicker idPrefix="x-" selectedId="p1" catalog={{ status: 'idle', parts: [], error: null }} onLoad={onLoad} />); });
  expect(onLoad).toHaveBeenCalledTimes(1);
  await act(async () => { r.update(<CatalogPicker idPrefix="x-" selectedId="p1" catalog={{ status: 'ready', parts, error: null }} onLoad={onLoad} />); });
  expect(r.root.findAll(n => /^x-catalog-option-/.test(String(n.props?.testID ?? ''))).length).toBeGreaterThan(0);
  expect(r.root.findByProps({ testID: 'x-catalog-option-p1' }).props.accessibilityState.selected).toBe(true);
  expect(text(r)).toContain('Đã chọn');
  expect(r.root.findAllByProps({ testID: 'x-catalog-option-p9' })).toHaveLength(0);
  await act(async () => { r.root.findByProps({ testID: 'x-catalog-more' }).props.onPress(); });
  expect(r.root.findAllByProps({ testID: 'x-catalog-option-p9' }).length).toBeGreaterThan(0);
  expect(onLoad).toHaveBeenCalledTimes(1);
});
