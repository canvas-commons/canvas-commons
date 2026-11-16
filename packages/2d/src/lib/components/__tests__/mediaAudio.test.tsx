import {describe, expect, it} from 'vitest';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

describe('Video audio', () => {
  const scene = mockScene2D();

  it('registers the media audio for the node window', () => {
    const node = (<Video src={'clip.mp4'} time={12} />) as Video;
    const sound = scene.sounds.getSounds()[0];

    expect(sound.element).toBe(true);
    expect(sound.start).toBe(12);
    expect(sound.end).toBeUndefined();

    node.remove();
    expect(sound.end).toBe(12);
  });

  it('closes the window once, so the out point survives disposal', () => {
    const node = (<Video src={'clip.mp4'} time={5} />) as Video;
    const sound = scene.sounds.getSounds()[0];

    node.remove();
    expect(sound.end).toBe(5);

    node.dispose();
    expect(sound.end).toBe(5);
  });

  it('registers nothing without a source', () => {
    <Video time={3} />;
    expect(scene.sounds.getSounds()).toHaveLength(0);
  });
});
