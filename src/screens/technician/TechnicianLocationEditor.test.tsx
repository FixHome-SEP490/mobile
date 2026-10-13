import React from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianLocationEditor from './TechnicianLocationEditor';
import { usersApi } from '../../api/users.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
jest.mock('lucide-react-native', () => ({ LocateFixed: () => null, MapPin: () => null }));
jest.mock('../../api/users.api', () => ({ usersApi: { getAddresses: jest.fn(), createAddress: jest.fn(), updateAddress: jest.fn() } }));
jest.mock('../../api/technician-profile.api', () => ({ technicianProfileApi: { getMyProfile: jest.fn(), updateMyProfile: jest.fn() } }));
jest.mock('../../api/geo.api', () => ({ geoApi: { autocomplete: jest.fn(), reverse: jest.fn() } }));
jest.mock('../../components/AddressMap', () => ({ __esModule: true, default: () => null, Marker: () => null }));
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 1 } }));
const users = usersApi as jest.Mocked<typeof usersApi>, profile = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const address = { id: 'fixture-address', line1: 'Địa chỉ kiểm thử', ward: 'Phường kiểm thử', district: 'Quận kiểm thử', province: 'Tỉnh kiểm thử', lat: 10.5, lng: 106.5, isDefault: true };
async function render() { let tree!: ReactTestRenderer; await act(async () => { tree = create(<TechnicianLocationEditor />); }); return tree; }
beforeEach(() => { jest.clearAllMocks(); users.getAddresses.mockResolvedValue([address] as never); profile.getMyProfile.mockResolvedValue({ serviceRadiusKm: 12 } as never); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());
test.each(['0', '41', '', 'invalid'])('preserves 40km guard and sends no writes for %s', async radius => {
  const tree = await render(); await act(async () => tree.root.findByProps({ accessibilityLabel: 'Bán kính hoạt động (km)' }).props.onChangeText(radius));
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Lưu vị trí và bán kính' }).props.onPress());
  expect(profile.updateMyProfile).not.toHaveBeenCalled(); expect(users.updateAddress).not.toHaveBeenCalled(); expect(Alert.alert).toHaveBeenCalledWith('Lỗi', 'Bán kính hoạt động từ 1 đến 40 km.');
  await act(async () => tree.unmount());
});
test('explicit 40km save keeps the existing separate address/profile payloads', async () => {
  const tree = await render(); await act(async () => tree.root.findByProps({ accessibilityLabel: 'Bán kính hoạt động (km)' }).props.onChangeText('40'));
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Lưu vị trí và bán kính' }).props.onPress());
  expect(users.updateAddress).toHaveBeenCalledWith(address.id, expect.objectContaining({ line1: address.line1, lat: address.lat, lng: address.lng, isDefault: true }));
  expect(profile.updateMyProfile).toHaveBeenCalledWith({ serviceRadiusKm: 40 });
  await act(async () => tree.unmount());
});
test('failed profile GET exposes retry and never mounts save', async () => {
  profile.getMyProfile.mockRejectedValueOnce(new Error('offline')); const tree = await render();
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Lưu vị trí và bán kính' })).toHaveLength(0);
  expect(profile.updateMyProfile).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
