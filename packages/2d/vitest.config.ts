import {configDefaults, defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./src/lib/**/*.test.*'],
    exclude: [...configDefaults.exclude, '**/*.sweep.test.*'],
    environment: 'jsdom',
    setupFiles: ['geometry-polyfill'],
  },
});
