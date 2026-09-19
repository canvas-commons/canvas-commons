import {defineConfig} from 'tsdown';

const Common = defineConfig({
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
});

export default defineConfig([
  {
    ...Common,
    clean: true,
    entry: [
      'src/build-vendor.ts',
      'src/cli.ts',
      'src/compiler.ts',
      'src/editor.ts',
      'src/harness.ts',
      'src/host.ts',
      'src/manifest.ts',
      'src/protocol.ts',
      'src/snippets.ts',
      'src/worker.ts',
    ],
    deps: {
      neverBundle: [/^@canvas-commons\//],
    },
  },
  {
    ...Common,
    entry: ['src/ts-worker.ts'],
    platform: 'browser',
    deps: {
      alwaysBundle: (id, importer) =>
        (id === 'typescript' || id === '@typescript/vfs') &&
        !importer?.endsWith('.d.ts'),
      onlyBundle: ['typescript', '@typescript/vfs'],
    },
    /* eslint-disable @typescript-eslint/naming-convention -- bundled Node globals */
    define: {
      'process.browser': 'true',
      __filename: 'undefined',
      __dirname: 'undefined',
    },
    /* eslint-enable @typescript-eslint/naming-convention */
  },
]);
