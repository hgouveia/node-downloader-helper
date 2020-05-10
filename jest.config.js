// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // The test environment that will be used for testing
  testEnvironment: "node",

  // A map from regular expressions to paths to transformers
  // transform: undefined,
  transform : {
    '^.+\\.[jt]sx?$': require.resolve('babel-jest')
  }
};
