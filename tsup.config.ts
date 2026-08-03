import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: ['src/index.ts'],
        outDir: 'dist',
        format: ['esm'],
        target: 'node20',
        dts: true,
        sourcemap: true,
        clean: true,
        splitting: false,
    },
    {
        entry: ['src/cli/index.ts'],
        outDir: 'dist/cli',
        format: ['esm'],
        target: 'node20',
        dts: true,
        sourcemap: true,
        splitting: false,
        banner: { js: '#!/usr/bin/env node' },
    },
]);