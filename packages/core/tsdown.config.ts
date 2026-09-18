import {defineConfig} from 'tsdown';

export default defineConfig(inlineConfig => [
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    dts: true,
    sourcemap: true,
    target: 'es2022',
    clean: !inlineConfig.watch,
    tsconfig: 'tsconfig.build.json',
    outExtensions: () => ({js: '.js', dts: '.d.ts'}),
  },
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: 'esm',
    dts: false,
    sourcemap: true,
    target: 'es2022',
    clean: !inlineConfig.watch,
    minify: true,
    tsconfig: 'tsconfig.build.json',
    outExtensions: () => ({js: '.js'}),
  },
]);
