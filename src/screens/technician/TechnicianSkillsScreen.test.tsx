import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianSkillsScreen from './TechnicianSkillsScreen';

const mockServices = jest.fn();
const mockCategories = jest.fn();
const mockMyServices = jest.fn();
const mockSetPricing = jest.fn();
const mockNavigate = jest.fn();
const mockResubmit = jest.fn();
const mockLibrary = jest.fn();
const mockReuse = jest.fn();

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) => ReactModule.createElement(View, props, children);
  return { SafeAreaView: Passthrough, SafeAreaProvider: Passthrough, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View, null);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('../../components/BackButton', () => () => null);
jest.mock('../../api/services.api', () => ({
  servicesApi: { getServices: (...a: unknown[]) => mockServices(...a), getCategories: (...a: unknown[]) => mockCategories(...a) },
}));
jest.mock('../../api/technician-profile.api', () => ({
  ...jest.requireActual('../../api/technician-profile.api'),
  technicianProfileApi: {
    getMyServices: (...a: unknown[]) => mockMyServices(...a),
    getMyProfile: jest.fn(async () => ({ defaultLaborWarrantyDays: 30 })),
    setSkillPricing: (...a: unknown[]) => mockSetPricing(...a),
    resubmitSkill: (...a: unknown[]) => mockResubmit(...a),
    getMySkillEvidence: (...a: unknown[]) => mockLibrary(...a),
    reuseSkillEvidence: (...a: unknown[]) => mockReuse(...a),
    getSkillVerification: jest.fn(async () => ({ id: 'v', status: 'rejected', rejectionReason: 'Bằng chưa đủ căn cứ', documents: [] })),
  },
}));

const services = [
  { id: 's1', name: 'Vệ sinh điều hòa', categoryId: 'ac', pricingMode: 'inspection_required' },
  { id: 's2', name: 'Nạp gas điều hòa', categoryId: 'ac', pricingMode: 'inspection_required' },
  { id: 's3', name: 'Sửa tủ lạnh', categoryId: 'fr', pricingMode: 'inspection_required' },
];
const offering = (serviceId: string, verificationStatus: string, isActive = true) =>
  ({ serviceId, verificationStatus, isActive, listedLaborPrice: 100000, typicalWarrantyDays: 7, level: 'INTERMEDIATE' });

// Pressable renders a composite and a host node with the same testID; the first match is the one with the handlers.
const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID })[0];
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TechnicianSkillsScreen />); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockServices.mockResolvedValue({ data: services, total: 3 });
  mockCategories.mockResolvedValue([{ id: 'ac', name: 'Điều hòa' }, { id: 'fr', name: 'Tủ lạnh' }]);
  mockMyServices.mockResolvedValue([offering('s1', 'verified'), offering('s2', 'rejected')]);
  mockResubmit.mockResolvedValue(undefined);
  mockLibrary.mockResolvedValue([]);
  mockReuse.mockResolvedValue({ attached: 1, skipped: 0 });
  mockSetPricing.mockImplementation(async (serviceId: string) => offering(serviceId, 'pending'));
});

