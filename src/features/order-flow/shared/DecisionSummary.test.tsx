import React from 'react';
import { act, create } from 'react-test-renderer';
import { DecisionSummary } from './DecisionSummary';
import type { OrderQuotation } from '../domain/order-session.types';
import type { EligibleWarrantyOption } from '../customer/customer-quotation-controller';

const warrantyItemId = '66666666-7777-4888-8999-000000000000';

function quote(): OrderQuotation {
  return {
    id: 'quote-1',
    serviceOrderId: 'order-1',
    technicianId: 'tech-1',
    status: 'SENT',
    version: 1,
    laborTotal: 150000,
    partsTotal: 100000,
    items: [
      { id: 'labor-1', type: 'labor', description: 'Công thợ', quantity: 1, unitPrice: 150000 },
      {
        id: warrantyItemId,
        type: 'parts_equipment',
        description: 'Tụ thợ',
        quantity: 5,
        unitPrice: 50000,
        partSource: 'technician',
        partWarrantyOption: 'paid_warranty',
        warrantyFee: 20000,
        warrantyTermDays: 90,
      },
    ],
  };
}

function eligible(): EligibleWarrantyOption[] {
  return [{ itemId: warrantyItemId, description: 'Tụ thợ', fee: 20000, termDays: 90 }];
}

const noop = () => {};

it('warranty opt-ins default OFF with no preselected toggles', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DecisionSummary quotation={quote()} eligible={eligible()} selectedIds={[]} preview={null} interactive onToggleItem={noop} />,
    );
  });
  const toggles = [...new Set(renderer.root
    .findAll(node => String(node.props?.testID ?? '').startsWith('warranty-toggle-'))
    .map(node => String(node.props.testID)))];
  expect(toggles).toHaveLength(1);
  const toggleNodes = renderer.root.findAll(node => String(node.props?.testID ?? '').startsWith('warranty-toggle-'));
  expect(toggleNodes[0].props.accessibilityState).toEqual({ checked: false });
  await act(async () => renderer.unmount());
});

it('null preview stays unavailable and is distinct from a genuine zero preview', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DecisionSummary quotation={quote()} eligible={eligible()} selectedIds={[]} preview={null} interactive={false} />,
    );
  });
  const unavailable = [...new Set(renderer.root
    .findAll(node => node.props?.testID === 'decision-preview-unavailable')
    .map(() => 'decision-preview-unavailable'))];
  expect(unavailable).toHaveLength(1);
  const previewNow = [...new Set(renderer.root
    .findAll(node => node.props?.testID === 'decision-preview')
    .map(() => 'decision-preview'))];
  expect(previewNow).toHaveLength(0);
  await act(async () => renderer.unmount());

  await act(async () => {
    renderer = create(
      <DecisionSummary
        quotation={quote()}
        eligible={eligible()}
        selectedIds={[]}
        preview={{ baseLabor: 150000, baseParts: 100000, warrantyTotal: 0, previewGrandTotal: 250000 }}
        interactive={false}
      />,
    );
  });
  const previewLater = [...new Set(renderer.root
    .findAll(node => node.props?.testID === 'decision-preview')
    .map(() => 'decision-preview'))];
  expect(previewLater).toHaveLength(1);
  const unavailableLater = [...new Set(renderer.root
    .findAll(node => node.props?.testID === 'decision-preview-unavailable')
    .map(() => 'decision-preview-unavailable'))];
  expect(unavailableLater).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('toggle reports the exact eligible item id and selected state renders read-only scope', async () => {  const onToggleItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DecisionSummary quotation={quote()} eligible={eligible()} selectedIds={[]} preview={null} interactive onToggleItem={onToggleItem} />,
    );
  });
  await act(async () => {
    renderer.root.findAll(node => node.props?.testID === `warranty-toggle-${warrantyItemId}`)[0].props.onPress();
  });
  expect(onToggleItem).toHaveBeenCalledTimes(1);
  expect(onToggleItem).toHaveBeenCalledWith(warrantyItemId);
  await act(async () => renderer.unmount());

  await act(async () => {
    renderer = create(
      <DecisionSummary quotation={quote()} eligible={eligible()} selectedIds={[warrantyItemId]} preview={null} interactive={false} />,
    );
  });
  expect(renderer.root.findAll(node => String(node.props?.testID ?? '').startsWith('warranty-toggle-'))).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).toMatch(/Đã chọn bảo hành dòng này/);
  await act(async () => renderer.unmount());
});

it('opt-in shows fee and term beside the choice before selecting', async () => {
  const onToggleItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DecisionSummary quotation={quote()} eligible={eligible()} selectedIds={[]} preview={null} interactive onToggleItem={onToggleItem} />,
    );
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/20\.000/);
  expect(text).toMatch(/90 ngày/);
  await act(async () => renderer.unmount());
});
