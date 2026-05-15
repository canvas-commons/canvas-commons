import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: true,
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
});
