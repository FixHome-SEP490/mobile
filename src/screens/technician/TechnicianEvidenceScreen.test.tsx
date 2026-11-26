import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianEvidenceScreen from './TechnicianEvidenceScreen';

const mockServices = jest.fn();
const mockCategories = jest.fn();
const mockMyServices = jest.fn();

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
    getMySkillEvidence: jest.fn(async () => []),
  },
}));

const services = [
  { id: 's1', name: 'Vệ sinh điều hòa', categoryId: 'ac', pricingMode: 'inspection_required' },
  { id: 's3', name: 'Sửa tủ lạnh', categoryId: 'fr', pricingMode: 'inspection_required' },
];
const offering = (serviceId: string, verificationStatus: string) =>
  ({ serviceId, verificationStatus, isActive: true, listedLaborPrice: 1, typicalWarrantyDays: 7, level: 'INTERMEDIATE' });

const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID })[0];
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TechnicianEvidenceScreen />); });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockServices.mockResolvedValue({ data: services, total: 2 });
  mockCategories.mockResolvedValue([{ id: 'ac', name: 'Điều hòa' }, { id: 'fr', name: 'Tủ lạnh' }]);
  mockMyServices.mockResolvedValue([offering('s1', 'verified'), offering('s3', 'pending')]);
});

describe('TechnicianEvidenceScreen', () => {
  it('says that a used paper is locked, and lets the technician add a paper', async () => {
    const tree = await render();
    expect(texts(tree).join(' ')).toContain('không sửa hoặc xóa được nữa');
    expect(byId(tree, 'category-evidence-add')).toBeDefined();
    act(() => tree.unmount());
  });

  it('offers no new paper once every skill taken is approved', async () => {
    mockMyServices.mockResolvedValue([offering('s1', 'verified'), offering('s3', 'verified')]);
    const tree = await render();
    expect(tree.root.findAllByProps({ testID: 'category-evidence-add' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('shows a retry, not the empty state, when the data cannot be loaded', async () => {
    mockServices.mockRejectedValueOnce(new Error('offline'));
    const tree = await render();
    expect(texts(tree).join(' ')).toContain('Không thể tải dữ liệu');
    await act(async () => tree.root.findAllByProps({ accessibilityLabel: 'Thử lại' })[0].props.onPress());
    expect(byId(tree, 'category-evidence-add')).toBeDefined();
    act(() => tree.unmount());
  });
});
