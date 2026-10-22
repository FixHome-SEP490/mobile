// Use the library-provided in-memory mock for all Jest suites.
// Production native AsyncStorage is not available in Node/Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Icon fonts cannot load under Jest; tests that assert on icons mock this module themselves.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// Native video cannot load under Jest; screens that show videos get inert stand-ins.
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => undefined }), play: () => undefined }), VideoView: () => null }));

// Lucide ships ESM only; icons render nothing under Jest. Tests that assert on icons mock it themselves.
jest.mock('lucide-react-native', () => new Proxy({ __esModule: true }, { get: (target, name) => (name in target ? (target as Record<string | symbol, unknown>)[name] : () => null) }));

// Reanimated-backed bottom sheet cannot load under Jest: an always-open sheet with plain RN stand-ins.
// Tests that drive the sheet (present/dismiss) mock this module themselves.
jest.mock('@gorhom/bottom-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const BottomSheetModal = ReactModule.forwardRef((props: { children?: unknown }, ref: unknown) => {
    ReactModule.useImperativeHandle(ref, () => ({ present: () => undefined, dismiss: () => undefined }));
    return ReactModule.createElement(Native.View, null, props.children);
  });
  return { BottomSheetBackdrop: () => null, BottomSheetModal, BottomSheetScrollView: Native.ScrollView, BottomSheetTextInput: Native.TextInput };
});
