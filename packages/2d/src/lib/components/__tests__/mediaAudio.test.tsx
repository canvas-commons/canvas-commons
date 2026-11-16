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

  it('anchors keyframes on the frame the call happens on, not the media in point', () => {
    const node = (<Video src={'clip.mp4'} time={10} />) as Video;
    const entry = scene.sounds.getSounds()[0];

    node.gain(-18).fadeOut(1).fadeIn(2);

    expect(scene.playback.time).toBe(0);
    expect(entry.envelope).toEqual([
      {at: 0, gain: SILENCE_DB, seconds: 1, backwards: true, from: undefined},
      {at: 0, gain: -18, seconds: 2, backwards: false, from: SILENCE_DB},
    ]);

    expect(amplitudeAt(entry, -0.5)).toBeCloseTo(
      (decibelsToAmplitude(-18) + decibelsToAmplitude(SILENCE_DB)) / 2,
      6,
    );
    expect(amplitudeAt(entry, 0)).toBeCloseTo(
      decibelsToAmplitude(SILENCE_DB),
      6,
    );
    expect(amplitudeAt(entry, 1)).toBeCloseTo(
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