describe('TechnicianSkillsScreen', () => {
  it('lists the groups closed, with the state counts of each', async () => {
    const tree = await render();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Điều hòa', '1 đã duyệt · 1 bị từ chối · 2 dịch vụ', 'Tủ lạnh', '1 dịch vụ']));
    expect(tree.root.findAllByProps({ testID: 'skill-row-s1' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('opens a group to its services, and shows why a skill was refused without a tap', async () => {
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-ac').props.onPress());
    expect(byId(tree, 'skill-row-s1')).toBeDefined();
    expect(byId(tree, 'skill-row-s2')).toBeDefined();
    expect(texts(tree)).toContain('Lý do từ chối: Bằng chưa đủ căn cứ');
    act(() => tree.unmount());
  });

  it('filters by state and by name, opening the groups that match', async () => {
    const tree = await render();
    await act(async () => byId(tree, 'skills-filter-rejected').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-row-s2' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'skill-row-s1' })).toHaveLength(0);
    await act(async () => byId(tree, 'skills-filter-all').props.onPress());
    await act(async () => byId(tree, 'skills-search').props.onChangeText('tu lanh'));
    expect(tree.root.findAllByProps({ testID: 'skill-row-s3' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'skill-row-s1' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('lets the groups of a filtered list be folded, and opens them again on the next filter', async () => {
    const tree = await render();
    await act(async () => byId(tree, 'skills-filter-rejected').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-row-s2' }).length).toBeGreaterThan(0);
    await act(async () => byId(tree, 'skills-group-header-ac').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-row-s2' })).toHaveLength(0);
    await act(async () => byId(tree, 'skills-group-header-ac').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-row-s2' }).length).toBeGreaterThan(0);
    await act(async () => byId(tree, 'skills-group-header-ac').props.onPress());
    await act(async () => byId(tree, 'skills-filter-all').props.onPress());
    await act(async () => byId(tree, 'skills-filter-rejected').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-row-s2' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('switching a new service on shows save, and saving asks for approval', async () => {
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-fr').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-save-s3' })).toHaveLength(0);
    await act(async () => byId(tree, 'skill-switch-s3').props.onValueChange(true));
    await act(async () => { await byId(tree, 'skill-save-s3').props.onPress(); });
    expect(mockSetPricing).toHaveBeenCalledWith('s3', expect.objectContaining({ isActive: true }));
    expect(mockSetPricing.mock.calls[0][1]).not.toHaveProperty('level');
    expect(texts(tree)).toContain('Chờ duyệt 1');
    act(() => tree.unmount());
  });

  it('lets a new service pick papers already uploaded before saving, and sends them with the save', async () => {
    mockLibrary.mockResolvedValue([{ documentId: 'd1', serviceId: 's1', serviceIds: ['s1'], fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'vocational_diploma', issuer: null, referenceNumber: 'AB-1', issuedAt: null, expiresAt: null, claimedYears: null, categories: [] }]);
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-fr').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-staged-s3' })).toHaveLength(0);
    await act(async () => byId(tree, 'skill-switch-s3').props.onValueChange(true));
    expect(byId(tree, 'skill-staged-s3')).toBeDefined();
    await act(async () => { await byId(tree, 'skill-staged-add-s3').props.onPress(); });
    await act(async () => byId(tree, 'skill-staged-choice-d1').props.onPress());
    await act(async () => byId(tree, 'skill-staged-choose-add-s3').props.onPress());
    expect(byId(tree, 'skill-staged-item-s3-0')).toBeDefined();
    expect(mockSetPricing).not.toHaveBeenCalled();
    await act(async () => { await byId(tree, 'skill-save-s3').props.onPress(); });
    expect(mockSetPricing).toHaveBeenCalledWith('s3', expect.objectContaining({ isActive: true }));
    expect(mockReuse).toHaveBeenCalledWith('s3', ['d1']);
    expect(mockSetPricing.mock.invocationCallOrder[0]).toBeLessThan(mockReuse.mock.invocationCallOrder[0]);
    expect(tree.root.findAllByProps({ testID: 'skill-staged-item-s3-0' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('drops the waiting papers when the service is switched off again', async () => {
    mockLibrary.mockResolvedValue([{ documentId: 'd1', serviceId: 's1', serviceIds: ['s1'], fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: null, issuer: null, referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: null, categories: [] }]);
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-fr').props.onPress());
    await act(async () => byId(tree, 'skill-switch-s3').props.onValueChange(true));
    await act(async () => { await byId(tree, 'skill-staged-add-s3').props.onPress(); });
    await act(async () => byId(tree, 'skill-staged-choice-d1').props.onPress());
    await act(async () => byId(tree, 'skill-staged-choose-add-s3').props.onPress());
    await act(async () => byId(tree, 'skill-switch-s3').props.onValueChange(false));
    await act(async () => byId(tree, 'skill-switch-s3').props.onValueChange(true));
    expect(tree.root.findAllByProps({ testID: 'skill-staged-item-s3-0' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('says why a skill was not saved when the warranty is out of range', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-fr').props.onPress());
    await act(async () => byId(tree, 'skill-switch-s3').props.onValueChange(true));
    const days = tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Bảo hành Sửa tủ lạnh')!;
    await act(async () => days.props.onChangeText('9999'));
    await act(async () => { await byId(tree, 'skill-save-s3').props.onPress(); });
    expect(alert.mock.calls[0][0]).toBe('Chưa lưu được');
    expect(mockSetPricing).not.toHaveBeenCalled();
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('shows a retry, not an empty list, when the catalog cannot be loaded', async () => {
    mockServices.mockRejectedValueOnce(new Error('offline'));
    const tree = await render();
    expect(texts(tree).join(' ')).toContain('Không thể tải danh sách dịch vụ');
    await act(async () => tree.root.findAllByProps({ accessibilityLabel: 'Thử lại danh sách dịch vụ' })[0].props.onPress());
    expect(texts(tree)).toContain('Điều hòa');
    act(() => tree.unmount());
  });

  it('leaves the papers to their own page', async () => {
    const tree = await render();
    expect(tree.root.findAllByProps({ testID: 'category-evidence-add' })).toHaveLength(0);
    await act(async () => byId(tree, 'skills-open-evidence').props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianEvidence');
    act(() => tree.unmount());
  });

  it('offers to send a refused skill back for review without changing anything, and says it once', async () => {
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-ac').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'skill-resubmit-s1' })).toHaveLength(0); // approved: nothing to resend
    await act(async () => { await byId(tree, 'skill-resubmit-s2').props.onPress(); });
    expect(mockResubmit).toHaveBeenCalledWith('s2');
    expect(texts(tree).filter((x) => x.startsWith('Đã gửi lại Nạp gas điều hòa'))).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('says why a refused skill could not be sent back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockResubmit.mockRejectedValueOnce(new Error('offline'));
    const tree = await render();
    await act(async () => byId(tree, 'skills-group-header-ac').props.onPress());
    await act(async () => { await byId(tree, 'skill-resubmit-s2').props.onPress(); });
    expect(alert.mock.calls[0][0]).toBe('Chưa gửi lại được');
    alert.mockRestore();
    act(() => tree.unmount());
  });
});
