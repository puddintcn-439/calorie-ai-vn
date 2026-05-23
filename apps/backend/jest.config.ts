import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        // inherit from root tsconfig but disable incremental for tests
        module: 'commonjs',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        strictNullChecks: true,
        noImplicitAny: true,
        allowSyntheticDefaultImports: true,
        target: 'ES2021',
        skipLibCheck: true,
      },
    }],
  },
  collectCoverageFrom: [
    '**/*.service.ts',
    '!**/node_modules/**',
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/*.dto.ts',
    '!**/*.strategy.ts',
    '!**/*.guard.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'text-summary'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 65,
      lines: 65,
      statements: 64,
    },
  },
  moduleNameMapper: {
    '^@calorie-ai/types$': '<rootDir>/../../../packages/types/src/index.ts',
  },
  testEnvironment: 'node',
};

export default config;
