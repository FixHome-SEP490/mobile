import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    colors: {
      primary: '#2563EB',
      primaryTint: '#DBEAFE',
      text: '#0F172A',
      textSecondary: '#64748B',
    },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactModule.createElement(Native.Text, { testID: `icon-${name}` }, name),
  };
});

function mount(props: { title: string; count: number; icon: 'alert' | 'ongoing' | 'request'; testID?: string }): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  const { default: Header } = jest.requireActual('./CustomerActivitySectionHeader') as {
    default: React.ComponentType<{ title: string; count: number; icon: 'alert' | 'ongoing' | 'request'; testID?: string }>;
  };
  act(() => {
    tree = create(React.createElement(Header, props));
  });
  return tree;
}

describe('CustomerActivitySectionHeader', () => {
  it('exposes title and count as an accessible header', () => {
    const tree = mount({ title: 'Cần bạn xử lý', count: 2, icon: 'alert', testID: 'activity-action-required-section' });
    try {
      const matches = tree.root.findAllByProps({ testID: 'activity-action-required-section' });
      const header = matches.find((node) => node.props.accessibilityRole === 'header') ?? matches[0];
      expect(header.props.accessibilityRole).toBe('header');
      expect(String(header.props.accessibilityLabel)).toContain('Cần bạn xử lý');
      expect(String(header.props.accessibilityLabel)).toContain('2');
      const labels = tree.root.findAllByType(Text).map((node) => String(node.props.children ?? ''));
      expect(labels.join(' ')).toContain('Cần bạn xử lý');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('uses distinct icons for action-required and ongoing sections', () => {
    const alertTree = mount({ title: 'Cần bạn xử lý', count: 1, icon: 'alert' });
    try {
      expect(
        alertTree.root.findAllByType(Text).filter((node) => node.props.testID === 'icon-alert-circle-outline'),
      ).toHaveLength(1);
    } finally {
      act(() => alertTree.unmount());
    }
    for (const [icon, glyph] of [['request', 'calendar-outline']] as const) {
      const tree = mount({ title: icon, count: 2, icon });
      try {
        expect(tree.root.findAllByType(Text).filter((node) => node.props.testID === `icon-${glyph}`)).toHaveLength(1);
      } finally {
        act(() => tree.unmount());
      }
    }
    const ongoingTree = mount({ title: 'Đang diễn ra', count: 3, icon: 'ongoing' });
    try {
      expect(
        ongoingTree.root.findAllByType(Text).filter((node) => node.props.testID === 'icon-layers-outline'),
      ).toHaveLength(1);
    } finally {
      act(() => ongoingTree.unmount());
    }
  });
});
