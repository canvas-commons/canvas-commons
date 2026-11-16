import {decibelsToAmplitude} from './decibelsToAmplitude';

/**
 * A level that reads as silence without using an unusable negative infinity.
 */
export const SILENCE_DB: number = -80;

/**
 * One change of the audio level.
 */
export interface GainKeyframe {
  /**
   * The frame the keyframe was registered at.
   */
  at: number;
  /**
   * The level the keyframe reaches, in dB.
   */
  gain: number;
  /**
   * Length of the transition in seconds. Zero switches immediately.
   */
  seconds: number;
  /**
   * Whether the transition ends at {@link GainKeyframe.at} instead of starting
   * there.
   */
  backwards: boolean;
  /**
   * The level the transition starts from. Defaults to the level before the
   * keyframe.
   */
  from?: number;
}

/**
 * An audio source with a base level and its keyframes.
 */
export interface GainSource {
  gain: number;
  envelope: GainKeyframe[];
}

export function keyframeStart(keyframe: GainKeyframe): number {
  return keyframe.backwards ? keyframe.at - keyframe.seconds : keyframe.at;
}

export function keyframeEnd(keyframe: GainKeyframe): number {
  return keyframe.seconds <= 0
    ? keyframeStart(keyframe)
    : keyframeStart(keyframe) + keyframe.seconds;
}

/**
 * The amplitude at a timeline time, evaluated in amplitude space so the same
 * curve is produced by a per-frame update and by an automation ramp.
 *
 * @param source - The source whose keyframes are walked.
 * @param time - The timeline time in seconds.
 */
export function amplitudeAt(source: GainSource, time: number): number {
  const keyframes = [...source.envelope].sort(
    (a, b) => keyframeStart(a) - keyframeStart(b),
  );

  let value = decibelsToAmplitude(source.gain);
  for (let index = 0; index < keyframes.length; index++) {
    const keyframe = keyframes[index];
    const start = keyframeStart(keyframe);
    if (start > time) {
      break;
    }

    const from =
      keyframe.from === undefined ? value : decibelsToAmplitude(keyframe.from);
    const target = decibelsToAmplitude(keyframe.gain);
    const boundary = Math.min(
      keyframes[index + 1] ? keyframeStart(keyframes[index + 1]) : time,
      time,
    );
    const progress =
      keyframe.seconds <= 0
        ? 1
        : Math.min(1, (boundary - start) / keyframe.seconds);

    value = from + (target - from) * progress;
  }

  return value;
}
