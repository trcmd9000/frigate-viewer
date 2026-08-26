/* global jest */

// Jest setup file - minimal configuration
// Avoid circular dependencies with mocks

// Global test setup
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
});
