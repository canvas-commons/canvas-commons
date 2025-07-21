import markdown from '@canvas-commons/internal/vite/markdown-literals';
import preact from '@preact/preset-vite';
import {defineConfig} from 'vite';
import ffmpeg from '../ffmpeg/server';
import canvasCommons from '../vite-plugin/src/main';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@canvas-commons/ui',
        replacement: '@canvas-commons/ui/src/main.tsx',
      },
      {
        find: '@canvas-commons/2d/editor',
        replacement: '@canvas-commons/2d/src/editor',
      },
      {
        find: '@canvas-commons/ffmpeg/lib/client',
        replacement: '@canvas-commons/ffmpeg/client',
      },
      {
        find: /@canvas-commons\/2d(\/lib)?/,
        replacement: '@canvas-commons/2d/src/lib',
      },
      {find: '@canvas-commons/core', replacement: '@canvas-commons/core/src'},
    ],
  },
  plugins: [
    markdown(),
    preact({
      include: [
        /packages\/ui\/src\/(.*)\.tsx?$/,
        /packages\/2d\/src\/editor\/(.*)\.tsx?$/,
      ],
    }),
    canvasCommons({
      buildForEditor: true,
    }),
    ffmpeg(),
  ],
  build: {
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
