import { backOrJobs } from './double-back';

jest.mock('../../../store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { role: 'technician' } }) } }));
const mockNavigate = jest.fn();
jest.mock('../navigation/resume-order', () => ({ goJobsKeepingFlow: () => mockNavigate('TechnicianMain', { screen: 'Jobs' }) }));
jest.mock('../../../navigation/root-navigation', () => ({ rootNavigationRef: { isReady: () => true, navigate: (...a: unknown[]) => mockNavigate(...a) } }));

describe('backOrJobs', () => {
  it('goes back once, then to the Jobs tab on a quick second press', async () => {
    const back = jest.fn();
    backOrJobs(back, 10_000);
    expect(back).toHaveBeenCalledTimes(1);
    backOrJobs(back, 10_500);
    await new Promise((r) => setTimeout(r, 0));
    expect(back).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('TechnicianMain', { screen: 'Jobs' });
  });
});
