import React from 'react';
import { act, create } from 'react-test-renderer';
import { bookingsApi } from '../api/bookings.api';
import RebookSheet from './RebookSheet';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('../api/bookings.api', () => ({ bookingsApi: { availableSessions: jest.fn(), rebook: jest.fn() } }));

const api = bookingsApi as jest.Mocked<typeof bookingsApi>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

async function mount() {
  api.availableSessions.mockResolvedValue({
    technicianId: 'tech-1',
    sessions: [{ date: '2030-10-21', slot: 'morning', label: 'Sáng 21/10', available: true, reason: null }],
  });
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<RebookSheet bookingId="b1" visible onClose={jest.fn()} />); });
  await flush();
  return r;
}

beforeEach(() => jest.clearAllMocks());

describe('RebookSheet', () => {
  it('asks for a session before booking', async () => {
    const r = await mount();
    await act(async () => { r.root.findByProps({ testID: 'rebook-confirm' }).props.onPress(); });
    expect(api.rebook).not.toHaveBeenCalled();
    act(() => r.unmount());
  });

  it('rebooks the chosen session and opens the new booking when the old technician was invited', async () => {
    api.rebook.mockResolvedValue({ booking: { id: 'nb' } as never, previousTechnicianInvited: true });
    const r = await mount();
    act(() => r.root.findByProps({ testID: 'rebook-session-2030-10-21-morning' }).props.onPress());
    await act(async () => { r.root.findByProps({ testID: 'rebook-confirm' }).props.onPress(); });
    await flush();
    expect(api.rebook).toHaveBeenCalledWith('b1', { date: '2030-10-21', slot: 'morning' });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerBookingDetail', { bookingId: 'nb' });
    act(() => r.unmount());
  });

  it('sends the customer to choose a technician when the old one was not invited', async () => {
    api.rebook.mockResolvedValue({ booking: { id: 'nb' } as never, previousTechnicianInvited: false });
    const r = await mount();
    act(() => r.root.findByProps({ testID: 'rebook-session-2030-10-21-morning' }).props.onPress());
    await act(async () => { r.root.findByProps({ testID: 'rebook-confirm' }).props.onPress(); });
    await flush();
    expect(mockNavigate).toHaveBeenCalledWith('CustomerMatching', { bookingId: 'nb' });
    act(() => r.unmount());
  });
});
