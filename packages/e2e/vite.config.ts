/// <reference types="vitest" />

import canvasCommons from '@canvas-commons/vite-plugin';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    canvasCommons.default({
      project: [
        './tests/projects/circle.ts',
        './tests/projects/rect.ts',
        './tests/projects/code-highlighting.ts',
        './tests/projects/code-tweening.ts',
        './tests/projects/code-editing.ts',
        './tests/projects/code-morphing.ts',
        './tests/projects/latex-tweening.ts',
        './tests/projects/layout.ts',
        './tests/projects/node-signal.ts',
        './tests/projects/position-tweening.ts',
        './tests/projects/text-positioning.ts',
        './tests/projects/spline-tweening.ts',
        './tests/projects/tweening-linear.ts',
      ],
    }),
  ],
  test: {
    testTimeout: 60000,
    minThreads: 1,
    maxThreads: 1,
    maxConcurrency: 1,
  },
});
