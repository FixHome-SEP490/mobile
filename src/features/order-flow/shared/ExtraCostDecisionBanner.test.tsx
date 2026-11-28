import React from 'react';
import { act, create } from 'react-test-renderer';
import ExtraCostDecisionBanner from './ExtraCostDecisionBanner';
import { clearExtraCostDecision, EXTRA_COST_NOTICE_MS, showExtraCostDecision } from '../runtime/extra-cost-decision-notice';

beforeEach(() => { jest.useFakeTimers(); clearExtraCostDecision(); });
afterEach(() => { jest.useRealTimers(); });

const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON());

it('says the customer rejected or approved the proposal, only for that order, and goes away by itself', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<ExtraCostDecisionBanner orderId="order-1" />); });
  expect(text(renderer)).not.toContain('Khách đã');

  await act(async () => { showExtraCostDecision({ id: 'n1', orderId: 'order-2', approved: false }); });
  expect(text(renderer)).not.toContain('Khách đã');

  await act(async () => { showExtraCostDecision({ id: 'n2', orderId: 'order-1', approved: false }); });
  expect(text(renderer)).toContain('Khách đã từ chối đề xuất của bạn');

  await act(async () => { showExtraCostDecision({ id: 'n3', orderId: 'order-1', approved: true }); });
  expect(text(renderer)).toContain('Khách đã đồng ý đề xuất của bạn');

  await act(async () => { jest.advanceTimersByTime(EXTRA_COST_NOTICE_MS + 10); });
  expect(text(renderer)).not.toContain('Khách đã');
  await act(async () => renderer.unmount());
});
