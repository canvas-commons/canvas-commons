import {describe, expect, it} from 'vitest';
import {isSupportedEngineVersion} from '../src/engineVersion';

describe('isSupportedEngineVersion', () => {
  it.each([
    ['0.4.0', false],
    ['0.4.99', false],
    ['0.5.0', true],
    ['0.5.0-beta.1', true],
    ['0.10.2', true],
    ['1.0.0', true],
    ['next', false],
  ])('%s is %s', (version, expected) => {
    expect(isSupportedEngineVersion(version)).toBe(expected);
  });
});
