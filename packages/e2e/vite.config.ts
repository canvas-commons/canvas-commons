/// <reference types="vitest" />

import svg from '@canvas-commons/svg';
import canvasCommons from '@canvas-commons/vite-plugin';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    canvasCommons({
      project: ['./tests/projects/*.ts'],
    }),
    svg(),
  ],
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('..', import.meta.url)),
        fileURLToPath(new URL('../..', import.meta.url)),
      ],
    },
  },
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    globalSetup: ['./src/globalSetup.ts'],
    // The shared browser handle lives in the test process as a module
    // singleton (see src/app.ts). Multi-fork or parallel files would each
    // see a fresh singleton and connect their own browsers, defeating the
    // purpose. If you go parallel, move the browser handle into
    // globalSetup with an explicit handoff per worker.
    pool: 'forks',
    forks: {singleFork: true},
    fileParallelism: false,
  },
});
