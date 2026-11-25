import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CategoryEvidenceSection from './CategoryEvidenceSection';

jest.mock('../../api/technician-profile.api', () => ({
  ...jest.requireActual('../../api/technician-profile.api'),
  technicianProfileApi: {
    getMySkillEvidence: jest.fn(async () => []),
    getSkillEvidenceAccess: jest.fn(async () => 'https://signed.example/photo.jpg'),
    updateSkillEvidence: jest.fn(async () => []),
    deleteSkillEvidence: jest.fn(async () => undefined),
  },
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

  it('removes it after a confirmation, then reads the papers again', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const tree = await mountSent();
    const before = api().getMySkillEvidence.mock.calls.length;
    act(() => byId(tree, 'category-evidence-delete-d1').props.onPress());
    expect(alert).toHaveBeenCalledWith('Xóa giấy tờ này?', expect.stringContaining('tất cả nhóm'), expect.any(Array));
    expect(api().deleteSkillEvidence).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => { buttons.find((b) => b.text === 'Xóa')!.onPress!(); });
    expect(api().deleteSkillEvidence).toHaveBeenCalledWith('d1');
    expect(api().getMySkillEvidence.mock.calls.length).toBe(before + 1);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('opens the form filled in with the paper, and saves the new details and groups', async () => {
    const tree = await mountSent();
    await act(async () => { byId(tree, 'category-evidence-edit-d1').props.onPress(); });
    expect(texts(tree)).toContain('Sửa giấy tờ');
    // The form opens in place of the paper's row, not at the end of the list where it would be out of sight.
    expect(tree.root.findAllByProps({ testID: 'category-evidence-sent-d1' })).toHaveLength(0);
    expect(byId(tree, 'category-evidence-group-c-ac').props.accessibilityState).toEqual({ checked: true });
    expect(byId(tree, 'category-evidence-group-c-el').props.accessibilityState).toEqual({ checked: false });
    act(() => byId(tree, 'category-evidence-group-c-fr').props.onPress());
    act(() => byId(tree, 'category-evidence-group-c-el').props.onPress());
    await act(async () => { await byId(tree, 'category-evidence-confirm').props.onPress(); });
    expect(api().updateSkillEvidence).toHaveBeenCalledWith('d1', expect.objectContaining({
      evidenceType: 'social_insurance', issuer: 'BHXH', issuedAt: '2021-12-22', claimedYears: 5, categoryIds: ['c-ac', 'c-el'],
    }));
    expect(texts(tree)).not.toContain('Sửa giấy tờ');
    act(() => tree.unmount());
  });

  it('shows what the server says when a paper can no longer be changed', async () => {
    api().updateSkillEvidence.mockRejectedValueOnce({ response: { data: { message: 'Giấy tờ này đã dùng để duyệt kỹ năng, không thể sửa hoặc xóa.' } }, isAxiosError: true });
    const tree = await mountSent();
    await act(async () => { byId(tree, 'category-evidence-edit-d1').props.onPress(); });
    await act(async () => { await byId(tree, 'category-evidence-confirm').props.onPress(); });
    expect(texts(tree).join(' ')).toContain('không thể sửa hoặc xóa');
    expect(texts(tree)).toContain('Sửa giấy tờ');
    act(() => tree.unmount());
  });
});
