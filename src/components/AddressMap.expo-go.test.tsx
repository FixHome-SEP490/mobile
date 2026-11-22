import type React from 'react';

// BUG DETECTOR 211: Expo Go has no MapLibre native module; the map must not even be loaded there.
let mockEnvironment = 'storeClient';
let mockMapLibreLoads = 0;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { get executionEnvironment() { return mockEnvironment; }, expoConfig: {} },
}));
jest.mock('@maplibre/maplibre-react-native', () => {
  mockMapLibreLoads += 1;
  const ReactActual = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  const Map = ({ children }: { children?: React.ReactNode }) => ReactActual.createElement(Native.View, { testID: 'native-map' }, children);
  const Camera = () => null;
  const Marker = ({ children }: { children?: React.ReactNode }) => ReactActual.createElement(Native.View, { testID: 'native-marker' }, children);
  return { __esModule: true, Map, Camera, Marker };
});

const region = { latitude: 10.77, longitude: 106.7, latitudeDelta: 0.02, longitudeDelta: 0.02 };

async function renderMap() {
  const { default: AddressMap, Marker } = jest.requireActual('./AddressMap') as typeof import('./AddressMap');
  const ReactLocal = jest.requireActual('react') as typeof React;
  const { act, create } = jest.requireActual('react-test-renderer') as typeof import('react-test-renderer');
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(ReactLocal.createElement(AddressMap, { initialRegion: region }, ReactLocal.createElement(Marker, { coordinate: region })));
  });
  return tree;
}

const allText = (tree: { toJSON: () => unknown }) => JSON.stringify(tree.toJSON());

describe('AddressMap in Expo Go and in the APK', () => {
  const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  beforeEach(() => {
    jest.resetModules();
    mockMapLibreLoads = 0;
    process.env.EXPO_PUBLIC_MAPTILER_KEY = 'test-key';
  });
  afterAll(() => { process.env.EXPO_PUBLIC_MAPTILER_KEY = key; });

  it('in Expo Go never loads MapLibre and shows the APK-only placeholder', async () => {
    mockEnvironment = 'storeClient';
    const tree = await renderMap();
    expect(mockMapLibreLoads).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'native-map' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'map-unavailable' })).toBeTruthy();
    expect(allText(tree)).toContain('Bản đồ chỉ có trên bản cài APK');
  });

  it('in the APK (bare build) still draws the MapLibre map with its marker', async () => {
    mockEnvironment = 'bare';
    const tree = await renderMap();
    expect(mockMapLibreLoads).toBe(1);
    expect(tree.root.findAllByProps({ testID: 'native-map' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'native-marker' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'map-unavailable' })).toHaveLength(0);
  });

  it('the public tracking map shows the same APK-only text in Expo Go', async () => {
    mockEnvironment = 'storeClient';
    const { default: TrackingMap } = jest.requireActual('../screens/guest/PublicOrderTrackingMap.native') as typeof import('../screens/guest/PublicOrderTrackingMap.native');
    const ReactLocal = jest.requireActual('react') as typeof React;
    const { act, create } = jest.requireActual('react-test-renderer') as typeof import('react-test-renderer');
  let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(ReactLocal.createElement(TrackingMap, { technicianLocation: { lat: 10.77, lng: 106.7 }, destination: null })); });
    expect(tree.root.findByProps({ testID: 'public-tracking-map-unavailable' })).toBeTruthy();
    expect(allText(tree)).toContain('Bản đồ chỉ có trên bản cài APK');
    expect(mockMapLibreLoads).toBe(0);
  });
});
