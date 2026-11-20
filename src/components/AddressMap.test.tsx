import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import AddressMap, { Marker } from './AddressMap';

let mockAvailable = false;
jest.mock('./map-availability', () => ({
  ...jest.requireActual('./map-availability'),
  isNativeMapAvailable: () => mockAvailable,
}));
jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactActual = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  const Map = ({ children, onPress, mapStyle }: { children?: React.ReactNode; onPress?: unknown; mapStyle?: string }) =>
    ReactActual.createElement(Native.View, { testID: 'native-map', onPress, mapStyle }, children);
  const Camera = (props: Record<string, unknown>) => ReactActual.createElement(Native.View, { ...props, testID: 'native-camera' });
  const Marker = ({ children, lngLat }: { children?: React.ReactNode; lngLat: unknown }) =>
    ReactActual.createElement(Native.View, { testID: 'native-marker', lngLat }, children);
  return { __esModule: true, Map, Camera, Marker };
});

async function render(extra: Record<string, unknown> = {}) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <AddressMap style={{ height: 200 }} initialRegion={{ latitude: 10.77, longitude: 106.7, latitudeDelta: 0.02, longitudeDelta: 0.02 }} {...extra}>
        <Marker coordinate={{ latitude: 10.77, longitude: 106.7 }} />
      </AddressMap>,
    );
  });
  return tree;
}

describe('AddressMap', () => {
  it('shows a readable placeholder instead of the map when the build has no MapTiler key', async () => {
    mockAvailable = false;
    const tree = await render();
    expect(tree.root.findAllByProps({ testID: 'native-map' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'native-marker' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'map-unavailable' })).toBeTruthy();
    const text = tree.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain('Bản đồ chưa khả dụng');
    await act(async () => tree.unmount());
  });

  it('draws the MapTiler streets style with markers when the key is configured', async () => {
    mockAvailable = true;
    const tree = await render();
    const map = tree.root.findAllByProps({ testID: 'native-map' })[0];
    expect(map.props.mapStyle).toContain('https://api.maptiler.com/maps/streets-v2/style.json');
    expect(tree.root.findAllByProps({ testID: 'native-marker' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'map-unavailable' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it('keeps the press shape the screens use and centres the camera on the region', async () => {
    mockAvailable = true;
    const onPress = jest.fn();
    const tree = await render({ onPress, region: { latitude: 10.8, longitude: 106.6, latitudeDelta: 0.01, longitudeDelta: 0.01 } });
    tree.root.findAllByProps({ testID: 'native-map' })[0].props.onPress({ nativeEvent: { lngLat: [106.71, 10.78], point: [0, 0] } });
    expect(onPress).toHaveBeenCalledWith({ nativeEvent: { coordinate: { latitude: 10.78, longitude: 106.71 } } });
    expect(tree.root.findAllByProps({ testID: 'native-camera' })[0].props.center).toEqual([106.6, 10.8]);
    expect(tree.root.findAllByProps({ testID: 'native-marker' })[0].props.lngLat).toEqual([106.7, 10.77]);
    await act(async () => tree.unmount());
  });
});
