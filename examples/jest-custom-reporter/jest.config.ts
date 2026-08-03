import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: [
    'default',
    ['./jest-eval-reporter', { outDir: '.evals_output', project: 'my-agent' }],
  ],
};

export default config;
