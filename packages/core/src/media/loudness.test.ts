import {describe, expect, it} from 'vitest';
import {
  computeNormalizeGainDb,
  measureIntegratedLufs,
  measureLoudPartLufs,
  percentile,
} from './loudness';

function sine(
  frequency: number,
  amplitude: number,
  durationSeconds: number,
  sampleRate: number,
): Float32Array {
  const length = Math.round(durationSeconds * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] =
      amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

function silence(durationSeconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(durationSeconds * sampleRate));
}

describe('measureIntegratedLufs', () => {
  it('measures a full-scale 1kHz sine wave close to -3.01 LUFS', () => {
    const sampleRate = 48000;
    const channel = sine(1000, 1, 5, sampleRate);
    const lufs = measureIntegratedLufs([channel], sampleRate);
    expect(lufs).toBeCloseTo(-3.01, 1);
  });

  it('measures a -6dB sine wave roughly 6dB quieter', () => {
    const sampleRate = 48000;
    const full = measureIntegratedLufs(
      [sine(1000, 1, 5, sampleRate)],
      sampleRate,
    );
    const half = measureIntegratedLufs(
      [sine(1000, 0.5011872336272722, 5, sampleRate)],
      sampleRate,
    );
    expect(full - half).toBeCloseTo(6, 0);
  });

  it('returns -Infinity for silence', () => {
    const sampleRate = 48000;
    expect(measureIntegratedLufs([silence(2, sampleRate)], sampleRate)).toBe(
      -Infinity,
    );
  });

  it('returns -Infinity for empty input', () => {
    expect(measureIntegratedLufs([new Float32Array(0)], 48000)).toBe(-Infinity);
  });

  it('gates out quiet trailing silence from the average', () => {
    const sampleRate = 48000;
    const loud = sine(1000, 1, 3, sampleRate);
    const quiet = silence(10, sampleRate);
    const combined = new Float32Array(loud.length + quiet.length);
    combined.set(loud, 0);
    combined.set(quiet, loud.length);

    const withSilence = measureIntegratedLufs([combined], sampleRate);
    const loudOnly = measureIntegratedLufs([loud], sampleRate);
    expect(withSilence).toBeCloseTo(loudOnly, 0);
  });
});

describe('measureLoudPartLufs', () => {
  it('reflects the loud section, not the quiet average', () => {
    const sampleRate = 48000;
    const loud = sine(1000, 1, 4, sampleRate);
    const quiet = sine(1000, 0.05, 4, sampleRate);
    const combined = new Float32Array(loud.length + quiet.length);
    combined.set(loud, 0);
    combined.set(quiet, loud.length);

    const loudPart = measureLoudPartLufs([combined], sampleRate);
    const integrated = measureIntegratedLufs([combined], sampleRate);
    const loudOnly = measureIntegratedLufs([loud], sampleRate);

    expect(loudPart).toBeGreaterThan(integrated);
    expect(loudPart).toBeCloseTo(loudOnly, 0);
  });
});

describe('percentile', () => {
  it('returns the exact value for p=0 and p=100', () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(5);
  });

  it('interpolates between values', () => {
    expect(percentile([0, 10], 50)).toBe(5);
  });

  it('handles a single value', () => {
    expect(percentile([7], 50)).toBe(7);
  });

  it('returns -Infinity for an empty array', () => {
    expect(percentile([], 50)).toBe(-Infinity);
  });
});

describe('computeNormalizeGainDb', () => {
  it('computes the gain needed to reach the target', () => {
    expect(computeNormalizeGainDb(-20, -14)).toBeCloseTo(6, 5);
    expect(computeNormalizeGainDb(-10, -14)).toBeCloseTo(-4, 5);
  });

  it('returns 0 for non-finite measurements', () => {
    expect(computeNormalizeGainDb(-Infinity, -14)).toBe(0);
    expect(computeNormalizeGainDb(NaN, -14)).toBe(0);
  });
});
