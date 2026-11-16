import {describe, expect, it} from 'vitest';
import {decibelsToAmplitude} from './decibelsToAmplitude';
import {amplitudeAt, SILENCE_DB, type GainSource} from './gain_envelope';

const BASE: GainSource = {gain: -20, envelope: []};

describe('gain envelope', () => {
  it('uses the base level without keyframes', () => {
    expect(amplitudeAt(BASE, 5)).toBeCloseTo(decibelsToAmplitude(-20), 6);
  });

  it('ramps forwards from the frame the keyframe is registered at', () => {
    const fadeIn: GainSource = {
      gain: -24,
      envelope: [
        {
          at: 2,
          gain: -24,
          seconds: 2,
          backwards: false,
          from: SILENCE_DB,
        },
      ],
    };

    expect(amplitudeAt(fadeIn, 2)).toBeCloseTo(decibelsToAmplitude(-80), 6);
    expect(amplitudeAt(fadeIn, 3)).toBeCloseTo(
      (decibelsToAmplitude(-80) + decibelsToAmplitude(-24)) / 2,
      6,
    );
    expect(amplitudeAt(fadeIn, 4)).toBeCloseTo(decibelsToAmplitude(-24), 6);
  });

  it('ramps backwards so the level is reached at the registered frame', () => {
    const fadeOut: GainSource = {
      gain: -18,
      envelope: [{at: 10, gain: SILENCE_DB, seconds: 1, backwards: true}],
    };

    expect(amplitudeAt(fadeOut, 9)).toBeCloseTo(decibelsToAmplitude(-18), 6);
    expect(amplitudeAt(fadeOut, 9.5)).toBeCloseTo(
      (decibelsToAmplitude(-18) + decibelsToAmplitude(-80)) / 2,
      6,
    );
    expect(amplitudeAt(fadeOut, 10)).toBeCloseTo(
      decibelsToAmplitude(SILENCE_DB),
      6,
    );
    expect(amplitudeAt(fadeOut, 11)).toBeCloseTo(
      decibelsToAmplitude(SILENCE_DB),
      6,
    );
  });

  it('switches immediately with a zero length keyframe', () => {
    const holdSource: GainSource = {
      gain: -20,
      envelope: [{at: 3, gain: -12, seconds: 0, backwards: false}],
    };

    expect(amplitudeAt(holdSource, 2.9)).toBeCloseTo(
      decibelsToAmplitude(-20),
      6,
    );
    expect(amplitudeAt(holdSource, 3)).toBeCloseTo(decibelsToAmplitude(-12), 6);
  });

  it('keeps keyframes in region order when they are added out of order', () => {
    const duck: GainSource = {
      gain: -24,
      envelope: [
        {at: 8, gain: -30, seconds: 1, backwards: true},
        {at: 5, gain: -12, seconds: 1, backwards: false},
      ],
    };

    expect(amplitudeAt(duck, 4)).toBeCloseTo(decibelsToAmplitude(-24), 6);
    expect(amplitudeAt(duck, 6)).toBeCloseTo(decibelsToAmplitude(-12), 6);
    expect(amplitudeAt(duck, 7.5)).toBeCloseTo(
      (decibelsToAmplitude(-12) + decibelsToAmplitude(-30)) / 2,
      6,
    );
    expect(amplitudeAt(duck, 8)).toBeCloseTo(decibelsToAmplitude(-30), 6);
  });
});
