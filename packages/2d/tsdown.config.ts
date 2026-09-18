import {defineConfig} from 'tsdown';

export default defineConfig(inlineConfig => [
  {
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
    clean: !inlineConfig.watch,
    tsconfig: 'src/lib/tsconfig.build.json',
    outExtensions: () => ({js: '.js', dts: '.d.ts'}),
    deps: {
      neverBundle: [/^@canvas-commons\//],
    },
  },
  {
    entry: ['src/lib/index.ts'],
    outDir: 'dist',
    format: 'esm',
    dts: false,
    sourcemap: true,
    target: 'es2022',
    clean: !inlineConfig.watch,
    minify: true,
    tsconfig: 'src/lib/tsconfig.build.json',
    outExtensions: () => ({js: '.js'}),
    deps: {
      neverBundle: [/^@canvas-commons\//],
    },
  },
]);
