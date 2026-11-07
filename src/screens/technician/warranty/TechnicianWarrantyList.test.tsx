import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { TechnicianWarrantyList } from './TechnicianWarrantyList';
import { WarrantyInvitations } from './WarrantyInvitations';
import { technicianWarrantyApi } from '../../../api/technician-warranty.api';
import { useBadgeStore } from '../../../store/badge.store';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../../hooks/useLiveRefresh', () => ({ useLiveRefresh: jest.fn() }));
jest.mock('../../../api/technician-warranty.api', () => ({ technicianWarrantyApi: { listMine: jest.fn() } }));
const listMine = technicianWarrantyApi.listMine as unknown as jest.Mock;

const claim = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, status, submittedAt: '2026-11-05T08:00:00.000Z', submittedAfterExpiry: false, customerResponse: null, description: 'Máy lại lỗi như cũ', visit: null,
  coverage: { id: 'c', itemDescription: 'Tụ khởi động', expiresAt: '2026-12-05T00:00:00.000Z' },
  order: { id: 'o', code: `FH-${id}`, serviceName: 'Sửa máy giặt', addressSummary: '12 Lê Lợi', customerName: 'Khách A', customerPhone: '0911222333' }, ...extra,
}) as any;
const page = (rows: unknown[]) => ({ data: rows, meta: { page: 1, pageSize: 20, total: rows.length } });
const mount = async (element: React.ReactElement) => { let r!: ReturnType<typeof create>; await act(async () => { r = create(element); }); return r; };
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map(t => String(Array.isArray(t.props.children) ? t.props.children.join('') : t.props.children));
const pressByTestId = async (r: ReturnType<typeof create>, id: string) => { const node = r.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0]; await act(async () => { await node.props.onPress(); }); };

beforeEach(() => { listMine.mockReset(); mockNavigate.mockReset(); useBadgeStore.setState({ pendingWarranty: 0 }); });

describe('TechnicianWarrantyList', () => {
  it('lists the claims with what, who, where and what the customer said, and the next step', async () => {
    listMine.mockResolvedValue(page([claim('a', 'submitted'), claim('b', 'resolved')]));
    const r = await mount(<TechnicianWarrantyList />);
    const all = texts(r).join('|');
    expect(all).toContain('#FH-a');
    expect(all).toContain('Chờ bạn nhận');
    expect(all).toContain('Sửa máy giặt');
    expect(all).toContain('Khách A');
    expect(all).toContain('Khách mô tả');
    expect(all).toContain('Nhận yêu cầu');
    expect(all).toContain('Xem chi tiết');
    expect(listMine).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('filters into the three groups with their counts, and opens a claim on a tap', async () => {
    listMine.mockResolvedValue(page([claim('a', 'submitted'), claim('b', 'inspected'), claim('c', 'resolved'), claim('d', 'accepted')]));
    const r = await mount(<TechnicianWarrantyList />);
    const labels = r.root.findAll(n => n.type === TouchableOpacity && n.props.accessibilityRole === 'radio').map(n => n.props.accessibilityLabel);
    expect(labels).toEqual(['Tất cả, 4', 'Cần xử lý, 2', 'Đang chờ phản hồi, 1', 'Đã đóng, 1']);

    await pressByTestId(r, 'warranty-filter-closed');
    expect(texts(r).join('|')).toContain('#FH-c');
    expect(texts(r).join('|')).not.toContain('#FH-a');

    await pressByTestId(r, 'warranty-filter-todo');
    await pressByTestId(r, 'warranty-claim-a');
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianWarrantyTask', { claimId: 'a' });
  });

  it('searches by order code and says so when nothing matches, and shows an empty and an error state', async () => {
    listMine.mockResolvedValue(page([claim('a', 'submitted')]));
    const found = await mount(<TechnicianWarrantyList search="zzz" />);
    expect(texts(found).join('|')).toContain('Không có yêu cầu bảo hành ở mục này');

    listMine.mockResolvedValue(page([]));
    const empty = await mount(<TechnicianWarrantyList />);
    expect(texts(empty).join('|')).toContain('Chưa có yêu cầu bảo hành');

    listMine.mockRejectedValue(new Error('network'));
    const failed = await mount(<TechnicianWarrantyList />);
    expect(texts(failed).join('|')).toContain('Không thể tải danh sách bảo hành');
  });
});

describe('WarrantyInvitations', () => {
  it('shows the claims waiting for the technician at the top of the invitations, opens them, and feeds the tab badge', async () => {
    listMine.mockResolvedValue(page([claim('a', 'submitted'), claim('b', 'submitted')]));
    const r = await mount(<WarrantyInvitations />);
    const all = texts(r).join('|');
    expect(all).toContain('Lời mời bảo hành (2)');
    expect(all).toContain('Nhận yêu cầu');
    expect(all).toContain('Không nhận được');
    expect(listMine).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: 'submitted' });
    expect(useBadgeStore.getState().pendingWarranty).toBe(2);

    const accept = r.root.findAll(n => n.props.accessibilityLabel === 'Nhận yêu cầu bảo hành #FH-a' && typeof n.props.onPress === 'function')[0];
    act(() => accept.props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianWarrantyTask', { claimId: 'a' });
  });

  it('draws nothing when no claim waits', async () => {
    listMine.mockResolvedValue(page([]));
    const r = await mount(<WarrantyInvitations />);
    expect(r.toJSON()).toBeNull();
    expect(useBadgeStore.getState().pendingWarranty).toBe(0);
  });
});
