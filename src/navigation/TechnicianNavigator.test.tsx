import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianNavigator from './TechnicianNavigator';
jest.mock('lucide-react-native', () => ({ Home: () => null, MailOpen: () => null, Briefcase: () => null, Wallet: () => null, User: () => null }));
jest.mock('@react-navigation/bottom-tabs', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return { createBottomTabNavigator: () => ({ Navigator: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children), Screen: (props: Record<string, unknown>) => R.createElement('tab-screen', props) }) };
});
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));
jest.mock('../store', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'fixture-tech' } }) }));
jest.mock('../hooks/useTechnicianLocationPing', () => ({ useTechnicianLocationPing: jest.fn() }));
jest.mock('../hooks/useInvitationCount', () => ({ useInvitationCount: () => 0 }));
jest.mock('../api/notifications.api', () => ({ notificationsApi: { getCountUnread: jest.fn() } }));
jest.mock('../components/navigation/GlassTabBar', () => ({ GlassTabBar: () => null }));
jest.mock('../components/navigation/AvatarTabIcon', () => ({ AvatarTabIcon: () => null }));
jest.mock('../screens/technician/TechnicianHomeScreen', () => () => null);
jest.mock('../screens/technician/TechnicianInvitationsScreen', () => () => null);
jest.mock('../screens/technician/TechnicianJobsScreen', () => () => null);
jest.mock('../screens/technician/TechnicianWalletScreen', () => () => null);
jest.mock('../screens/technician/TechnicianProfileScreen', () => () => null);
test('five Technician tabs expose Wallet fourth and retain Home/Invitations/Jobs/Profile', async () => {
  let tree!: ReactTestRenderer; await act(async () => { tree = create(<TechnicianNavigator />); });
  const tabs = tree.root.findAll(item => item.type === ('tab-screen' as unknown));
  expect(tabs.map(item => item.props.name)).toEqual(['Home', 'Invitations', 'Jobs', 'Wallet', 'Profile']);
  expect(tabs[3].props.options.title).toBe('Ví');
  await act(async () => tree.unmount());
});
