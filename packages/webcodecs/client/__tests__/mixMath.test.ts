import {describe, expect, test} from 'vitest';
import {
  dbToGain,
  playDuration,
  sourceOffset,
  startWhen,
  totalLengthSamples,
} from '../mixMath';

describe('dbToGain', () => {
  test('0 dB is unity', () => expect(dbToGain(0)).toBe(1));
  test('+6 dB ≈ 2x amplitude', () => expect(dbToGain(6)).toBeCloseTo(1.995, 3));
  test('-6 dB ≈ 0.5x amplitude', () =>
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3));
  test('-20 dB is 0.1x', () => expect(dbToGain(-20)).toBeCloseTo(0.1, 6));
});

describe('sourceOffset (ffmpeg -ss)', () => {
  test('defaults to 0', () => expect(sourceOffset(undefined, 0, 1)).toBe(0));
  test('uses the trim start', () => expect(sourceOffset(2, 0, 1)).toBe(2));
  test('negative offset seeks |offset|*rate into the source', () =>
    expect(sourceOffset(0, -1.5, 2)).toBe(3));
  test('combines trim start and negative offset', () =>
    expect(sourceOffset(1, -2, 1)).toBe(3));
  test('positive offset does not seek', () =>
    expect(sourceOffset(1, 5, 2)).toBe(1));
});

describe('startWhen (ffmpeg adelay)', () => {
  test('positive offset delays', () => expect(startWhen(2.5)).toBe(2.5));
  test('negative offset starts at 0', () => expect(startWhen(-2)).toBe(0));
  test('zero offset starts at 0', () => expect(startWhen(0)).toBe(0));
});

describe('playDuration (ffmpeg atrim)', () => {
  test('plays to the buffer end without a trim end', () =>
    expect(playDuration(undefined, 1, 10)).toBe(9));
  test('respects the trim end (source seconds from srcOffset)', () =>
    expect(playDuration(8, 2, 10)).toBe(6));
  test('never negative', () => expect(playDuration(1, 5, 10)).toBe(0));
});

describe('totalLengthSamples (ffmpeg -t)', () => {
  test('caps to the video duration in samples', () =>
    expect(totalLengthSamples(120, 60, 48000)).toBe(96000));
  test('rounds partial samples up', () =>
    expect(totalLengthSamples(1, 60, 48000)).toBe(800));
  test('is at least 1 sample', () =>
    expect(totalLengthSamples(0, 60, 48000)).toBe(1));
});
