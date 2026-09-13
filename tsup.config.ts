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
        external: ['nodemailer'],
    },
    {
        entry: ['src/cli/index.ts'],
        outDir: 'dist/cli',
        format: ['esm'],
        target: 'node20',
        dts: true,
        sourcemap: true,
        splitting: false,
        external: ['nodemailer'],
        banner: { js: '#!/usr/bin/env node' },
    },
]);