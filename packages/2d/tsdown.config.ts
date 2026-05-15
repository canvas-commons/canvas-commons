import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: [
    'src/lib/index.ts',
    'src/lib/jsx-runtime.ts',
    'src/lib/jsx-dev-runtime.ts',
  ],
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: true,
  tsconfig: 'src/lib/tsconfig.build.json',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
  deps: {
    neverBundle: [/^@canvas-commons\//],
  },
});
