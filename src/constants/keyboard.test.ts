import { appSources } from '../test-utils/source-files';

describe('KEYBOARD_AVOIDING_BEHAVIOR', () => {
  it('pads on Android too, where the edge-to-edge window is not resized for the keyboard', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
      expect(jest.requireActual<typeof import('./keyboard')>('./keyboard').KEYBOARD_AVOIDING_BEHAVIOR).toBe('padding');
    });
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
      expect(jest.requireActual<typeof import('./keyboard')>('./keyboard').KEYBOARD_AVOIDING_BEHAVIOR).toBe('padding');
    });
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      expect(jest.requireActual<typeof import('./keyboard')>('./keyboard').KEYBOARD_AVOIDING_BEHAVIOR).toBeUndefined();
    });
  });

  it('is not bypassed by an iOS-only behaviour that leaves Android inputs under the keyboard', () => {
    const offenders = appSources()
      .filter(([, text]) => /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('every screen-level KeyboardAvoidingView uses the shared behaviour', () => {
    // BookingActionBar lifts only its own sticky bar (height on Android) and sits inside screens that already pad.
    const offenders = appSources()
      .filter(([file]) => file !== 'components/BookingActionBar.tsx')
      .filter(([, text]) => /<KeyboardAvoidingView\b/.test(text))
      .filter(([, text]) => (text.match(/<KeyboardAvoidingView\b[^>]*>/g) ?? []).some(tag => !tag.includes('KEYBOARD_AVOIDING_BEHAVIOR')))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
