import preact from '@preact/preset-vite';
import {defineConfig} from 'vite';
import canvasCommons from '../vite-plugin/src/main';
import webcodecs from '../webcodecs/server';

export default defineConfig({
  plugins: [
    preact({
      include: [
        /packages\/ui\/src\/(.*)\.tsx?$/,
        /packages\/2d\/src\/editor\/(.*)\.tsx?$/,
      ],
    }),
    canvasCommons({
      buildForEditor: true,
    }),
    webcodecs(),
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
