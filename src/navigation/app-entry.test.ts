import { appEntryRoute } from './app-entry';
test('first install enters role choice, returning guest enters Home, sessions enter their role', () => {
  expect(appEntryRoute(false, null, false, 0)).toBe('CustomerRoleChoice');
  expect(appEntryRoute(false, null, true, 0)).toBe('CustomerGuestHome');
  expect(appEntryRoute(false, null, false, 2)).toBe('CustomerGuestHome');
  expect(appEntryRoute(true, 'customer', false, 1)).toBe('CustomerMain');
  expect(appEntryRoute(true, 'technician', false, 1)).toBe('TechnicianMain');
});
