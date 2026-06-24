import canvasCommons from '@canvas-commons/vite-plugin';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    canvasCommons({
      project: [
        './src/quickstart.ts',
        './src/tex.ts',
        './src/tweening-linear.ts',
        './src/tweening-cubic.ts',
        './src/tweening-color.ts',
        './src/tweening-vector.ts',
        './src/tweening-visualiser.ts',
        './src/node-signal.ts',
        './src/code.ts',
        './src/random.ts',
        './src/layout.ts',
        './src/layout-group.ts',
        './src/layout-animations.ts',
        './src/positioning.ts',
        './src/media-image.ts',
        './src/media-video.ts',
        './src/components.ts',
        './src/logging.ts',
        './src/transitions.ts',
        './src/tweening-spring.ts',
        './src/tweening-save-restore.ts',
        './src/presentation.ts',
        './src/text-rendering.ts',
        './src/composite-operations.ts',
        './src/filters-order.ts',
        './src/primitives.ts',
        './src/text.ts',
        './src/text-split.ts',
        './src/text-path.ts',
        './src/paths.ts',
        './src/img.ts',
        './src/svg.ts',
        './src/shadow.ts',
        './src/clip.ts',
      ],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        dir: '../docs/static/examples',
        // The docs expect .js files to be directly in examples/ rather than examples/src/.
        entryFileNames: chunk => `${path.basename(chunk.name, '.ts')}.js`,
      },
    },
  },
});
