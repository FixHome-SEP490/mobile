import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import CannotContinueScreen from './CannotContinueScreen';

const mockStop = jest.fn();
const mockReadiness = jest.fn();
const mockContact = jest.fn();
const mockUpload = jest.fn();
const mockCapture = jest.fn();
const mockSupport = jest.fn();
const mockCheckout = jest.fn();
const mockBack = jest.fn();
const mockRefresh = jest.fn();
const mockConfirm = jest.fn();
let mockOrder: Record<string, unknown>;

jest.mock('../../../api/cannot-continue.api', () => {
  const actual = jest.requireActual<typeof import('../../../api/cannot-continue.api')>('../../../api/cannot-continue.api');
  return {
    ...actual,
    cannotContinuePort: {
      isLocked: () => false, retryAllowed: () => true, pendingContact: () => null,
      stop: (...a: unknown[]) => mockStop(...a), readiness: (...a: unknown[]) => mockReadiness(...a), contact: (...a: unknown[]) => mockContact(...a),
    },
  };
});
jest.mock('../../../api/orders.api', () => ({
  ordersApi: { uploadEvidenceAdditional: (...a: unknown[]) => mockUpload(...a) },
  isHistoricalOrder: () => false,
}));
jest.mock('../../../api/support-cases.api', () => ({ supportCasesApi: { createTechnicianReport: (...a: unknown[]) => mockSupport(...a) } }));
jest.mock('../../../api/visit-groups.api', () => ({ visitGroupsApi: { getCheckout: (...a: unknown[]) => mockCheckout(...a) } }));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: (...a: unknown[]) => mockGoBack(...a), navigate: (...a: unknown[]) => mockNavigate(...a) }) }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('../navigation/resume-order', () => ({ backFromFlow: (...a: unknown[]) => mockBack(...a) }));
jest.mock('./camera-capture', () => ({ captureCameraPhoto: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('../../../utils/confirm-action', () => ({ confirmAction: (o: { onConfirm: () => void }) => { mockConfirm(o); o.onConfirm(); } }));
jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: { serviceOrderId: 'ord-1', userId: 'tech-1', role: 'technician' }, refresh: (...a: unknown[]) => mockRefresh(...a),
    snapshot: { access: 'current', order: { status: 'ready', data: mockOrder }, resources: {} },
  }),
}));
jest.mock('../shared/TaskScreenShell', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  const pass = ({ children }: { children?: unknown }) => R.createElement(R.Fragment, null, children as never);
  return {
    TaskScreenShell: ({ children, primary, summary }: { children?: unknown; summary?: unknown; primary?: { testID?: string; onPress?: () => void; label: string } }) =>
      R.createElement(R.Fragment, null, children as never, summary as never, primary ?R.createElement(Pressable, { testID: primary.testID, onPress: primary.onPress, accessibilityLabel: primary.label }) : null),
    ReadOnlyNotice: pass,
  };
});

const ready = { contactCount: 2, notificationSent: true, callsSpaced: true, nextCallAt: null, nextEligibleAt: '2026-11-23T09:00:00Z', serverNow: '2026-11-23T10:00:00Z', ready: true };
const photo = { ok: true, asset: { source: 'camera', uri: 'file:///p1.jpg', name: 'p1.jpg', type: 'image/jpeg', sizeBytes: 1000 } };
const REASON = 'Bo mạch cháy, hãng ngừng bán linh kiện';

const mounted: ReturnType<typeof create>[] = [];
const render = async () => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<CannotContinueScreen />); }); mounted.push(r); return r; };
// The screen polls the contact rule; unmount so no timer outlives the test.
afterEach(async () => { await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); }); });
const find = (r: ReturnType<typeof create>, pred: (n: ReactTestInstance) => boolean) => r.root.findAll(pred);
const byId = (r: ReturnType<typeof create>, id: string) => find(r, (n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = async (r: ReturnType<typeof create>, id: string) => act(async () => byId(r, id).props.onPress());
const typeReason = async (r: ReturnType<typeof create>, text: string) =>
  act(async () => find(r, (n) => n.props.testID === 'cc-reason-text' && typeof n.props.onChangeText === 'function')[0].props.onChangeText(text));
const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON());

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder = { id: 'ord-1', code: 'DH-1001', status: 'UNDER_REPAIR', arrivalVerified: true, completionRequestedAt: null, technician: { id: 'tech-1' }, visitGroupId: null, customerPhone: '0900000000' };
  mockStop.mockResolvedValue({ stoppedCount: 1, preservedCount: 0 });
  mockReadiness.mockResolvedValue(ready);
  mockContact.mockResolvedValue(ready);
  mockUpload.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' });
  mockSupport.mockResolvedValue(undefined);
  mockCapture.mockResolvedValue(photo);
});

