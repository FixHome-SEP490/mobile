jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { hostUri: 'dev-machine.local:8081' } } }));

describe('API URL on Expo devices', () => {
  const original = process.env.EXPO_PUBLIC_API_BASE_URL;
  afterEach(() => { if (original === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = original; });
  function config(platform: string, hostUri?: string, dev = true, scriptURL?: string) {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: platform }, NativeModules: { SourceCode: { scriptURL } } }));
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { hostUri } } }));
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    return jest.requireActual('./config').APP_CONFIG.API_BASE_URL;
  }
  beforeEach(() => { delete process.env.EXPO_PUBLIC_API_BASE_URL; });
  test('physical iPhone uses Metro LAN host with backend port', () => { expect(config('ios', 'dev-machine.local:8081')).toBe('http://dev-machine.local:3000/api/v1'); });
  test('physical Android also uses Metro LAN host', () => { expect(config('android', 'dev-machine.local:8081')).toBe('http://dev-machine.local:3000/api/v1'); });
  test('Web keeps localhost even with Metro host', () => { expect(config('web', 'dev-machine.local:8081')).toBe('http://localhost:3000/api/v1'); });
  test('Android emulator keeps host bridge when Metro is loopback', () => { expect(config('android', 'localhost:8081')).toBe('http://10.0.2.2:3000/api/v1'); });
  test('iOS simulator keeps localhost fallback', () => { expect(config('ios')).toBe('http://localhost:3000/api/v1'); });
  test('explicit URL takes priority', () => { process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com/api/v1'; expect(config('ios', 'dev-machine.local:8081')).toBe('https://api.example.com/api/v1'); });
  test.each(['bad host:8081', 'user:password@host:8081', 'host:8081/path', 'host:99999', 'dev.exp.direct:8081'])('rejects unsafe or tunnel Metro host %s', host => { expect(config('ios', host)).toBe('http://localhost:3000/api/v1'); });
  test('falls back to native bundle URL if hostUri is absent', () => { expect(config('ios', undefined, true, 'http://dev-machine.local:8081/index.bundle?platform=ios')).toBe('http://dev-machine.local:3000/api/v1'); });
  test('production does not infer API host from Metro', () => { expect(config('ios', 'dev-machine.local:8081', false)).toBe('http://localhost:3000/api/v1'); });
});
