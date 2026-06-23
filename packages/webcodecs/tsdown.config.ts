import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['client/index.ts', 'server/index.ts'],
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: true,
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
  deps: {
    neverBundle: [/^@canvas-commons\//],
  },
});
