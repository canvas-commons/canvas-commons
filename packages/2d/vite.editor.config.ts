import preact from '@preact/preset-vite';
import {defineConfig} from 'vite';

export default defineConfig({
  build: {
    outDir: 'editor',
    sourcemap: true,
    minify: false,
    lib: {
      entry: 'src/editor/index.ts',
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'index',
    },
    rollupOptions: {
      external: [/^@canvas-commons/, /^@?preact/],
    },
  },
  plugins: [
    preact(),
    {
      // Consumers of `./editor` load the stylesheet through this import.
      // It adds no line break, so the sourcemap lines stay correct.
      name: 'restore-css-import',
      generateBundle(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type === 'chunk' && file.isEntry) {
            file.code = `import './index.css';${file.code}`;
          }
        }
      },
    },
  ],
});
