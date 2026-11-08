import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import OnboardingStepper from './OnboardingStepper';
import { ONBOARDING_STEPS, type OnboardingStepProgress } from './technician-onboarding';

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(View);
  return new Proxy({}, { get: () => Icon });
});

// Bước 1-2 xong, đang ở bước 3, bước 4-5 chưa tới.
const progress: OnboardingStepProgress[] = ONBOARDING_STEPS.map(({ id, title }) => ({
  id, title,
  completed: id <= 2,
  current: id === 3,
  reachable: id <= 3,
  statusLabel: id <= 2 ? 'Đã hoàn tất' : id === 3 ? 'Đang thực hiện' : 'Chưa bắt đầu',
}));

const render = (step: number, onSelect = jest.fn()) => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<OnboardingStepper progress={progress} step={step} onSelect={onSelect} />); });
  const text = () => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join('')).join(' ');
  return { tree, text, onSelect };
};

test('shows short labels, the full title of the current step and its status', () => {
  const { text } = render(3);
  for (const label of ['Thông tin', 'Xác minh', 'Kỹ năng', 'Khu vực', 'Gửi duyệt']) expect(text()).toContain(label);
  expect(text()).toContain('Bước 3/5');
  expect(text()).toContain('Kỹ năng');
  expect(text()).toContain('Đang thực hiện');
});

test('a viewed finished step says it is done, and steps not reached yet cannot be opened', () => {
  const { tree, text, onSelect } = render(1);
  expect(text()).toContain('Đã hoàn tất');
  const nodes = tree.root.findAllByType(TouchableOpacity);
  expect(nodes).toHaveLength(5);
  expect(nodes[3].props.disabled).toBe(true);
  expect(nodes[3].props.accessibilityLabel).toBe('Bước 4: Địa chỉ & khu vực, Chưa bắt đầu');
  act(() => { nodes[1].props.onPress(); });
  expect(onSelect).toHaveBeenCalledWith(2);
});
