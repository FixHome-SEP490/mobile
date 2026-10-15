// Use the library-provided in-memory mock for all Jest suites.
// Production native AsyncStorage is not available in Node/Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Icon fonts cannot load under Jest; tests that assert on icons mock this module themselves.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
