import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Location from 'expo-location';
import { technicianProfileApi } from '../api/technician-profile.api';
import { useTechnicianLocationPing } from './useTechnicianLocationPing';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('../api/technician-profile.api', () => ({
  technicianProfileApi: { getMyProfile: jest.fn(), reportLocation: jest.fn() },
}));

const api = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const loc = Location as jest.Mocked<typeof Location>;

function Probe() { useTechnicianLocationPing(true); return null; }
async function mount() {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<Probe />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  act(() => r.unmount());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  loc.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2, accuracy: 50 } } as never);
});

describe('useTechnicianLocationPing', () => {
  it('reports when the technician is available', async () => {
    api.getMyProfile.mockResolvedValue({ isAvailable: true } as never);
    await mount();
    expect(api.reportLocation).toHaveBeenCalledWith({ lat: 1, lng: 2, accuracyMeters: 50 });
  });
  it('stays silent when available is off', async () => {
    api.getMyProfile.mockResolvedValue({ isAvailable: false } as never);
    await mount();
    expect(api.reportLocation).not.toHaveBeenCalled();
  });
  it('drops fixes worse than 1 km', async () => {
    api.getMyProfile.mockResolvedValue({ isAvailable: true } as never);
    loc.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2, accuracy: 1500 } } as never);
    await mount();
    expect(api.reportLocation).not.toHaveBeenCalled();
  });
});
