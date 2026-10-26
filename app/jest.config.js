module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Orden 34: Reanimated 4 y Worklets en su versión JS (sin módulo nativo).
  resolver: 'react-native-reanimated/jest/resolver',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
