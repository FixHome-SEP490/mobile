import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import DelayReportScreen from './DelayReportScreen';
import { forgetReleasableOrders } from './useReleasableOrders';

const mockJobs = jest.fn();
const mockStatus = jest.fn();
const mockNotice = jest.fn();
const mockUpload = jest.fn();
const mockCapture = jest.fn();
const mockBack = jest.fn();
let mockOrder: Record<string, unknown>;

jest.mock('../../../api/orders.api', () => ({
  ordersApi: {
    getTechnicianJobs: (...a: unknown[]) => mockJobs(...a),
    overrunReleaseStatus: (...a: unknown[]) => mockStatus(...a),
    sendDelayNotice: (...a: unknown[]) => mockNotice(...a),
    uploadEvidenceAdditional: (...a: unknown[]) => mockUpload(...a),
  },
  isHistoricalOrder: () => false,
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('../navigation/resume-order', () => ({ backFromFlow: (...a: unknown[]) => mockBack(...a) }));
jest.mock('./camera-capture', () => ({ captureCameraPhoto: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({ key: { serviceOrderId: 'cur', userId: 'tech-1', role: 'technician' }, loadResource: jest.fn(),
    snapshot: { access: 'current', order: { status: 'ready', data: mockOrder },
      resources: { evidence: { status: 'ready', data: [{ id: 'ev-srv', mediaUrl: 'https://img.test/srv.jpg' }] } } } }),
}));
jest.mock('../shared/TaskScreenShell', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  const pass = ({ children }: { children?: unknown }) => R.createElement(R.Fragment, null, children as never);
  return {
    TaskScreenShell: ({ children, primary }: { children?: unknown; primary?: { testID?: string; onPress?: () => void; label: string } }) =>
      R.createElement(R.Fragment, null, children as never, primary ? R.createElement(Pressable, { testID: primary.testID, onPress: primary.onPress, accessibilityLabel: primary.label }) : null),
    ReadOnlyNotice: pass,
  };
});

const next = { id: 'o-2', code: 'SO-2', status: 'ACCEPTED', scheduledAt: '2026-10-31T08:00:00.000Z', addressSummary: '12 Lê Lợi' };
const statusFor = (currentOrderId: string | null, delayNotice: object | null = null) =>
  ({ eligible: true, block: null, currentOrderCode: 'SO-CUR', currentOrderId, currentOrderStatus: 'UNDER_REPAIR', windowMinutes: 180, delayNotice });
const photo = (n: number) => ({ ok: true, asset: { source: 'camera', uri: `file:///p${n}.jpg`, name: `p${n}.jpg`, type: 'image/jpeg', sizeBytes: 1000 } });
const reasonText = 'Phát sinh lỗi thêm cần thay linh kiện';

const render = async () => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<DelayReportScreen />); }); return r; };
const find = (r: ReturnType<typeof create>, pred: (n: ReactTestInstance) => boolean) => r.root.findAll(pred);
const byId = (r: ReturnType<typeof create>, id: string) => find(r, (n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = async (r: ReturnType<typeof create>, id: string) => act(async () => byId(r, id).props.onPress());
const type = async (r: ReturnType<typeof create>, text: string) =>
  act(async () => find(r, (n) => n.props.testID === 'delay-reason-text' && typeof n.props.onChangeText === 'function')[0].props.onChangeText(text));
const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON());
async function fill(r: ReturnType<typeof create>, { photos = 1, minutes = true, confirm = true } = {}) {
  await press(r, 'delay-reason-new_fault_found');
  await type(r, `  ${reasonText}  `);
  for (let i = 1; i <= photos; i += 1) { mockCapture.mockResolvedValueOnce(photo(i)); await press(r, 'delay-capture'); }
  if (minutes) await press(r, 'delay-minutes-60');
  if (confirm) await press(r, 'delay-confirm');
}

beforeEach(() => {
  forgetReleasableOrders();
  jest.clearAllMocks();
  mockOrder = { id: 'cur', code: 'SO-CUR', status: 'UNDER_REPAIR', technician: { id: 'tech-1' }, completionRequestedAt: null };
  mockJobs.mockResolvedValue([next, { ...next, id: 'o-3', code: 'SO-3' }]);
  mockStatus.mockImplementation(async (id: string) => statusFor(id === 'o-2' ? 'cur' : 'another-job'));
  mockUpload.mockImplementation(async () => ({ id: `ev-${mockUpload.mock.calls.length}` }));
  mockNotice.mockResolvedValue({});
});

it('offers only the upcoming orders Backend ties to this job, and no way to release one', async () => {
  const r = await render();
  expect(mockJobs).toHaveBeenCalledWith({ excludeVisitGroups: true, statuses: ['accepted', 'en_route'] });
  expect(byId(r, 'delay-order-o-2')).toBeDefined();
  expect(find(r, (n) => n.props.testID === 'delay-order-o-3')).toHaveLength(0);
  expect(text(r)).not.toMatch(/Nhả đơn/);
});

it('says so when there is nothing to report, and when the job is not under repair any more', async () => {
  mockStatus.mockResolvedValue({ ...statusFor('cur'), eligible: false, block: 'NO_CURRENT_JOB' });
  expect(text(await render())).toContain('Chưa có đơn kế tiếp nào cần báo trễ');
  mockOrder = { ...mockOrder, completionRequestedAt: '2026-10-31T03:00:00Z' };
  const r = await render();
  expect(text(r)).toContain('Chỉ báo trễ được khi đơn bạn đang làm còn đang sửa');
  expect(find(r, (n) => n.props.testID === 'delay-send-notice')).toHaveLength(0);
});

it('shows no error until the first send, then one message next to each missing field and sends nothing', async () => {
  const r = await render();
  expect(find(r, (n) => n.props.accessibilityRole === 'alert')).toHaveLength(0);
  await press(r, 'delay-send-notice');
  const messages = find(r, (n) => n.props.accessibilityRole === 'alert').map((n) => n.props.children);
  expect(messages).toEqual(expect.arrayContaining(['Chọn nhóm lý do.', 'Chọn số phút trễ dự kiến.', 'Hãy xác nhận thông tin là thật.']));
  expect(text(r)).toContain('Chụp ít nhất 1 ảnh');
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockNotice).not.toHaveBeenCalled();
});

