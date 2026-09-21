declare module 'jest-image-snapshot' {
  import type {MatcherResult} from 'vitest';

  const toMatchImageSnapshot: (
    this: unknown,
    received: unknown,
    ...args: unknown[]
  ) => MatcherResult;
  export {toMatchImageSnapshot};
}
