import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import AddressMap, { Marker } from './AddressMap';

let mockAvailable = false;
jest.mock('./map-availability', () => ({
  ...jest.requireActual('./map-availability'),
  isNativeMapAvailable: () => mockAvailable,
}));
jest.mock('react-native-maps', () => {
  const ReactActual = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  const MapView = ({ children }: { children?: React.ReactNode }) => ReactActual.createElement(Native.View, { testID: 'native-map' }, children);
  const Marker = () => ReactActual.createElement(Native.View, { testID: 'native-marker' });
  return { __esModule: true, default: MapView, Marker };
});


async function render() {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <AddressMap style={{ height: 200 }} initialRegion={{ latitude: 10.77, longitude: 106.7, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
        <Marker coordinate={{ latitude: 10.77, longitude: 106.7 }} />
      </AddressMap>,
    );
  });
  return tree;
}

describe('AddressMap', () => {
  it('shows a readable placeholder instead of the native map when the build has no Maps key', async () => {
    mockAvailable = false;
    const tree = await render();
    expect(tree.root.findAllByProps({ testID: 'native-map' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'native-marker' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'map-unavailable' })).toBeTruthy();
    const text = tree.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain('Bản đồ chưa khả dụng');
    await act(async () => tree.unmount());
  });

  it('renders the native map and markers when the key is configured', async () => {
    mockAvailable = true;
    const tree = await render();
    expect(tree.root.findAllByProps({ testID: 'native-map' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'native-marker' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'map-unavailable' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });
});
