import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import PublicOrderTrackingScreen from './PublicOrderTrackingScreen';
import { PublicOrderTrackingRateLimitError, publicOrderTrackingApi } from '../../api/public-order-tracking.api';

const mockNavigate = jest.fn();
let mockFocusCleanup: (() => void) | null = null;
let mockIsFocused = true;
const mockAppStateListeners: ((state: string) => void)[] = [];
const makeActiveResult = (updatedAt = new Date().toISOString()) => ({
  code: 'FH-20261017-AB12CD34', status: 'EN_ROUTE' as const, serviceName: 'Sửa điều hòa',
  technician: { fullName: 'Kỹ thuật viên A' },
  destination: { lat: 10.75, lng: 106.67 },
  technicianLocation: { lat: 10.76, lng: 106.68, updatedAt },
  timeline: [{ status: 'EN_ROUTE', timestamp: updatedAt }],
});
let mockActiveResult = makeActiveResult();
let mockCompletedResult = { ...mockActiveResult, status: 'COMPLETED' as const, technicianLocation: null };
const APP_STATE_TEST_NOW = Date.parse('2026-10-17T12:00:00.000Z');

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
    useIsFocused: () => mockIsFocused,
    useFocusEffect: (callback: () => void | (() => void)) => ReactActual.useEffect(() => {
      if (!mockIsFocused) return undefined;
      const cleanup = callback();
      mockFocusCleanup = cleanup ?? null;
      return () => {
        cleanup?.();
        if (mockFocusCleanup === cleanup) mockFocusCleanup = null;
      };
    }, [callback, mockIsFocused]),
  };
});
jest.mock('react-native-maps', () => {
  const ReactActual = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  const MapView = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactActual.createElement(Native.View, { ...props, testID: 'public-tracking-native-map' }, children);
  const Marker = (props: Record<string, unknown>) => ReactActual.createElement(Native.View, props);
  return { __esModule: true, default: MapView, Marker };
});
jest.mock('../../components/BackButton', () => () => null);
jest.mock('../../api/public-order-tracking.api', () => {
  const actual = jest.requireActual('../../api/public-order-tracking.api');
  return { ...actual, publicOrderTrackingApi: { lookup: jest.fn() } };
});

const api = publicOrderTrackingApi as jest.Mocked<typeof publicOrderTrackingApi>;
const inputs = { orderCode: 'FH-20261017-AB12CD34', phone: '0900000000' };
const originalAppState = AppState.currentState;

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<PublicOrderTrackingScreen />); });
  return tree;
}

function visibleText(tree: ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map(node => String(node.props.children ?? '')).join(' ');
}

