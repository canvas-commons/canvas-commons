import preact from '@preact/preset-vite';
import * as fs from 'fs';
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  resolve: {
    alias: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '@canvas-commons/ui': '/src/main.tsx',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '@canvas-commons/2d/editor': '@canvas-commons/2d/src/editor',
    },
  },
  build: {
    lib: {
      entry: 'src/main.tsx',
      formats: ['es'],
      fileName: 'main',
    },
    rollupOptions: {
      external: [/^@canvas-commons\/core/, /^@?preact/],
    },
  },
  plugins: [
    preact(),
    dts({
      rollupTypes: true,
    }),
    {
      name: 'copy-files',
      async buildStart() {
        this.emitFile({
          type: 'asset',
          fileName: 'editor.html',
          source: await fs.promises.readFile('./editor.html'),
        });
      },
    },
  ],
});
