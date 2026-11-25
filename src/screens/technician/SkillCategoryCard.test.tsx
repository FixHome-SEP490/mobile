import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import SkillCategoryCard from './SkillCategoryCard';
import OnboardingSection from './OnboardingSection';
import { lightTheme } from '../../constants/theme';

const services = [
  { id: 's1', name: 'Lắp đặt điều hòa' },
  { id: 's2', name: 'Sửa điều hòa' },
  { id: 's3', name: 'Tháo hoặc di dời điều hòa, kể cả đi dây điện và ống đồng cho căn hộ nhiều tầng' },
];

type Props = Partial<React.ComponentProps<typeof SkillCategoryCard>>;

function mount(props: Props = {}) {
  const handlers = { onToggleExpanded: jest.fn(), onToggleService: jest.fn(), onSetAll: jest.fn() };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SkillCategoryCard name="Điều hòa" services={services} selectedIds={[]} expanded={false} {...handlers} {...props} />,
    );
  });
  return { tree, ...handlers };
}

// Pressable renders a composite and a host node with the same testID; the first match is the one with the handlers.
const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAllByProps({ testID })[0];
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

describe('SkillCategoryCard', () => {
  it('shows the name and how many are chosen, and keeps the rows hidden while folded', () => {
    const { tree } = mount({ selectedIds: ['s2'] });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Điều hòa', '1/3 dịch vụ']));
    expect(tree.root.findAllByProps({ testID: 'skill-service-s1' })).toHaveLength(0);
    const header = byId(tree, 'skill-category-header-Điều hòa');
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(header.props.accessibilityLabel).toBe('Điều hòa, đã chọn 1 trên 3 dịch vụ');
    act(() => tree.unmount());
  });

  it('counts the chosen services in the line under the name, in blue only when something is chosen', () => {
    const colorOf = (tree: ReactTestRenderer, label: string) => {
      const node = tree.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === label);
      return Object.assign({}, ...[node?.props.style].flat().filter(Boolean)).color;
    };
    const none = mount();
    expect(colorOf(none.tree, '0/3 dịch vụ')).toBe(lightTheme.textSecondary);
    act(() => none.tree.unmount());
    const some = mount({ selectedIds: ['s1', 's2'] });
    expect(colorOf(some.tree, '2/3 dịch vụ')).toBe(lightTheme.primaryStrong);
    act(() => some.tree.unmount());
  });

  it('folds and unfolds from the header', () => {
    const { tree, onToggleExpanded } = mount();
    act(() => byId(tree, 'skill-category-header-Điều hòa').props.onPress());
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('lists every service as a checkbox with its checked state, and the full name is not cut', () => {
    const { tree, onToggleService } = mount({ expanded: true, selectedIds: ['s2'] });
    expect(byId(tree, 'skill-service-s1').props.accessibilityRole).toBe('checkbox');
    expect(byId(tree, 'skill-service-s1').props.accessibilityState).toEqual({ checked: false });
    expect(byId(tree, 'skill-service-s2').props.accessibilityState).toEqual({ checked: true });
    const longName = tree.root.findAllByType(Text).find((t) => t.props.children === services[2].name);
    expect(longName).toBeDefined();
    expect(longName?.props.numberOfLines).toBeUndefined();
    act(() => byId(tree, 'skill-service-s1').props.onPress());
    expect(onToggleService).toHaveBeenCalledWith('s1');
    act(() => tree.unmount());
  });

  it('ticks the whole group, then offers to clear it once everything is chosen', () => {
    const first = mount({ expanded: true, selectedIds: ['s1'] });
    expect(texts(first.tree)).toContain('Chọn cả nhóm');
    act(() => byId(first.tree, 'skill-category-all-Điều hòa').props.onPress());
    expect(first.onSetAll).toHaveBeenCalledWith(true);
    act(() => first.tree.unmount());

    const full = mount({ expanded: true, selectedIds: ['s1', 's2', 's3'] });
    expect(texts(full.tree)).toContain('Bỏ chọn cả nhóm');
    act(() => byId(full.tree, 'skill-category-all-Điều hòa').props.onPress());
    expect(full.onSetAll).toHaveBeenCalledWith(false);
    act(() => full.tree.unmount());
  });
});

describe('OnboardingSection', () => {
  it('reads the title and help together and shows the content', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<OnboardingSection title="Kinh nghiệm" description="Số năm làm nghề"><Text>nội dung</Text></OnboardingSection>); });
    const head = tree.root.findAll((n) => n.props.accessibilityRole === 'header')[0];
    expect(head.props.accessibilityLabel).toBe('Kinh nghiệm. Số năm làm nghề');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Kinh nghiệm', 'Số năm làm nghề', 'nội dung']));
    act(() => tree.unmount());
  });
});
