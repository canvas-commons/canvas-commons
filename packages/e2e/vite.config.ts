/// <reference types="vitest" />

import canvasCommons from '@canvas-commons/vite-plugin';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    canvasCommons.default({
      project: ['./tests/project.ts'],
    }),
  ],
  test: {
    testTimeout: 60000,
  },
});
