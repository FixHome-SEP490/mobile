import CustomerGuestHomeScreen from './CustomerGuestHomeScreen';
import CustomerHomeScreen from '../customer/CustomerHomeScreen';
jest.mock('../customer/CustomerHomeScreen', () => ({ __esModule: true, default: jest.fn() }));
test('Guest reuses the exact production Customer Home component', () => {
  expect(CustomerGuestHomeScreen).toBe(CustomerHomeScreen);
});
