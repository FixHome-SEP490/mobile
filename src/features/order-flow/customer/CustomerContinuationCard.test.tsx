import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import CustomerContinuationCard, { CONTINUATION_READ_FAILED, StoppedWorkFinanceNote } from './CustomerContinuationCard';

const mockGet = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../../api/customer-continuation.api', () => ({ customerContinuationApi: { get: (...a: unknown[]) => mockGet(...a) } }));
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return { useNavigation: () => ({ navigate: mockNavigate }), useFocusEffect: (effect: () => void | (() => void)) => R.useEffect(effect, [effect]) };
});

const order = { id: 'ord-1', bookingId: 'bk-1', visitGroupId: null, status: 'UNDER_REPAIR' };
const result = (over: Record<string, unknown> = {}, next: Record<string, unknown> = {}) => ({
  workStopped: true,
  customerContinuation: { eligible: true, independentNewBookingAllowed: true, prefilledRebookAvailable: true, source: { serviceOrderId: 'ord-1', bookingId: 'bk-1' }, ...next },
  ...over,
});
const mounted: ReturnType<typeof create>[] = [];
const render = async (o = order) => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<CustomerContinuationCard order={o} />); }); mounted.push(r); return r; };
afterEach(async () => { await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); }); });
const find = (r: ReturnType<typeof create>, pred: (n: ReactTestInstance) => boolean) => r.root.findAll(pred);
const byId = (r: ReturnType<typeof create>, id: string) => find(r, (n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON());

beforeEach(() => jest.clearAllMocks());

describe('CustomerContinuationCard', () => {
  it('shows nothing when there is nothing to continue', async () => {
    mockGet.mockResolvedValue(result({ workStopped: undefined }, { eligible: false, source: null }));
    const r = await render();
    expect(r.toJSON()).toBeNull();
  });

  it('does not even read an order that is not on the way or under repair', async () => {
    const r = await render({ ...order, status: 'COMPLETED' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(r.toJSON()).toBeNull();
  });

  it('offers the prefilled rebook and a new booking after a stop', async () => {
    mockGet.mockResolvedValue(result());
    const r = await render();
    expect(mockGet).toHaveBeenCalledWith('ord-1', 'bk-1', null);
    expect(text(r)).toContain('Đã dừng công việc');
    await act(async () => byId(r, 'continuation-prefill').props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('CustomerInterruptionRebook', { bookingId: 'bk-1' });
    await act(async () => byId(r, 'continuation-new-booking').props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('CustomerBookingCreate');
  });

  it('hides the prefilled rebook when the receipt is for another order', async () => {
    mockGet.mockResolvedValue(result({}, { source: { serviceOrderId: 'other', bookingId: 'bk-1' } }));
    const r = await render();
    expect(byId(r, 'continuation-prefill')).toBeUndefined();
    expect(text(r)).toContain('chưa sẵn sàng');
    expect(byId(r, 'continuation-new-booking')).toBeDefined();
  });

  it('says so and lets the customer retry when the read fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('offline'));
    const r = await render();
    expect(text(r)).toContain(CONTINUATION_READ_FAILED);
    mockGet.mockResolvedValue(result());
    await act(async () => byId(r, 'continuation-retry').props.onPress());
    expect(text(r)).toContain('Đã dừng công việc');
    expect(text(r)).not.toContain(CONTINUATION_READ_FAILED);
  });
});

describe('StoppedWorkFinanceNote', () => {
  it('says the old quote is history and nothing is owed or refunded yet', async () => {
    let r!: ReturnType<typeof create>;
    await act(async () => { r = create(<StoppedWorkFinanceNote />); });
    mounted.push(r);
    const t = text(r);
    expect(t).toContain('Báo giá cũ chỉ lưu để xem lịch sử');
    expect(t).toContain('Số tiền phải trả');
    expect(t).toContain('Chưa xác định');
  });
});
