import React from 'react';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import { technicianProfileApi } from '../api/technician-profile.api';
import { walletApi } from '../api/wallet.api';
import { useTechnicianAvailability } from './useTechnicianAvailability';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(cb, [cb]) }));
jest.mock('../api/technician-profile.api', () => ({
  technicianProfileApi: { getMyProfile: jest.fn(), updateMyProfile: jest.fn(), getMyAvailability: jest.fn() },
}));
jest.mock('../api/wallet.api', () => ({ walletApi: { getMyWallet: jest.fn() } }));

const profileApi = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;
const wallet = walletApi as jest.Mocked<typeof walletApi>;

const seen: { hook?: ReturnType<typeof useTechnicianAvailability> } = {};
function Probe() {
  const hook = useTechnicianAvailability();
  React.useEffect(() => { seen.hook = hook; });
  return null;
}
const current = () => seen.hook!;
async function mount() {
  await act(async () => { create(<Probe />); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  profileApi.getMyProfile.mockResolvedValue({ isAvailable: false, autoAcceptInvitations: false } as never);
  profileApi.getMyAvailability.mockResolvedValue({ state: 'paused', receiving: false, until: null, nextStartAt: null });
});

describe('useTechnicianAvailability', () => {
  it('exposes the schedule-aware status', async () => {
    await mount();
    expect(current().status?.title).toBe('Tạm nghỉ nhận đơn');
  });

  it('refuses to switch on below the deposit floor', async () => {
    wallet.getMyWallet.mockResolvedValue({ eligibleForJobs: false, minimumBalance: 200000 } as never);
    await mount();
    await act(async () => { await current().toggle(); });
    expect(profileApi.updateMyProfile).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Ví chưa đủ mức ký quỹ', expect.stringContaining('200.000'));
  });

  it('switches on when the wallet is eligible', async () => {
    wallet.getMyWallet.mockResolvedValue({ eligibleForJobs: true, minimumBalance: 200000 } as never);
    profileApi.updateMyProfile.mockResolvedValue({ isAvailable: true } as never);
    await mount();
    await act(async () => { await current().toggle(); });
    expect(profileApi.updateMyProfile).toHaveBeenCalledWith({ isAvailable: true });
  });
});
