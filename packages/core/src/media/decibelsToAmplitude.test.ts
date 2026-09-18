import {describe, expect, test} from 'vitest';
import {decibelsToAmplitude} from './decibelsToAmplitude';

describe('decibelsToAmplitude', () => {
  test('0 dB is unity', () => expect(decibelsToAmplitude(0)).toBe(1));
  test('-6 dB is ~0.501x amplitude', () =>
    expect(decibelsToAmplitude(-6)).toBeCloseTo(0.501, 3));
  test('-20 dB is 0.1x amplitude', () =>
    expect(decibelsToAmplitude(-20)).toBeCloseTo(0.1, 6));
});
