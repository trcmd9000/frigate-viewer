module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'helpers/**/*.{ts,tsx}',
    'store/**/*.{ts,tsx}',
    'views/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.{ts,tsx}',
    '!**/messages.tsx',
  ],
  coverageThreshold: {
    global: {
      lines: 50,
      functions: 50,
      branches: 40,
      statements: 50,
    },
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '__tests__',
  ],
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
  ],
};
