import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: true,
  tsconfig: 'tsconfig.build.json',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
});
