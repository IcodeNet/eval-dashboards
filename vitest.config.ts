import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        /** CLI tests spawn `pnpm cli:dev`, which exceeds the 5s default when the machine is busy. */
        testTimeout: 30_000,
    },
});
