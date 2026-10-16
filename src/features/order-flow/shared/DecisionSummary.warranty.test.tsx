import React from 'react';
import { act, create } from 'react-test-renderer';
import { DecisionSummary } from './DecisionSummary';

const quotation = {
  id: 'q1', serviceOrderId: 'o1', status: 'SENT', version: 1, laborTotal: 100000, partsTotal: 0,
  items: [
    { id: 'i1', type: 'labor', description: 'Công sửa', quantity: 1, unitPrice: 100000, lineTotal: 100000, warrantyDays: 90 },
    { id: 'i2', type: 'labor', description: 'Công kiểm tra', quantity: 1, unitPrice: 0, lineTotal: 0 },
  ],
} as never;

it('shows the technician-declared warranty days on the quote line', () => {
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<DecisionSummary quotation={quotation} eligible={[]} selectedIds={[]} preview={null} interactive={false} />); });
  const out = JSON.stringify(r.toJSON()).replace(/","/g, '');
  expect(out).toContain('Bảo hành 90 ngày');
  expect(out.match(/Bảo hành \d+ ngày/g)).toHaveLength(1);
});