describe('PublicOrderTrackingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCleanup = null;
    mockIsFocused = true;
    mockAppStateListeners.length = 0;
    mockActiveResult = makeActiveResult();
    mockCompletedResult = { ...mockActiveResult, status: 'COMPLETED', technicianLocation: null };
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      mockAppStateListeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as never;
    });
    api.lookup.mockResolvedValue(mockActiveResult);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState });
  });

  it('looks up by code and registered phone without exposing technician contact details', async () => {
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(api.lookup).toHaveBeenCalledWith(inputs);
    expect(visibleText(tree)).toContain('FH-20261017-AB12CD34');
    expect(visibleText(tree)).toContain('Đang cập nhật');
    expect(tree.root.findByProps({ testID: 'public-tracking-map' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'public-tracking-technician-marker' }).props.coordinate).toEqual({ latitude: 10.76, longitude: 106.68 });
    expect(tree.root.findByProps({ testID: 'public-tracking-destination-marker' }).props.coordinate).toEqual({ latitude: 10.75, longitude: 106.67 });
    expect(visibleText(tree)).not.toContain(inputs.phone);
    expect(visibleText(tree)).not.toContain('10.76');
    await act(async () => tree.unmount());
  });

  it('uses one generic mismatch message', async () => {
    api.lookup.mockRejectedValueOnce(new Error('Không tìm thấy đơn hàng phù hợp với mã đơn và số điện thoại đã nhập.'));
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(visibleText(tree)).toContain('Không tìm thấy đơn hàng phù hợp với mã đơn và số điện thoại đã nhập.');
    await act(async () => tree.unmount());
  });

  it('treats an unresolved initial AppState as foreground after the lifecycle effect initializes it', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(APP_STATE_TEST_NOW);
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: null });
    api.lookup.mockResolvedValueOnce(makeActiveResult(new Date(APP_STATE_TEST_NOW).toISOString()));
    const tree = await mount();
    await act(async () => { await Promise.resolve(); });
    expect(mockAppStateListeners).toHaveLength(1);
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(1);
    await act(async () => tree.unmount());
  });

  it('hides technician coordinates older than two minutes', async () => {
    api.lookup.mockResolvedValueOnce({
      ...mockActiveResult,
      technicianLocation: { ...mockActiveResult.technicianLocation, updatedAt: new Date(Date.now() - 121000).toISOString() },
    });
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(visibleText(tree)).toContain('Chưa có vị trí mới từ thợ.');
    expect(visibleText(tree)).not.toContain('Đang cập nhật ·');
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it('clears the displayed location update when its map coordinates age past two minutes', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>);
    const updatedAt = new Date().toISOString();
    api.lookup.mockResolvedValueOnce({
      ...mockActiveResult,
      technicianLocation: { ...mockActiveResult.technicianLocation, updatedAt },
    });
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(120001); await Promise.resolve(); });
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    expect(visibleText(tree)).toContain('Chưa có vị trí mới từ thợ.');
    expect(visibleText(tree)).not.toContain('Đang cập nhật ·');
    await act(async () => tree.unmount());
  });

  it('shows 429 backoff and stops automatic polling', async () => {
    jest.useFakeTimers();
    api.lookup.mockRejectedValueOnce(new PublicOrderTrackingRateLimitError(30000));
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(visibleText(tree)).toContain('thử lại sau 30 giây');
    await act(async () => { jest.advanceTimersByTime(60000); await Promise.resolve(); });
    expect(api.lookup).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  it('polls every 15 seconds only while active and clears GPS after a terminal status', async () => {
    jest.useFakeTimers();
    const staleTime = new Date().toISOString();
    api.lookup.mockResolvedValueOnce({ ...mockActiveResult, technicianLocation: { ...mockActiveResult.technicianLocation, updatedAt: staleTime } });
    api.lookup.mockResolvedValueOnce(mockCompletedResult);
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(api.lookup).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(15000); await Promise.resolve(); });
    expect(api.lookup).toHaveBeenCalledTimes(2);
    expect(visibleText(tree)).toContain('Hoàn thành');
    expect(tree.root.findAllByProps({ testID: 'public-tracking-location' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(30000); await Promise.resolve(); });
    expect(api.lookup).toHaveBeenCalledTimes(2);
    await act(async () => tree.unmount());
  });

  it('clears guest fields and GPS on background and does not poll while backgrounded', async () => {
    jest.useFakeTimers();
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(1);
    await act(async () => { mockAppStateListeners.forEach(listener => listener('background')); });
    expect(tree.root.findByProps({ testID: 'public-tracking-code' }).props.value).toBe('');
    expect(tree.root.findByProps({ testID: 'public-tracking-phone' }).props.value).toBe('');
    expect(tree.root.findAllByProps({ testID: 'public-tracking-location' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(30000); await Promise.resolve(); });
    expect(api.lookup).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  it('hides the map when an active response has no valid technician coordinate pair', async () => {
    api.lookup.mockResolvedValueOnce({
      ...mockActiveResult,
      technicianLocation: { lat: 10.76, lng: 190, updatedAt: new Date().toISOString() },
    });
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it('shows the active order without a map when the server returns no technician GPS', async () => {
    api.lookup.mockResolvedValueOnce({ ...mockActiveResult, technicianLocation: null });
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(visibleText(tree)).toContain('Chưa có vị trí mới từ thợ.');
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'public-tracking-technician-marker' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'public-tracking-destination-marker' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it('clears the map as soon as either search field changes', async () => {
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(1);
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText('FH-OTHER-CODE'));
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it('clears the map immediately when the screen loses focus', async () => {
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText(inputs.orderCode));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(1);
    mockIsFocused = false;
    await act(async () => tree.update(<PublicOrderTrackingScreen />));
    expect(tree.root.findAllByProps({ testID: 'public-tracking-map' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'public-tracking-code' }).props.value).toBe('');
    await act(async () => tree.unmount());
  });

  it('ignores a late result from an earlier code and phone query', async () => {
    let resolveOld!: (value: typeof mockActiveResult) => void;
    api.lookup.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    api.lookup.mockResolvedValueOnce({ ...mockActiveResult, code: 'FH-NEW-CODE' });
    const tree = await mount();
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText('FH-OLD-CODE'));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-phone' }).props.onChangeText(inputs.phone));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-code' }).props.onChangeText('FH-NEW-CODE'));
    await act(async () => tree.root.findByProps({ testID: 'public-tracking-submit' }).props.onPress());
    await act(async () => { resolveOld(mockActiveResult); });
    expect(visibleText(tree)).toContain('FH-NEW-CODE');
    expect(visibleText(tree)).not.toContain('FH-OLD-CODE');
    await act(async () => tree.unmount());
  });
});
