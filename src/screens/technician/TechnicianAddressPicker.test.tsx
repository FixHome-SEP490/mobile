import React from 'react';
import { Alert, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Location from 'expo-location';
import { geoApi } from '../../api/geo.api';
import TechnicianAddressPicker from './TechnicianAddressPicker';

jest.mock('lucide-react-native', () => ({ LocateFixed: () => null, MapPin: () => null }));
jest.mock('../../api/geo.api', () => ({ geoApi: { autocomplete: jest.fn(), reverse: jest.fn() } }));
jest.mock('../../components/AddressMap', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: (props: object) => <View testID="map" {...props} />, Marker: () => null };
});
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 1 } }));

const geo = jest.mocked(geoApi);
const location = jest.mocked(Location);
const suggestion = { placeId: 'p1', description: '12 Lê Lợi, Quận 1, TP.HCM', lat: 10.77, lng: 106.7, ward: 'Bến Nghé', district: 'Quận 1', province: 'TP.HCM' };

let tree: ReactTestRenderer;
const onTextChange = jest.fn();
const onPlace = jest.fn();
async function render(props: Partial<React.ComponentProps<typeof TechnicianAddressPicker>> = {}) {
  await act(async () => {
    tree = create(<TechnicianAddressPicker line1="" onTextChange={onTextChange} onPlace={onPlace} {...props} />);
  });
}
const pressMap = (latitude: number, longitude: number) =>
  act(async () => { await tree.root.findByProps({ testID: 'map' }).props.onPress({ nativeEvent: { coordinate: { latitude, longitude } } }); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => tree.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('searches after a pause once three characters are typed, and picking a suggestion hands over the place', async () => {
  geo.autocomplete.mockResolvedValue([suggestion] as never);
  await render();
  const input = () => tree.root.findByType(TextInput);

  await act(async () => { input().props.onChangeText('12'); jest.advanceTimersByTime(400); });
  expect(geo.autocomplete).not.toHaveBeenCalled();

  await act(async () => { input().props.onChangeText('12 Lê'); jest.advanceTimersByTime(400); });
  expect(onTextChange).toHaveBeenLastCalledWith('12 Lê');
  expect(geo.autocomplete).toHaveBeenCalledWith('12 Lê');

  await act(async () => { tree.root.findByProps({ accessibilityLabel: `Chọn địa chỉ: ${suggestion.description}` }).props.onPress(); });
  expect(onPlace).toHaveBeenCalledWith(10.77, 106.7, { formattedAddress: suggestion.description, ward: 'Bến Nghé', district: 'Quận 1', province: 'TP.HCM' });
  expect(tree.root.findAllByProps({ accessibilityLabel: `Chọn địa chỉ: ${suggestion.description}` })).toHaveLength(0);
});

test('tapping the map drops the pin first, then fills in the address; a failed lookup keeps the pin', async () => {
  geo.reverse.mockResolvedValueOnce({ formattedAddress: 'Đường Hai Bà Trưng', ward: 'Đa Kao', province: 'TP.HCM' } as never);
  await render();
  await pressMap(10.78, 106.69);
  expect(onPlace).toHaveBeenNthCalledWith(1, 10.78, 106.69);
  expect(onPlace).toHaveBeenNthCalledWith(2, 10.78, 106.69, expect.objectContaining({ formattedAddress: 'Đường Hai Bà Trưng' }));

  onPlace.mockClear();
  geo.reverse.mockRejectedValueOnce(new Error('offline'));
  await pressMap(10.8, 106.7);
  expect(onPlace).toHaveBeenCalledTimes(1);
  expect(onPlace).toHaveBeenCalledWith(10.8, 106.7);
});

test('current location asks for permission, and a refusal changes nothing', async () => {
  location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  await render();
  const button = () => tree.root.findAllByProps({ accessibilityRole: 'button' }).filter((node) => node.props.onPress && node.props.disabled !== undefined).at(-1)!;
  await act(async () => { await button().props.onPress(); });
  expect(Alert.alert).toHaveBeenCalledWith('Quyền bị từ chối', expect.any(String));
  expect(onPlace).not.toHaveBeenCalled();

  location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 10.9, longitude: 106.8 } } as never);
  geo.reverse.mockResolvedValue({ formattedAddress: 'Vị trí của bạn' } as never);
  await act(async () => { await button().props.onPress(); });
  expect(onPlace).toHaveBeenCalledWith(10.9, 106.8);
  expect(onPlace).toHaveBeenLastCalledWith(10.9, 106.8, { formattedAddress: 'Vị trí của bạn' });
});

test('shows the ward and province under the field once known', async () => {
  await render({ ward: 'Bến Nghé', province: 'TP.HCM', lat: 10.77, lng: 106.7 });
  expect(JSON.stringify(tree.toJSON())).toContain('Bến Nghé, TP.HCM');
});
