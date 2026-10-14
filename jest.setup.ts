// Use the library-provided in-memory mock for all Jest suites.
// Production native AsyncStorage is not available in Node/Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
