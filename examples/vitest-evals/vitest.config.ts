import { defineConfig } from 'vitest/config';
import VitestEvalReporter from './vitest-eval-reporter.js';

export default defineConfig({
  test: {
    include: ['**/*.eval.ts'],
    reporters: [
      'verbose',
      new VitestEvalReporter({ outDir: '.evals_output', project: 'eval-reports-example' }),
    ],
  },
});
