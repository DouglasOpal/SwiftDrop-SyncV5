// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch:       ['**/tests/**/*.test.js'],
  testTimeout:     30000,
  collectCoverageFrom: ['src/**/*.js', '!src/utils/seed.js'],
  coverageThreshold: {
    global: { branches: 60, functions: 70, lines: 70, statements: 70 },
  },
};
