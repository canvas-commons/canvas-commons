import {configDefaults, defineConfig} from 'vitest/config';
import base from './vitest.config';

/**
 * The text layout sweeps, oracles and module suites, run apart from the
 * static examples of `test`.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['./src/lib/**/*.sweep.test.*'],
    exclude: configDefaults.exclude,
  },
});
