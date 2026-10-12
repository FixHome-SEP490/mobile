import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CategoryPills from './CategoryPills';
import { lightTheme } from '../constants/theme';

const categories = [
  { id: 'cat-dien-lanh', name: 'Điện lạnh', code: 'DIEN_LANH', isActive: true, sortOrder: 1 },
  { id: 'cat-dien-nuoc', name: 'Điện nước', code: 'DIEN_NUOC', isActive: true, sortOrder: 2 },
];

function mount(selectedId: string | null, onSelect: (id: string | null) => void): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<CategoryPills categories={categories} selectedId={selectedId} onSelect={onSelect} />);
  });
  return tree;
}

function pillFor(tree: ReactTestRenderer, label: string) {
  const pill = tree.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === label),
  );
  if (!pill) throw new Error(`Missing pill: ${label}`);
  return pill;
}

describe('CategoryPills (C-RUI3 M2 contrast + behavior)', () => {
  it('paints the selected pill with high-contrast primaryStrong, not low-contrast primary', () => {
    const tree = mount('cat-dien-lanh', jest.fn());
    try {
      const selected = pillFor(tree, 'Điện lạnh');
      const flatSelected = Array.isArray(selected.props.style)
        ? Object.assign({}, ...selected.props.style)
        : selected.props.style;
      expect(flatSelected.backgroundColor).toBe(lightTheme.primaryStrong);
      expect(flatSelected.backgroundColor).not.toBe(lightTheme.primary);
      expect(flatSelected.borderColor).toBe(lightTheme.primaryStrong);
      const selectedText = selected.findAllByType(Text)[0];
      expect(selectedText.props.style).toMatchObject({ color: lightTheme.surface });

      const unselected = pillFor(tree, 'Điện nước');
      const flatUnselected = Array.isArray(unselected.props.style)
        ? Object.assign({}, ...unselected.props.style)
        : unselected.props.style;
      expect(flatUnselected.backgroundColor).toBe(lightTheme.surface);
      const unselectedText = unselected.findAllByType(Text)[0];
      expect(unselectedText.props.style).toMatchObject({ color: lightTheme.text });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('exposes selected/unselected state to assistive tech and fires onSelect', () => {
    const onSelect = jest.fn();
    const tree = mount(null, onSelect);
    try {
      const all = pillFor(tree, 'Tất cả');
      expect(all.props.accessibilityRole).toBe('button');
      expect(all.props.accessibilityState).toMatchObject({ selected: true });
      expect(String(all.props.accessibilityLabel)).toContain('Tất cả');

      const pill = pillFor(tree, 'Điện lạnh');
      expect(pill.props.accessibilityRole).toBe('button');
      expect(pill.props.accessibilityState).toMatchObject({ selected: false });
      expect(String(pill.props.accessibilityLabel)).toContain('Điện lạnh');

      act(() => pill.props.onPress());
      expect(onSelect).toHaveBeenCalledWith('cat-dien-lanh');
      act(() => all.props.onPress());
      expect(onSelect).toHaveBeenCalledWith(null);
    } finally {
      act(() => tree.unmount());
    }
  });
});
