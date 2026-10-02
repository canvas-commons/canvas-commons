import {tmpdir} from 'node:os';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  server: {fs: {allow: ['.', tmpdir()]}},
  test: {
    include: ['./tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['geometry-polyfill'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
