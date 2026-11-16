import {
  amplitudeAt,
  decibelsToAmplitude,
  SILENCE_DB,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

describe('Video audio', () => {
  const scene = mockScene2D();

  it('closes the window only when the node leaves the view', () => {
    const node = (
      <Video src={'clip.mp4'} time={12} playbackRate={2} />
    ) as Video;
    const sound = scene.sounds.getSounds()[0];

    expect(sound.element).toBe(true);
    expect(sound.start).toBe(12);
    expect(sound.realPlaybackRate).toBe(2);

    scene.getView().add(node);
    expect(sound.end).toBeUndefined();

    node.remove();
    expect(sound.end).toBe(12);
  });

  it('places a backwards fade so the level is zero at the frame it is called on', () => {
    const node = (<Video src={'clip.mp4'} time={10} />) as Video;
    const entry = scene.sounds.getSounds()[0];

    node.gain(-18).fadeOut(1).fadeIn(2);
    expect(entry.gain).toBe(-18);
    expect(entry.envelope).toEqual([
      {at: 10, gain: SILENCE_DB, seconds: 1, backwards: true, from: undefined},
      {at: 10, gain: -18, seconds: 2, backwards: false, from: SILENCE_DB},
    ]);

    expect(amplitudeAt(entry, 9)).toBeCloseTo(decibelsToAmplitude(-18), 6);
    expect(amplitudeAt(entry, 10)).toBeCloseTo(
      decibelsToAmplitude(SILENCE_DB),
      6,
    );
    expect(amplitudeAt(entry, 11)).toBeCloseTo(
      (decibelsToAmplitude(SILENCE_DB) + decibelsToAmplitude(-18)) / 2,
      6,
    );
  });

  it('registers nothing without a source', () => {
    const node = (<Video time={3} />) as Video;
    scene.getView().add(node);

    expect(scene.sounds.getSounds()).toHaveLength(0);
  });
});
