import React from 'react';
import { act, create } from 'react-test-renderer';
import { PartItemRow } from './PartItemRow';

const item = { id: 'i1', partNameSnapshot: 'Co đồng', quantity: 2, usageStatus: 'pending' } as never;
const record = { partRequestItemId: 'i1', issuedQty: 2, usedQty: 0, declaredQty: 2, managerAcceptedQty: 2, outstandingQty: 0, version: 3, usageRecorded: false } as never;

it('a fully returned line is settled as used 0 without asking, and offers no usage editor', async () => {
  const onSaveUsed = jest.fn(async () => true);
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<PartItemRow item={item} received canMarkUsage frozen={false} record={record} busy={false} onWhole={() => {}} onSaveUsed={onSaveUsed} onDeclare={async () => true} />); });
  expect(onSaveUsed).toHaveBeenCalledTimes(1);
  expect(onSaveUsed).toHaveBeenCalledWith(0);
  expect(r.root.findAllByProps({ testID: 'part-usage-open-i1' })).toHaveLength(0);
  expect(JSON.stringify(r.toJSON())).toContain('Đã trả lại');
});
