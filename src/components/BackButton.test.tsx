import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BackButton from './BackButton';

const mockNav = { canGoBack: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
let mockRole: string | undefined;
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('../store', () => ({ useAuthStore: { getState: () => ({ user: mockRole ? { role: mockRole } : null }) } }));
jest.mock('../constants/theme', () => ({ useAppTheme: () => ({ colors: { text: '#000' } }) }));

const press = async (el: React.ReactElement) => {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(el); });
  await act(async () => r.root.findByType(TouchableOpacity).props.onPress());
  return r;
};

beforeEach(() => { jest.clearAllMocks(); mockRole = undefined; });

it('goes back when history exists', async () => {
  mockNav.canGoBack.mockReturnValue(true);
  await press(<BackButton />);
  expect(mockNav.goBack).toHaveBeenCalled();
  expect(mockNav.navigate).not.toHaveBeenCalled();
});

it.each([['technician', 'TechnicianMain'], ['customer', 'CustomerMain'], [undefined, 'CustomerGuestHome']])('with no history %s goes to %s', async (role, home) => {
  mockNav.canGoBack.mockReturnValue(false);
  mockRole = role;
  await press(<BackButton />);
  expect(mockNav.goBack).not.toHaveBeenCalled();
  expect(mockNav.navigate).toHaveBeenCalledWith(home);
});

it('is a 44pt labelled button and honours a custom handler', async () => {
  const onPress = jest.fn();
  const r = await press(<BackButton onPress={onPress} label="Đóng" />);
  const t = r.root.findByType(TouchableOpacity);
  expect(t.props.accessibilityLabel).toBe('Đóng');
  expect(t.props.style).toMatchObject({ width: 44, height: 44 });
  expect(onPress).toHaveBeenCalled();
});
