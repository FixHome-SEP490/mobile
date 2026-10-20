import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TechnicianNavigator from './TechnicianNavigator';
jest.mock('lucide-react-native', () => ({ Home: () => null, MailOpen: () => null, Briefcase: () => null, Bell: () => null, User: () => null }));
jest.mock('@react-navigation/bottom-tabs', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return { createBottomTabNavigator: () => ({ Navigator: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children), Screen: (props: Record<string, unknown>) => R.createElement('tab-screen', props) }) };
});
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));
jest.mock('../store/badge.store', () => ({ useBadgeStore: (selector: (s: unknown) => unknown) => selector({ unreadNotifications: 0, setUnreadNotifications: jest.fn() }) }));
jest.mock('../store', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'fixture-tech' } }) }));
jest.mock('../hooks/useTechnicianLocationPing', () => ({ useTechnicianLocationPing: jest.fn() }));
jest.mock('../hooks/useInvitationCount', () => ({ useInvitationCount: () => 0 }));
jest.mock('../api/notifications.api', () => ({ notificationsApi: { getCountUnread: jest.fn() } }));
jest.mock('../components/navigation/GlassTabBar', () => ({ GlassTabBar: () => null }));
jest.mock('../components/navigation/AvatarTabIcon', () => ({ AvatarTabIcon: () => null }));
jest.mock('../screens/technician/TechnicianHomeScreen', () => () => null);
jest.mock('../screens/technician/TechnicianInvitationsScreen', () => () => null);
jest.mock('../screens/technician/TechnicianJobsScreen', () => () => null);
jest.mock('../screens/technician/TechnicianNotificationsScreen', () => () => null);
jest.mock('../screens/technician/TechnicianProfileScreen', () => () => null);
test('five Technician tabs expose Notifications fourth and retain Home/Invitations/Jobs/Profile', async () => {
  let tree!: ReactTestRenderer; await act(async () => { tree = create(<TechnicianNavigator />); });
  const tabs = tree.root.findAll(item => item.type === ('tab-screen' as unknown));
  expect(tabs.map(item => item.props.name)).toEqual(['Home', 'Invitations', 'Jobs', 'Notifications', 'Profile']);
  expect(tabs[3].props.options.title).toBe('Thông báo');
  await act(async () => tree.unmount());
});
