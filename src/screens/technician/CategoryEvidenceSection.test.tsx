import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CategoryEvidenceSection from './CategoryEvidenceSection';
import { sendCategoryEvidence } from './skill-evidence';
import { technicianProfileApi } from '../../api/technician-profile.api';

jest.mock('../../api/technician-profile.api', () => ({
  ...jest.requireActual('../../api/technician-profile.api'),
  technicianProfileApi: {
    getMySkillEvidence: jest.fn(async () => []),
    getSkillEvidenceAccess: jest.fn(async () => 'https://signed.example/photo.jpg'),
    deleteSkillEvidence: jest.fn(async () => undefined),
  },
}));
jest.mock('./skill-evidence', () => ({
  ...jest.requireActual('./skill-evidence'),
  sendCategoryEvidence: jest.fn(async () => 2),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///cert.jpg', mimeType: 'image/jpeg', fileName: 'cert.jpg', fileSize: 120000 }],
  })),
}));

const categories = [{ id: 'c-ac', name: 'Điều hòa' }, { id: 'c-fr', name: 'Tủ lạnh' }, { id: 'c-el', name: 'Điện dân dụng' }];

// Pressable renders a composite and a host node with the same testID; the first match is the one with the handlers.
const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID })[0];
// The delete button lives in the paper's detail: tap the card first.
const openDetail = (tree: ReactTestRenderer, id: string) => act(() => byId(tree, `category-evidence-sent-${id}`).props.onPress());
const hasDelete = (tree: ReactTestRenderer) => tree.root.findAllByProps({ testID: 'evidence-detail-delete' }).length > 0;
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

async function openForm(props: Partial<React.ComponentProps<typeof CategoryEvidenceSection>> = {}) {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<CategoryEvidenceSection staged={[]} categories={categories} onChange={onChange} {...props} />); });
  await act(async () => { await byId(tree, 'category-evidence-add').props.onPress(); });
  act(() => byId(tree, 'category-evidence-type-national_skill_certificate').props.onPress());
  return { tree, onChange };
}