it('takes at most three photos and lets the technician drop one', async () => {
  const r = await render();
  await fill(r, { photos: 3 });
  expect(find(r, (n) => n.props.testID === 'delay-capture')).toHaveLength(0);
  await press(r, 'delay-drop-photo-1');
  expect(byId(r, 'delay-capture')).toBeDefined();
  expect(text(r)).toContain('2/3');
});

it('uploads the photos to THIS job as ADDITIONAL evidence, sends the notice, then shows the report it sent instead of the form', async () => {
  const r = await render();
  await fill(r, { photos: 2 });
  await press(r, 'delay-send-notice');
  expect(mockUpload).toHaveBeenNthCalledWith(1, 'cur', { uri: 'file:///p1.jpg', name: 'p1.jpg', type: 'image/jpeg' });
  expect(mockNotice).toHaveBeenCalledWith('o-2', { reasonCode: 'new_fault_found', reason: reasonText, evidenceIds: ['ev-1', 'ev-2'], confirm: true, delayMinutes: 60 });
  expect(find(r, (n) => n.props.testID === 'delay-summary').length).toBeGreaterThan(0);
  expect(find(r, (n) => n.props.testID === 'delay-send-notice')).toHaveLength(0);
  const shownText = text(r);
  expect(shownText).toContain('Đã báo trễ, chờ khách trả lời');
  expect(shownText).toContain('60 phút');
  expect(shownText).toContain('Phát sinh lỗi thêm');
  expect(shownText).toContain(reasonText);
  expect(find(r, (n) => n.props.source?.uri === 'file:///p1.jpg').length).toBeGreaterThan(0);
  await press(r, 'delay-back');
  expect(mockBack).toHaveBeenCalled();
});

it('a retry after a failed send does not upload the photo again, and the message says what went wrong', async () => {
  mockNotice.mockRejectedValueOnce(new Error('offline'));
  const r = await render();
  await fill(r);
  await press(r, 'delay-send-notice');
  expect(text(r)).toContain('Chưa gửi được báo trễ');
  await press(r, 'delay-send-notice');
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockNotice).toHaveBeenCalledTimes(2);
});

const sentBefore = (decision: string | null) => ({ minutes: 90, noticedAt: '2026-10-31T03:00:00Z', decision, reasonCode: 'waiting_parts', reason: 'Chờ bo mạch về từ kho', evidenceIds: ['ev-srv', 'ev-gone'] });

it('opens on the report already sent for the order, read back from Backend, not on an empty form', async () => {
  mockStatus.mockImplementation(async (id: string) => statusFor(id === 'o-2' ? 'cur' : 'x', sentBefore(null)));
  const r = await render();
  const shownText = text(r);
  expect(find(r, (n) => n.props.testID === 'delay-summary').length).toBeGreaterThan(0);
  expect(find(r, (n) => n.props.testID === 'delay-send-notice')).toHaveLength(0);
  expect(shownText).toContain('Đã báo trễ, chờ khách trả lời');
  expect(shownText).toContain('90 phút');
  expect(shownText).toContain('Chờ linh kiện');
  expect(shownText).toContain('Chờ bo mạch về từ kho');
  expect(shownText).toContain('Ảnh bằng chứng (1)'); // only the photo Backend's evidence list still has
  expect(find(r, (n) => n.props.source?.uri === 'https://img.test/srv.jpg').length).toBeGreaterThan(0);
});

it('tells the technician when the customer agreed to wait, and offers no re-report then', async () => {
  mockStatus.mockImplementation(async (id: string) => statusFor(id === 'o-2' ? 'cur' : 'x', sentBefore('wait')));
  const r = await render();
  expect(text(r)).toContain('Khách đồng ý đợi thêm');
  expect(find(r, (n) => n.props.testID === 'delay-edit')).toHaveLength(0);
});

it('lets the technician report again with new information, and go back to the report they sent', async () => {
  mockStatus.mockImplementation(async (id: string) => statusFor(id === 'o-2' ? 'cur' : 'x', sentBefore(null)));
  const r = await render();
  await press(r, 'delay-edit');
  expect(byId(r, 'delay-send-notice')).toBeDefined();
  await press(r, 'delay-keep');
  expect(find(r, (n) => n.props.testID === 'delay-summary').length).toBeGreaterThan(0);
});
