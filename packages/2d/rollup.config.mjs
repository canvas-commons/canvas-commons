import typescript from '@canvas-commons/internal/rollup/typescript.mjs';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [
  {
    input: 'src/lib/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      {
        resolveId(id) {
          if (id.startsWith('@canvas-commons/core')) {
            return {
              id: '@canvas-commons/core',
              external: true,
            };
          }
        },
      },
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './src/lib/tsconfig.json',
        compilerOptions: {
          composite: false,
        },
      }),
      terser(),
    ],
  },
];
