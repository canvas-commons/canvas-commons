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

  it('registers nothing without a source', () => {
    const node = (<Video time={3} />) as Video;
    scene.getView().add(node);

    expect(scene.sounds.getSounds()).toHaveLength(0);
  });
});
