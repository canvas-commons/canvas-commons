import preact from '@preact/preset-vite';
import {defineConfig} from 'vite';
import ffmpeg from '../ffmpeg/server';
import canvasCommons from '../vite-plugin/src/main';

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
