import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import SkillEvidenceRow from './SkillEvidenceRow';

const mockGetVerification = jest.fn();
const mockDelete = jest.fn();
const mockLibrary = jest.fn();
const mockReuse = jest.fn();
const mockLaunch = jest.fn(async () => ({ canceled: true }));

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View, null);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: (...a: unknown[]) => (mockLaunch as (...args: unknown[]) => unknown)(...a),
}));
jest.mock('../../api/technician-profile.api', () => ({
  ...jest.requireActual('../../api/technician-profile.api'),
  technicianProfileApi: {
    getSkillVerification: (...a: unknown[]) => mockGetVerification(...a),
    getSkillEvidenceAccess: jest.fn(async () => 'https://signed.example/photo.jpg'),
    deleteSkillEvidenceFromSkill: (...a: unknown[]) => mockDelete(...a),
    getMySkillEvidence: (...a: unknown[]) => mockLibrary(...a),
    reuseSkillEvidence: (...a: unknown[]) => mockReuse(...a),
  },
}));

const doc = { id: 'd1', fileName: 'a.jpg', evidenceType: 'social_insurance', issuer: 'BHXH', referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: 5, reviewStatus: 'pending', reviewNote: null };
const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID })[0];
const open = (tree: ReactTestRenderer, id: string) => act(async () => byId(tree, `skill-evidence-open-${id}`).props.onPress());
const hasDelete = (tree: ReactTestRenderer) => tree.root.findAllByProps({ testID: 'evidence-detail-delete' }).length > 0;
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

async function mount(status: 'pending' | 'verified' | 'rejected', onChanged = jest.fn()) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<SkillEvidenceRow serviceId="s1" serviceName="Sửa tủ lạnh" status={status} onChanged={onChanged} showReasonNow />);
  });
  return { tree, onChanged };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockResolvedValue(undefined);
  mockLibrary.mockResolvedValue([]);
  mockReuse.mockResolvedValue({ attached: 1, skipped: 0 });
});

describe('SkillEvidenceRow papers of one skill', () => {
  it('lets the technician remove a paper of a refused skill after a confirmation, then reads the papers again', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'rejected', rejectionReason: 'Ảnh mờ', documents: [doc] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { tree, onChanged } = await mount('rejected');
    expect(texts(tree)).toContain('Lý do từ chối: Ảnh mờ');
    // A paper of a refused skill is not "waiting for review": no per-paper verdict exists, so none is shown.
    expect(texts(tree)).not.toContain('Chờ xem xét');
    await open(tree, 'd1');
    await act(async () => byId(tree, 'evidence-detail-delete').props.onPress());
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(alert.mock.calls[0][0]).toBe('Xóa giấy tờ này?');
    expect(alert.mock.calls[0][1]).toContain('kỹ năng Sửa tủ lạnh');
    expect(mockDelete).not.toHaveBeenCalled();
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'rejected', rejectionReason: 'Ảnh mờ', documents: [] });
    await act(async () => { buttons.find((b) => b.text === 'Xóa')!.onPress!(); });
    expect(mockDelete).toHaveBeenCalledWith('s1', 'd1');
    expect(onChanged).toHaveBeenCalled();
    expect(texts(tree)).toContain('Bạn chưa gửi giấy tờ nào.');
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('also lets a paper waiting for review be removed, but never one of an approved skill', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [doc] });
    const waiting = await mount('pending');
    await act(async () => byId(waiting.tree, 'skill-evidence-reason-s1').props.onPress());
    await open(waiting.tree, 'd1');
    expect(hasDelete(waiting.tree)).toBe(true);
    act(() => waiting.tree.unmount());

    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'verified', rejectionReason: null, documents: [doc] });
    const approved = await mount('verified');
    await act(async () => byId(approved.tree, 'skill-evidence-reason-s1').props.onPress());
    await open(approved.tree, 'd1');
    expect(hasDelete(approved.tree)).toBe(false);
    expect(texts(approved.tree)).toEqual(expect.arrayContaining(['Nơi cấp', 'BHXH']));
    act(() => approved.tree.unmount());
  });

  it('says why a paper could not be removed', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'rejected', rejectionReason: null, documents: [doc] });
    mockDelete.mockRejectedValue(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { tree } = await mount('rejected');
    await open(tree, 'd1');
    await act(async () => byId(tree, 'evidence-detail-delete').props.onPress());
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => { buttons.find((b) => b.text === 'Xóa')!.onPress!(); });
    expect(alert.mock.calls.at(-1)![0]).toBe('Không xóa được giấy tờ');
    alert.mockRestore();
    act(() => tree.unmount());
  });
});

