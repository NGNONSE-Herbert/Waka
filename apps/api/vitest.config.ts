import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC est nécessaire pour émettre les métadonnées de décorateurs (injection NestJS) — esbuild ne le fait pas.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
