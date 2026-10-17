import React from 'react';
import { Image, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    colors: {
      divider: '#F1F5F9',
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

function mount(props: { code: string; name: string; size?: number; testID?: string }): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  const { default: ServiceArtwork } = jest.requireActual('./ServiceArtwork') as {
    default: React.ComponentType<{ code: string; name: string; size?: number; testID?: string }>;
  };
  act(() => {
    tree = create(React.createElement(ServiceArtwork, props));
  });
  return tree;
}

describe('ServiceArtwork', () => {
  it('renders an original RGBA cutout without a square frame for a mapped service', () => {
    const tree = mount({ code: 'VE_SINH_DIEU_HOA_1HP', name: 'Vệ sinh máy lạnh' });
    try {
      const images = tree.root.findAllByType(Image);
      expect(images).toHaveLength(1);
      expect(images[0].props.resizeMode).toBe('contain');
      expect(images[0].props.source).toEqual(require('../../../assets/optimized/ui/service-aircon-clean.png'));
      expect(images[0].props.style).not.toHaveProperty('borderRadius');
      expect(images[0].props.accessible).toBe(false);
      // Alpha is carried by the original asset, not simulated with opacity.
      expect(images[0].props.style).not.toHaveProperty('opacity');
      expect(images[0].props.testID).toBe('service-artwork-VE_SINH_DIEU_HOA_1HP');
    } finally {
      act(() => tree.unmount());
    }
  });

  it.each([
    ['SUA_RO_RI_NUOC', require('../../../assets/optimized/services/svc-sua-ro-ri-nuoc.png')],
    ['THAY_VOI_NUOC', require('../../../assets/optimized/services/svc-thay-voi-nuoc.png')],
    ['THAY_CONG_TAC_DIEN', require('../../../assets/optimized/ui/service-electrical.png')],
    ['SUA_MAY_GIAT', require('../../../assets/optimized/ui/service-washing-machine.png')],
  ])('uses the correct original cutout for %s', (code, expectedSource) => {
    const tree = mount({ code, name: 'Dịch vụ có hình cắt nền' });
    try {
      const image = tree.root.findAllByType(Image)[0];
      expect(image.props.resizeMode).toBe('contain');
      expect(image.props.style).not.toHaveProperty('borderRadius');
      expect(image.props.source).toEqual(expectedSource);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('contains the canonical transparent source for other known services', () => {
    const tree = mount({ code: 'SUA_TU_LANH', name: 'Sửa tủ lạnh' });
    try {
      const image = tree.root.findAllByType(Image)[0];
      expect(image.props.resizeMode).toBe('contain');
      expect(image.props.style).not.toHaveProperty('borderRadius');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('renders a single neutral fallback tile for an unknown code', () => {
    const tree = mount({ code: 'UNKNOWN_SERVICE', name: 'Dịch vụ lạ' });
    try {
      expect(tree.root.findAllByType(Image)).toHaveLength(0);
      const fallbacks = tree.root
        .findAllByType(View)
        .filter((node) => node.props.testID === 'service-artwork-UNKNOWN_SERVICE-fallback');
      expect(fallbacks).toHaveLength(1);
      // Fallback icon stays decorative; the parent service button owns the label.
      expect(fallbacks[0].props.accessible).toBe(false);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('respects a custom size for 360/390 tile layouts', () => {
    const tree = mount({ code: 'SUA_TU_LANH', name: 'Sửa tủ lạnh', size: 72 });
    try {
      const image = tree.root.findAllByType(Image)[0];
      expect(image.props.style).toMatchObject({ width: 72, height: 72 });
    } finally {
      act(() => tree.unmount());
    }
  });
});