describe('SkillEvidenceRow adds a paper by picking one already up', () => {
  const paper = (documentId: string, over: object = {}) => ({ documentId, serviceId: 'x', serviceIds: ['other'], fileName: `${documentId}.jpg`, mimeType: 'image/jpeg', evidenceType: 'social_insurance', issuer: 'BHXH', referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: 5, categories: [], ...over });
  const openAdd = (tree: ReactTestRenderer) => act(async () => byId(tree, 'skill-evidence-upload-s1').props.onPress());

  it('lists the papers already up, greys out the ones this skill holds, and adds the ticked ones without uploading', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [] });
    mockLibrary.mockResolvedValue([paper('p1'), paper('p2', { evidenceType: 'vocational_diploma' }), paper('p3', { serviceIds: ['s1'] })]);
    const { tree, onChanged } = await mount('pending');
    await openAdd(tree);
    expect(byId(tree, 'skill-evidence-choose-s1')).toBeDefined();
    expect(byId(tree, 'skill-evidence-choice-p3').props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(texts(tree)).toContain('Đã có');
    act(() => byId(tree, 'skill-evidence-choice-p1').props.onPress());
    act(() => byId(tree, 'skill-evidence-choice-p2').props.onPress());
    expect(texts(tree)).toContain('Thêm 2 giấy tờ');
    mockReuse.mockResolvedValue({ attached: 2, skipped: 0 });
    await act(async () => byId(tree, 'skill-evidence-choose-add-s1').props.onPress());
    expect(mockReuse).toHaveBeenCalledWith('s1', ['p1', 'p2']);
    expect(mockLaunch).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
    expect(texts(tree)).toContain('Đã thêm 2 giấy tờ.');
    act(() => tree.unmount());
  });

  it('tells a refused skill to send it again, and says how many papers it already had', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'rejected', rejectionReason: 'x', documents: [] });
    mockLibrary.mockResolvedValue([paper('p1')]);
    mockReuse.mockResolvedValue({ attached: 0, skipped: 1 });
    const { tree } = await mount('rejected');
    await openAdd(tree);
    act(() => byId(tree, 'skill-evidence-choice-p1').props.onPress());
    await act(async () => byId(tree, 'skill-evidence-choose-add-s1').props.onPress());
    expect(texts(tree).join(' ')).toContain('Bấm Gửi lại để xét duyệt khi bạn sẵn sàng. 1 giấy tờ đã có nên bỏ qua.');
    act(() => tree.unmount());
  });

  it('goes straight to the photo library when every paper is already on the skill or there are none', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [] });
    mockLibrary.mockResolvedValue([paper('p3', { serviceIds: ['s1'] })]);
    const { tree } = await mount('pending');
    await openAdd(tree);
    expect(tree.root.findAllByProps({ testID: 'skill-evidence-choose-s1' })).toHaveLength(0);
    expect(mockLaunch).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('keeps the panel open and shows the server message when the papers cannot be added', async () => {
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [] });
    mockLibrary.mockResolvedValue([paper('p1')]);
    mockReuse.mockRejectedValue({ response: { data: { message: 'Giấy tờ đã hết hạn' } } });
    const { tree } = await mount('pending');
    await openAdd(tree);
    act(() => byId(tree, 'skill-evidence-choice-p1').props.onPress());
    await act(async () => byId(tree, 'skill-evidence-choose-add-s1').props.onPress());
    expect(byId(tree, 'skill-evidence-choose-s1')).toBeDefined();
    expect(texts(tree).join(' ')).toContain('Giấy tờ đã hết hạn');
    act(() => tree.unmount());
  });
});

describe('SkillEvidenceRow detail photo', () => {
  it('never shows the photo of the previous paper when the next one has none', async () => {
    const second = { ...doc, id: 'd2' };
    mockGetVerification.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [doc, second] });
    const access = jest.requireMock('../../api/technician-profile.api').technicianProfileApi.getSkillEvidenceAccess as jest.Mock;
    access.mockImplementation(async (_s: string, id: string) => (id === 'd1' ? 'https://signed.example/d1.jpg' : ''));
    const { tree } = await mount('pending');
    await act(async () => byId(tree, 'skill-evidence-reason-s1').props.onPress());
    await act(async () => byId(tree, 'skill-evidence-open-d1').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'evidence-photo-stage' }).length).toBeGreaterThan(0);
    await act(async () => byId(tree, 'evidence-detail-close').props.onPress());
    await act(async () => byId(tree, 'skill-evidence-open-d2').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'evidence-photo-stage' })).toHaveLength(0);
    access.mockImplementation(async () => 'https://signed.example/photo.jpg');
    act(() => tree.unmount());
  });
});
