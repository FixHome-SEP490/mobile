// src/screens/onboarding/CustomerOnboardingScreen.test.tsx
import React from 'react';
import CustomerOnboardingScreen, { CUSTOMER_ONBOARDING_SLIDES } from './CustomerOnboardingScreen';

const mockReset = jest.fn();
const mockNavigate = jest.fn();
const mockMarkSeen = jest.fn(async () => undefined);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, reset: mockReset }),
}));

jest.mock('react-native-safe-area-context', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});

jest.mock('lucide-react-native', () => {
  // Jest hoists this factory before module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Icon = () => ReactModule.createElement(Native.View, null);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('../../services/customer-first-run', () => ({
  markCustomerFirstRunSeen: () => mockMarkSeen(),
}));

type TestNode = {
  props: { onPress?: (...args: never[]) => unknown; [key: string]: unknown };
};
type TestRenderer = { root: { findByProps: (props: Record<string, unknown>) => TestNode } };
const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => TestRenderer;
};

beforeEach(() => {
  mockReset.mockClear();
  mockNavigate.mockClear();
  mockMarkSeen.mockClear();
});

describe('CustomerOnboardingScreen keeps three locked slides', () => {
  it('exposes exactly three slides', () => {
    expect(CUSTOMER_ONBOARDING_SLIDES).toHaveLength(3);
    expect(CUSTOMER_ONBOARDING_SLIDES.map((slide) => slide.title)).toEqual([
      'Nhà cần sửa.',
      'Bạn chọn việc.',
      'Việc sửa xong.',
    ]);
  });

  it('Continue advances without storage writes; Skip persists and exits to GuestHome', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerOnboardingScreen />);
    });
    expect(mockMarkSeen).not.toHaveBeenCalled();

    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tiếp tục bước tiếp theo' }).props.onPress?.();
    });
    // Still on step 2: no write on Continue.
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: 'Bước 2 trên 3' })).toBeDefined();

    await act(async () => {
      await tree.root.findByProps({ accessibilityLabel: 'Bỏ qua giới thiệu' }).props.onPress?.();
    });
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
  });

  it('Bắt đầu on the final slide persists and exits to GuestHome', async () => {
    let tree!: TestRenderer;
    await act(async () => {
      tree = create(<CustomerOnboardingScreen />);
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tiếp tục bước tiếp theo' }).props.onPress?.();
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tiếp tục bước tiếp theo' }).props.onPress?.();
    });
    await act(async () => {
      await tree.root.findByProps({ accessibilityLabel: 'Bắt đầu dùng FixHome' }).props.onPress?.();
    });
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
  });
});