describe('CategoryEvidenceSection', () => {
  it('starts with no group ticked, so the technician says which groups the paper proves', async () => {
    const { tree, onChange } = await openForm();
    for (const c of categories) expect(byId(tree, `category-evidence-group-${c.id}`).props.accessibilityState).toEqual({ checked: false });
    act(() => byId(tree, 'category-evidence-confirm').props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Chọn ít nhất một nhóm cho giấy tờ này.');
    act(() => tree.unmount());
  });

  it('keeps only the ticked groups on the paper', async () => {
    const { tree, onChange } = await openForm();
    act(() => byId(tree, 'category-evidence-group-c-ac').props.onPress());
    act(() => byId(tree, 'category-evidence-group-c-fr').props.onPress());
    act(() => byId(tree, 'category-evidence-confirm').props.onPress());
    expect(onChange.mock.calls[0][0][0].categoryIds).toEqual(['c-ac', 'c-fr']);
    act(() => tree.unmount());
  });

  it('does not add a paper that covers no group', async () => {
    const { tree, onChange } = await openForm();
    act(() => byId(tree, 'category-evidence-confirm').props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Chọn ít nhất một nhóm cho giấy tờ này.');
    act(() => tree.unmount());
  });

  it('names the groups a waiting paper covers, and skips the choice when there is one group only', async () => {
    const staged = [{ key: 'k', asset: { uri: 'file:///a.jpg', fileName: 'a.jpg' }, details: { evidenceType: 'national_skill_certificate' as const }, categoryIds: ['c-ac', 'c-fr'] }];
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<CategoryEvidenceSection staged={staged} categories={categories} onChange={jest.fn()} />); });
    expect(texts(tree)).toContain('Áp dụng cho: Điều hòa, Tủ lạnh');
    act(() => tree.unmount());

    const single = await openForm({ categories: [categories[0]] });
    expect(single.tree.root.findAllByProps({ testID: 'category-evidence-group-c-ac' })).toHaveLength(0);
    act(() => byId(single.tree, 'category-evidence-confirm').props.onPress());
    expect(single.onChange.mock.calls[0][0][0].categoryIds).toEqual(['c-ac']);
    act(() => single.tree.unmount());
  });

  it('shows the picked photo large in the form and as a thumbnail once the paper is added', async () => {
    const { tree, onChange } = await openForm();
    expect(tree.root.findAllByProps({ testID: 'evidence-photo-stage' }).length).toBeGreaterThan(0);
    act(() => byId(tree, 'category-evidence-group-c-ac').props.onPress());
    act(() => byId(tree, 'category-evidence-confirm').props.onPress());
    const added = onChange.mock.calls[0][0];
    act(() => tree.update(<CategoryEvidenceSection staged={added} categories={categories} onChange={onChange} />));
    expect(tree.root.findAllByProps({ testID: 'evidence-photo-thumb' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('lists the papers already sent, with the groups each covers, when the technician comes back', async () => {
    const { technicianProfileApi } = jest.requireMock('../../api/technician-profile.api');
    technicianProfileApi.getMySkillEvidence.mockResolvedValueOnce([
      { documentId: 'd1', serviceId: 's1', fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'social_insurance', issuer: 'BHXH', referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: 5, categories: [{ id: 'c-ac', name: 'Điều hòa' }, { id: 'c-fr', name: 'Tủ lạnh' }] },
    ]);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CategoryEvidenceSection staged={[]} categories={categories} onChange={jest.fn()} />); });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Giấy tờ đã nộp (1)', 'Sổ bảo hiểm xã hội', 'BHXH', 'Điều hòa', 'Tủ lạnh']));
    expect(technicianProfileApi.getSkillEvidenceAccess).toHaveBeenCalledWith('s1', 'd1');
    expect(tree.root.findAllByProps({ testID: 'evidence-photo-thumb' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('refuses a second copy of a paper (same type, same number) for groups it already covers, but not for a new group', async () => {
    const { technicianProfileApi } = jest.requireMock('../../api/technician-profile.api');
    technicianProfileApi.getMySkillEvidence.mockResolvedValueOnce([
      { documentId: 'd1', serviceId: 's1', fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'national_skill_certificate', issuer: null, referenceNumber: 'AB-123', issuedAt: null, expiresAt: null, claimedYears: null, categories: [{ id: 'c-ac', name: 'Điều hòa' }] },
    ]);
    const onSent = jest.fn();
    (sendCategoryEvidence as jest.Mock).mockClear();
    const { tree } = await openForm({ sendNow: true, onSent });
    const number = tree.root.findAllByProps({ accessibilityLabel: 'Số hiệu' })[0];
    act(() => number.props.onChangeText(' ab-123 '));
    act(() => byId(tree, 'category-evidence-group-c-ac').props.onPress());
    await act(async () => { await byId(tree, 'category-evidence-confirm').props.onPress(); });
    expect(texts(tree).join(' ')).toContain('Bạn đã nộp giấy tờ này cho các nhóm đã chọn');
    expect(sendCategoryEvidence).not.toHaveBeenCalled();
    // Add a group it does not cover yet: allowed (the server skips the group that has it).
    act(() => byId(tree, 'category-evidence-group-c-fr').props.onPress());
    await act(async () => { await byId(tree, 'category-evidence-confirm').props.onPress(); });
    expect(sendCategoryEvidence).toHaveBeenCalledWith(['c-ac', 'c-fr'], expect.anything(), expect.objectContaining({ referenceNumber: 'ab-123' }));
    act(() => tree.unmount());
  });

  it('shows only a few paper types and groups first, with a button for the rest', async () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: 'Nhóm ' + id }));
    const { tree } = await openForm({ categories: many });
    const has = (id: string) => tree.root.findAllByProps({ testID: id }).length > 0;
    expect(has('category-evidence-type-other')).toBe(false);
    expect(has('category-evidence-group-d')).toBe(true);
    expect(has('category-evidence-group-e')).toBe(false);
    expect(texts(tree)).toContain('Xem đầy đủ (8)');
    expect(texts(tree)).toContain('Xem đủ 6 nhóm');
    act(() => byId(tree, 'category-evidence-type-more').props.onPress());
    act(() => byId(tree, 'category-evidence-groups-more').props.onPress());
    expect(has('category-evidence-type-other')).toBe(true);
    expect(has('category-evidence-group-f')).toBe(true);
    act(() => tree.unmount());
  });
});

describe('CategoryEvidenceSection: a paper already sent can be changed or removed', () => {
  const sentItem = { documentId: 'd1', serviceId: 's1', fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'social_insurance', issuer: 'BHXH', referenceNumber: null, issuedAt: '2021-12-22', expiresAt: null, claimedYears: 5, categories: [{ id: 'c-ac', name: 'Điều hòa' }, { id: 'c-fr', name: 'Tủ lạnh' }] };
  const api = () => jest.requireMock('../../api/technician-profile.api').technicianProfileApi;

  async function mountSent() {
    api().getMySkillEvidence.mockResolvedValue([sentItem]);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CategoryEvidenceSection staged={[]} categories={categories} onChange={jest.fn()} />); });
    return tree;
  }

  it('only offers to view and delete a paper already sent: no edit, no change of photo', async () => {
    const tree = await mountSent();
    openDetail(tree, 'd1');
    expect(hasDelete(tree)).toBe(true);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Nơi cấp', 'BHXH', 'Ngày cấp', '22/12/2021', 'Kinh nghiệm', '5 năm', 'Áp dụng cho']));
    expect(tree.root.findAllByProps({ testID: 'category-evidence-edit-d1' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'category-evidence-replace-photo' })).toHaveLength(0);
    expect(texts(tree)).not.toContain('Sửa');
    act(() => tree.unmount());
  });

  it('removes it after a confirmation, then reads the papers again', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const tree = await mountSent();
    const before = api().getMySkillEvidence.mock.calls.length;
    openDetail(tree, 'd1');
    act(() => byId(tree, 'evidence-detail-delete').props.onPress());
    expect(alert).toHaveBeenCalledWith('Xóa giấy tờ này?', expect.stringContaining('tất cả nhóm'), expect.any(Array));
    expect(api().deleteSkillEvidence).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => { buttons.find((b) => b.text === 'Xóa')!.onPress!(); });
    expect(api().deleteSkillEvidence).toHaveBeenCalledWith('d1');
    expect(api().getMySkillEvidence.mock.calls.length).toBe(before + 1);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('after approval sends a new paper as soon as it is confirmed, to the ticked groups only', async () => {
    const onSent = jest.fn();
    const { tree, onChange } = await openForm({ sendNow: true, onSent });
    expect(texts(tree)).toContain('Gửi giấy tờ');
    act(() => byId(tree, 'category-evidence-group-c-fr').props.onPress());
    await act(async () => { await byId(tree, 'category-evidence-confirm').props.onPress(); });
    expect(sendCategoryEvidence).toHaveBeenCalledWith(['c-fr'], expect.objectContaining({ uri: 'file:///cert.jpg' }), expect.objectContaining({ evidenceType: 'national_skill_certificate' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onSent).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('keeps the form and shows the reason when sending fails, and offers no paper when no group needs one', async () => {
    (sendCategoryEvidence as jest.Mock).mockRejectedValueOnce(new Error('Không có kỹ năng nào cần giấy tờ.'));
    const { tree } = await openForm({ sendNow: true });
    act(() => byId(tree, 'category-evidence-group-c-ac').props.onPress());
    await act(async () => { await byId(tree, 'category-evidence-confirm').props.onPress(); });
    expect(texts(tree).join(' ')).toContain('Không có kỹ năng nào cần giấy tờ.');
    expect(byId(tree, 'category-evidence-form')).toBeDefined();
    act(() => tree.unmount());

    let none!: ReactTestRenderer;
    act(() => { none = create(<CategoryEvidenceSection staged={[]} categories={[]} onChange={jest.fn()} sendNow />); });
    expect(none.root.findAllByProps({ testID: 'category-evidence-add' })).toHaveLength(0);
    act(() => none.unmount());
  });

  it('locks a paper the server says was used to approve a skill: no edit, no delete', async () => {
    const api = technicianProfileApi as unknown as { getMySkillEvidence: jest.Mock };
    api.getMySkillEvidence.mockResolvedValueOnce([
      { documentId: 'd-open', serviceId: 's1', fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'social_insurance', issuer: null, referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: null, editable: true, categories: [{ id: 'c-ac', name: 'Điều hòa' }] },
      { documentId: 'd-locked', serviceId: 's2', fileName: 'b.jpg', mimeType: 'image/jpeg', evidenceType: 'social_insurance', issuer: null, referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: null, editable: false, categories: [{ id: 'c-fr', name: 'Tủ lạnh' }] },
    ]);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CategoryEvidenceSection staged={[]} categories={categories} onChange={jest.fn()} />); });
    openDetail(tree, 'd-open');
    expect(hasDelete(tree)).toBe(true);
    act(() => byId(tree, 'evidence-detail-close').props.onPress());
    openDetail(tree, 'd-locked');
    expect(hasDelete(tree)).toBe(false);
    act(() => byId(tree, 'evidence-detail-close').props.onPress());
    expect(texts(tree)).toContain('Đã dùng để duyệt');
    expect(tree.root.findAllByProps({ testID: 'category-evidence-locked-d-locked' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('badges each paper by status: a rejected one stays editable with its reason, a paper in review is locked', async () => {
    const api = technicianProfileApi as unknown as { getMySkillEvidence: jest.Mock };
    const base = { serviceId: 's1', fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'social_insurance', issuer: null, referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: null, categories: [{ id: 'c-ac', name: 'Điều hòa' }] };
    api.getMySkillEvidence.mockResolvedValueOnce([
      { ...base, documentId: 'd-rej', status: 'rejected', editable: true, rejectionReason: 'Ảnh mờ' },
      { ...base, documentId: 'd-rev', status: 'in_review', editable: false },
    ]);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CategoryEvidenceSection staged={[]} categories={categories} onChange={jest.fn()} />); });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Kỹ năng bị từ chối', 'Đang xét duyệt']));
    expect(texts(tree).join(' ')).toContain('Lý do từ chối: Ảnh mờ');
    openDetail(tree, 'd-rej');
    expect(hasDelete(tree)).toBe(true);
    act(() => byId(tree, 'evidence-detail-close').props.onPress());
    openDetail(tree, 'd-rev');
    expect(hasDelete(tree)).toBe(false);
    act(() => tree.unmount());
  });

  it('groups the papers by status on the papers page, the ones to fix first', async () => {
    const base = { serviceId: 's1', fileName: 'a.jpg', mimeType: 'application/pdf', evidenceType: 'social_insurance', issuer: null, referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: null, categories: [{ id: 'c-ac', name: 'Điều hòa' }] };
    (technicianProfileApi as unknown as { getMySkillEvidence: jest.Mock }).getMySkillEvidence.mockResolvedValueOnce([
      { ...base, documentId: 'd-ok', status: 'approved', editable: false },
      { ...base, documentId: 'd-wait', status: 'pending', editable: true },
      { ...base, documentId: 'd-bad', status: 'rejected', editable: true, rejectionReason: 'Ảnh mờ' },
    ]);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CategoryEvidenceSection staged={[]} categories={categories} onChange={jest.fn()} sendNow />); });
    const headings = texts(tree).filter((x) => x.endsWith(' (1)'));
    expect(headings).toEqual(['Cần xử lý (1)', 'Chờ duyệt (1)', 'Đã dùng để duyệt (1)']);
    act(() => tree.unmount());
  });
});