describe('CannotContinueScreen', () => {
  it('is closed until the technician has checked in and the work is not handed over', async () => {
    mockOrder = { ...mockOrder, arrivalVerified: false };
    const r = await render();
    expect(text(r)).toContain('sau khi đã check-in');
    expect(find(r, (n) => n.props.testID === 'cc-reason-severe_damage').length).toBe(0);
  });

  it('stops one device with a typed reason, a description and a confirmation, photos uploaded first', async () => {
    const r = await render();
    await press(r, 'cc-reason-severe_damage');
    await typeReason(r, REASON);
    await press(r, 'cc-capture');
    await press(r, 'cc-confirm');
    await press(r, 'cc-submit');
    expect(mockUpload).toHaveBeenCalledWith('ord-1', expect.objectContaining({ uri: 'file:///p1.jpg' }));
    expect(mockStop).toHaveBeenCalledWith({ kind: 'order', orderId: 'ord-1' }, {
      reasonClass: 'non_technician_exception', reasonCode: 'severe_damage', reason: REASON, photoEvidenceIds: ['44444444-4444-4444-8444-444444444444'],
    });
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(mockRefresh).toHaveBeenCalled();
    expect(text(r)).toContain('Đã dừng công việc và nhả phân công');
  });

  it('does not send without a confirmation, and says so above the button', async () => {
    const r = await render();
    await press(r, 'cc-reason-severe_damage');
    await typeReason(r, REASON);
    await press(r, 'cc-submit');
    expect(mockStop).not.toHaveBeenCalled();
    expect(find(r, (n) => n.props.testID === 'cc-problem')[0].props.children).toBe('Cần xác nhận trước khi gửi.');
  });

  it('says what is missing when nothing is filled in', async () => {
    const r = await render();
    await press(r, 'cc-submit');
    expect(mockStop).not.toHaveBeenCalled();
    expect(find(r, (n) => n.props.testID === 'cc-problem')[0].props.children).toBe('Chọn lý do.');
  });

  it('lets the technician pick the device of a visit and opens the report in its tab', async () => {
    mockOrder = { ...mockOrder, visitGroupId: 'grp-1' };
    mockCheckout.mockResolvedValue({ devices: [
      { sequence: 1, bookingId: 'b1', serviceName: 'Máy lạnh', serviceOrderId: 'ord-1', state: 'open' },
      { sequence: 2, bookingId: 'b2', serviceName: 'Máy giặt', serviceOrderId: 'ord-2', state: 'open' },
      { sequence: 3, bookingId: 'b3', serviceName: 'Tủ lạnh', serviceOrderId: 'ord-3', state: 'succeeded' },
    ] });
    const r = await render();
    expect(text(r)).toContain('Báo cáo cho máy khác trong lượt');
    expect(find(r, (n) => n.props.testID === 'cc-device-3' && n.props.disabled === true).length).toBeGreaterThan(0);
    await press(r, 'cc-device-2');
    expect(mockNavigate).toHaveBeenCalledWith('device-ord-2', { serviceOrderId: 'ord-2', screen: 'CannotContinue', initial: false });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('names the device of a single order but offers no switch', async () => {
    const r = await render();
    expect(text(r)).toContain('Máy báo cáo');
    expect(text(r)).toContain('Đơn #DH-1001');
    expect(text(r)).not.toContain('Báo cáo cho máy khác trong lượt');
  });

  it('keeps the result on screen after the order turns into a history summary', async () => {
    mockRefresh.mockImplementation(() => { mockOrder = { ...mockOrder, arrivalVerified: false }; });
    const r = await render();
    await press(r, 'cc-reason-severe_damage');
    await typeReason(r, REASON);
    await press(r, 'cc-confirm');
    await press(r, 'cc-submit');
    await act(async () => { r.update(<CannotContinueScreen />); });
    expect(text(r)).toContain('Đã dừng công việc và nhả phân công');
    expect(text(r)).not.toContain('sau khi đã check-in');
    expect(byId(r, 'cc-back')).toBeTruthy();
  });

  it('offers no photos before the repair starts, and stops without them', async () => {
    mockOrder = { ...mockOrder, status: 'EN_ROUTE' };
    const r = await render();
    expect(find(r, (n) => n.props.testID === 'cc-capture').length).toBe(0);
    await press(r, 'cc-reason-device_too_old');
    await typeReason(r, REASON);
    await press(r, 'cc-confirm');
    await press(r, 'cc-submit');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalledWith({ kind: 'order', orderId: 'ord-1' }, expect.objectContaining({ photoEvidenceIds: [] }));
  });

  it('asks the manager for help without stopping the work', async () => {
    const r = await render();
    await press(r, 'cc-mode-support');
    await press(r, 'cc-reason-customer_cancelled');
    await typeReason(r, REASON);
    await press(r, 'cc-submit');
    expect(mockSupport).toHaveBeenCalledWith(expect.objectContaining({ intent: 'REPORT_ONLY', serviceOrderId: 'ord-1', reasonCode: 'customer_cancelled' }));
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(text(r)).toContain('Công việc vẫn tiếp tục');
  });

  it('ticks off the contact rule as it is met', async () => {
    mockReadiness.mockResolvedValue({ ...ready, ready: false, contactCount: 1, notificationSent: false, callsSpaced: false, nextEligibleAt: '2026-11-23T11:00:00Z' });
    const r = await render();
    await press(r, 'cc-reason-customer_absent');
    expect(text(r)).toContain('Gọi khách ít nhất 2 lần');
    expect(text(r)).toContain('1 cuộc gọi đã ghi nhận');
    expect(text(r)).toContain('Có thể dừng sau');
  });

  it('groups the reasons by what they are about', async () => {
    const r = await render();
    expect(text(r)).toContain('Về công việc');
    expect(text(r)).toContain('Về khách hàng');
  });

  it('keeps a customer who is absent from stopping until the contact rule is met', async () => {
    mockReadiness.mockResolvedValue({ ...ready, ready: false, contactCount: 1 });
    const r = await render();
    await press(r, 'cc-reason-customer_absent');
    await typeReason(r, REASON);
    await press(r, 'cc-confirm');
    await press(r, 'cc-submit');
    expect(mockStop).not.toHaveBeenCalled();
    expect(text(r)).toContain('Chưa đủ điều kiện liên hệ');
    mockReadiness.mockResolvedValue(ready);
    await press(r, 'cc-recheck');
    await press(r, 'cc-submit');
    expect(mockStop).toHaveBeenCalledWith({ kind: 'order', orderId: 'ord-1' }, expect.objectContaining({ reasonCode: 'customer_absent' }));
  });

  it('stops the whole visit for an absent customer and lists what is kept', async () => {
    mockOrder = { ...mockOrder, visitGroupId: 'grp-1' };
    mockCheckout.mockResolvedValue({ devices: [
      { bookingId: 'b1', serviceName: 'Máy lạnh', serviceOrderId: 'ord-1', state: 'open' },
      { bookingId: 'b2', serviceName: 'Máy giặt', serviceOrderId: 'ord-2', state: 'succeeded' },
    ] });
    mockStop.mockResolvedValue({ stoppedCount: 1, preservedCount: 1 });
    const r = await render();
    await press(r, 'cc-reason-customer_unreachable');
    await typeReason(r, REASON);
    expect(text(r)).toContain('Giữ nguyên kết quả');
    await press(r, 'cc-confirm');
    await press(r, 'cc-submit');
    expect(mockStop).toHaveBeenCalledWith({ kind: 'group', groupId: 'grp-1', orderId: 'ord-1' }, expect.objectContaining({ reasonCode: 'customer_unreachable' }));
    expect(text(r)).toContain('Đã dừng 1 máy, giữ nguyên 1 máy');
  });

  it('shows the server wording when the stop is refused', async () => {
    const { CannotContinueError } = jest.requireActual<typeof import('../../../api/cannot-continue.api')>('../../../api/cannot-continue.api');
    mockStop.mockRejectedValue(new CannotContinueError(true, false, 'Trạng thái máy hoặc phân công đã thay đổi.'));
    const r = await render();
    await press(r, 'cc-reason-severe_damage');
    await typeReason(r, REASON);
    await press(r, 'cc-confirm');
    await press(r, 'cc-submit');
    expect(text(r)).toContain('Trạng thái máy hoặc phân công đã thay đổi.');
    expect(text(r)).not.toContain('cc-done');
  });
});
