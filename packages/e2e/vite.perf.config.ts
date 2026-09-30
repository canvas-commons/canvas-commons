import {configDefaults} from 'vitest/config';
import base from './vite.config.ts';

export default {
  ...base,
  test: {
    ...base.test,
    include: ['src/perf/**/*.test.ts'],
    exclude: configDefaults.exclude,
  },
};
