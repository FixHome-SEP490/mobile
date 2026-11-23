import {
  canAttachStopPhotos, confirmText, deviceDisposition, reasonClassOf, reasonsFor, stopFormProblem, stopScopeFor, submitLabel,
} from './cannot-continue-form';
import type { ContactReadiness, StopScope } from '../../../api/cannot-continue.api';

const ready: ContactReadiness = { contactCount: 2, notificationSent: true, callsSpaced: true, nextCallAt: null, nextEligibleAt: null, serverNow: '2026-11-23T10:00:00Z', ready: true };
const order: StopScope = { kind: 'order', orderId: 'o' };
const group: StopScope = { kind: 'group', groupId: 'g', orderId: 'o' };
const base = { mode: 'stop' as const, code: 'severe_damage' as const, reason: 'Bo mạch cháy, không thay được', confirmed: true, scope: order, readiness: null, devicesKnown: true };

describe('reasonsFor', () => {
  it('keeps "khách đề nghị hủy" to support only and "không liên lạc được" to stop only', () => {
    expect(reasonsFor('stop', false).map((r) => r.code)).not.toContain('customer_cancelled');
    expect(reasonsFor('stop', false).map((r) => r.code)).toContain('customer_unreachable');
    expect(reasonsFor('support', false).map((r) => r.code)).toContain('customer_cancelled');
    expect(reasonsFor('support', false).map((r) => r.code)).not.toContain('customer_unreachable');
  });
  it('says "cả lượt" on the no-show reasons only for a visit', () => {
    expect(reasonsFor('stop', true).find((r) => r.code === 'customer_absent')?.label).toBe('Khách không có mặt · cả lượt');
    expect(reasonsFor('stop', false).find((r) => r.code === 'customer_absent')?.label).toBe('Khách không có mặt');
    expect(reasonsFor('stop', true).find((r) => r.code === 'severe_damage')?.label).toBe('Thiết bị hư hỏng nặng');
  });
});

describe('scope and class', () => {
  it('stops the whole visit only for a no-show on an order of a visit', () => {
    expect(stopScopeFor({ id: 'o', visitGroupId: 'g' }, 'customer_absent')).toEqual(group);
    expect(stopScopeFor({ id: 'o', visitGroupId: 'g' }, 'severe_damage')).toEqual(order);
    expect(stopScopeFor({ id: 'o', visitGroupId: null }, 'customer_unreachable')).toEqual(order);
  });
  it('maps skill gap to the technician class', () => {
    expect(reasonClassOf('skill_gap')).toBe('technician_skill_gap');
    expect(reasonClassOf('device_too_old')).toBe('non_technician_exception');
  });
  it('takes photos only while under repair', () => {
    expect(canAttachStopPhotos('UNDER_REPAIR')).toBe(true);
    expect(canAttachStopPhotos('EN_ROUTE')).toBe(false);
  });
});

describe('stopFormProblem', () => {
  it('needs a reason, a description and, to stop, a confirmation', () => {
    expect(stopFormProblem({ ...base, code: null })).toBe('Chọn lý do.');
    expect(stopFormProblem({ ...base, reason: 'ngắn' })).toContain('10');
    expect(stopFormProblem({ ...base, confirmed: false })).toContain('xác nhận');
    expect(stopFormProblem(base)).toBeNull();
  });
  it('support needs no confirmation or contact', () => {
    expect(stopFormProblem({ ...base, mode: 'support', code: 'customer_absent', confirmed: false })).toBeNull();
  });
  it('a no-show needs the contact rule met, and a visit also needs its devices read', () => {
    expect(stopFormProblem({ ...base, code: 'customer_absent' })).toContain('liên hệ');
    expect(stopFormProblem({ ...base, code: 'customer_absent', readiness: { ...ready, ready: false } })).toContain('liên hệ');
    expect(stopFormProblem({ ...base, code: 'customer_absent', readiness: ready })).toBeNull();
    expect(stopFormProblem({ ...base, code: 'customer_unreachable', scope: group, readiness: ready, devicesKnown: false })).toContain('máy trong lượt');
  });
});

describe('labels', () => {
  it('names the action by mode and scope', () => {
    expect(submitLabel('stop', order, false, false)).toBe('Xác nhận không thể tiếp tục');
    expect(submitLabel('stop', group, false, false)).toBe('Xác nhận dừng cả lượt');
    expect(submitLabel('support', order, false, false)).toBe('Gửi báo cáo hỗ trợ');
    expect(submitLabel('stop', order, false, true)).toBe('Thử lại cùng nội dung');
    expect(submitLabel('stop', order, true, false)).toBe('Đang gửi…');
    expect(confirmText('stop', group)).toContain('cả lượt');
  });
  it('only an open device, or this one, is expected to stop', () => {
    expect(deviceDisposition('open', false)).toBe('Dự kiến dừng');
    expect(deviceDisposition('succeeded', false)).toBe('Giữ nguyên kết quả');
    expect(deviceDisposition(undefined, false)).toBe('Chưa xác minh trạng thái');
  });
});
